import type { Terminal } from "terminal-kit";
import { themeColors } from "../lib/theme.js";
import { loadConfig } from "../lib/config.js";
import { taskStore } from "../lib/tasks.js";
import { focusManager } from "./ui/FocusManager.js";
import type { RenderContext } from "./ui/types.js";
import type { TabContext } from "../lib/tabcontext.js";
import { Framebuffer } from "../lib/framebuffer.js";
import { FramebufferCanvas } from "../lib/framebuffer-canvas.js";
import { diffToTerminal } from "../lib/framebuffer-diff.js";
import { MainControl, TABS } from "./MainControl.js";
import type { TabId } from "./MainControl.js";

const CURSOR_SHOW = "\x1b[?25h";
const CURSOR_HIDE = "\x1b[?25l";

export class App {
  private _fb: Framebuffer | null = null;
  private _canvas: FramebufferCanvas | null = null;
  private _main: MainControl | null = null;
  private _ctx: TabContext | null = null;
  private keyHandler: ((name: string, matches: string[], data: any) => void) | null = null;
  private mouseHandler: ((data: any) => void) | null = null;
  private _renderInterval: ReturnType<typeof setInterval> | null = null;
  private _firstRender = true;
  private helpOverlayVisible = false;

  constructor(public term: Terminal) {}

  async start(): Promise<void> {
    const config = await loadConfig();
    taskStore.init(config);

    this._fb = new Framebuffer();
    this._fb.resize(process.stdout.columns || 80, process.stdout.rows || 24);
    this._fb.clearFront();

    this._canvas = new FramebufferCanvas(this._fb);

    this._ctx = {
      canvas: this._canvas,
      scheduleRender: () => {
        if (this._main) {
          this._main.markDirty();
        }
      },
      showMessage: (msg: string) => this.showMessage(msg),
      setTextInputFocused: (focused: boolean) => this.setTextInputFocused(focused),
      getConfig: () => config,
      setConfig: (c: any) => { /* handled by config module */ },
    };

    this._main = new MainControl(this._ctx, () => this.quit());
    this._main.onInit();

    this.setupKeyHandler();
    focusManager.setRoot(this._main);

    this._renderInterval = setInterval(() => this.render(), 1);
  }

  showMessage(msg: string): void {
    this._main!.showMessage(msg);
  }

  setTextInputFocused(focused: boolean): void {
    focusManager.activateTextInput(focused);
  }

  render(): void {
    const { term } = this;
    const fb = this._fb!;
    const canvas = this._canvas!;
    const main = this._main!;
    const width = process.stdout.columns || 80;
    const height = process.stdout.rows || 24;

    if (!main.needsRender && !this.helpOverlayVisible) return;

    fb.resize(width, height);

    if (this._firstRender) {
      fb.clearFront();
      this._firstRender = false;
    }

    fb.swap();
    fb.copyRegion(fb.back, 0, 0, width, height, 0, 0);

    const renderCtx: RenderContext = this._ctx!;

    if (this.helpOverlayVisible) {
      this.renderHelpOverlay(width, height, canvas);
    } else {
      main.layout({ x: 1, y: 1, width, height });
      main.render(renderCtx);
    }

    diffToTerminal(fb.back, fb.front, (text) => term(text), width, height);

    if (canvas.cursorVisible) {
      term(`\x1b[${canvas.cursorY};${canvas.cursorX}H`);
      term(CURSOR_SHOW);
    } else {
      term(CURSOR_HIDE);
    }
  }

  private renderHelpOverlay(width: number, height: number, canvas: FramebufferCanvas): void {
    const overlayY = 3;
    const overlayHeight = height - 4;

    const helpSections = [
      {
        title: "Navigation",
        keys: [
          ["F1-F6", "Switch tabs"],
          ["Tab / Shift+Tab", "Move focus"],
          ["Enter", "Confirm / select"],
          ["Esc", "Cancel / go back"],
        ],
      },
      {
        title: "Actions",
        keys: [
          ["?", "Toggle help"],
          ["q", "Quit application"],
        ],
      },
      {
        title: "Tab Shortcuts",
        keys: [
          ["F1", "Dashboard — metrics and server control"],
          ["F2", "Profiles — preset editing and management"],
          ["F3", "Tasks — inference task history"],
          ["F4", "Versions — install and switch llama.cpp builds"],
          ["F5", "Models — browse, download, and manage GGUF models"],
          ["F6", "Options — global application settings"],
        ],
      },
    ];

    const contentLines: { text: string; key: string; desc: string; isTitle: boolean; isHeader: boolean }[] = [];
    contentLines.push({ text: "  KEYBOARD SHORTCUTS", key: "", desc: "", isTitle: true, isHeader: false });
    contentLines.push({ text: "", key: "", desc: "", isTitle: false, isHeader: false });

    for (const section of helpSections) {
      contentLines.push({ text: `  ${section.title}`, key: "", desc: "", isTitle: false, isHeader: true });
      for (const [key, desc] of section.keys) {
        contentLines.push({ text: `    ${key.padEnd(22)}     ${desc}`, key, desc, isTitle: false, isHeader: false });
      }
      contentLines.push({ text: "", key: "", desc: "", isTitle: false, isHeader: false });
    }

    const contentHeight = contentLines.length;
    const startY = overlayY + Math.max(1, Math.floor((overlayHeight - contentHeight) / 2));

    for (let y = overlayY; y < height; y++) {
      canvas.moveTo(1, y);
      canvas.bgColorRgbHex(themeColors.canvasSubtle);
      canvas.colorRgbHex(themeColors.canvasSubtle);
      canvas.write(" ".repeat(width));
      canvas.styleReset();
    }

    for (let i = 0; i < overlayHeight && i < contentLines.length; i++) {
      const line = contentLines[i]!;
      const y = startY + i;
      canvas.moveTo(1, y);
      canvas.bgColorRgbHex(themeColors.canvasSubtle);

      if (line.isTitle || line.isHeader) {
        canvas.colorRgbHex(themeColors.accent).write(line.text);
      } else if (line.key) {
        canvas.colorRgbHex(themeColors.textLink).write(`    ${line.key}`);
        canvas.colorRgbHex(themeColors.text).write(`     ${line.desc}`);
      } else {
        canvas.colorRgbHex(themeColors.text).write(line.text);
      }
      canvas.styleReset();
    }
  }

  private setupKeyHandler(): void {
    this.keyHandler = (name: string, _matches: string[], data: any) => {
      const textActive = focusManager.isTextInputActive();

      if (name === "?" && !textActive) {
        this.helpOverlayVisible = !this.helpOverlayVisible;
        if (this._main) {
          this._main.markDirty();
        }
        return;
      }

      if (this.helpOverlayVisible) {
        if (name === "?" || name === "Escape") {
          this.helpOverlayVisible = false;
          if (this._main) {
            this._main.markDirty();
          }
        }
        return;
      }

      focusManager.handleKey(name);
    };

    this.term.on("key", this.keyHandler);

    this.mouseHandler = (data: any) => {
      const nx = (data as any).nx;
      const ny = (data as any).ny;
      const button = (data as any).button;
      if (button === 0 && typeof nx === "number" && typeof ny === "number") {
        focusManager.handleMouse({ x: nx + 1, y: ny + 1 });
      }
    };
    (this.term as any).on("mouse", this.mouseHandler);
  }

  private quit(): void {
    this.dispose();
    this.term.grabInput(false);
    this.term.fullscreen(false);
    this.term.styleReset();
    process.exit(0);
  }

  dispose(): void {
    if (this._renderInterval) {
      clearInterval(this._renderInterval);
      this._renderInterval = null;
    }
    if (this.keyHandler) {
      this.term.removeListener("key", this.keyHandler);
      this.keyHandler = null;
    }
    if (this.mouseHandler) {
      (this.term as any).removeListener("mouse", this.mouseHandler);
      this.mouseHandler = null;
    }
    focusManager.clear();
    this._main?.onDestroy();
    taskStore.dispose();
  }
}
