import type { Terminal } from "terminal-kit";
import { setActiveTheme, popThemeChanged, fg, fgBg } from "../lib/theme";
import { loadConfig, ConfigData } from "../lib/config";
import { taskStore } from "../lib/tasks";
import { focusManager } from "./ui/FocusManager";
import { stopServer, setMaxLogLines } from "../lib/server";
import type { RenderContext } from "./ui/types";
import type { TabContext } from "../lib/tabcontext";
import { Framebuffer } from "../lib/framebuffer";
import { FramebufferCanvas } from "../lib/framebuffer-canvas";
import { diffToTerminal } from "../lib/framebuffer-diff";
import { MainControl, TABS } from "./MainControl";
import type { TabId } from "./MainControl";

const CURSOR_SHOW = "\x1b[?25h";
const CURSOR_HIDE = "\x1b[?25l";

export class App {
  private _fb: Framebuffer | null = null;
  private _canvas: FramebufferCanvas | null = null;
  private _main: MainControl | null = null;
  private _ctx: TabContext | null = null;
  private keyHandler: ((name: string, matches: string[], data: any) => void) | null = null;
  private mouseHandler: ((action: string, data: any) => void) | null = null;
  private resizeHandler: (() => void) | null = null;
  private _resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private _renderInterval: ReturnType<typeof setInterval> | null = null;
  private _firstRender = true;
  private helpOverlayVisible = false;

  constructor(public term: Terminal) {}

  async start(): Promise<void> {
    const config = await loadConfig();
    setActiveTheme(config.themeName);
    setMaxLogLines(config.logs.maxLogLines);
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
      forceRender: () => this.forceRender(),
      getConfig: () => config,
      setConfig: (c: ConfigData) => {
        Object.assign(config, c);
        if (c.logs?.maxLogLines !== undefined) setMaxLogLines(c.logs.maxLogLines);
      },
      showCursor: () => {
        if (this._canvas) {
          this._canvas.showTerminalCursor();
        }
      },
    };

    this._main = new MainControl(this._ctx, () => this.quit());
    this._main.onInit();

    this.setupKeyHandler();
    this.setupResizeHandler();
    focusManager.setRoot(this._main);

    this._renderInterval = setInterval(() => this.render(), 1);
  }

  showMessage(msg: string): void {
    this._main!.showMessage(msg);
  }

  setTextInputFocused(focused: boolean): void {
    focusManager.activateTextInput(focused);
  }

  forceRender(): void {
    if (this._main) {
      this._main.markAllDirty();
    }
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
    if (popThemeChanged()) {
      fb.clearFront();
    } else {
      fb.copyRegion(fb.back, 0, 0, width, height, 0, 0);
    }

    canvas.hideTerminalCursor();

    const renderCtx: RenderContext = this._ctx!;

    if (this.helpOverlayVisible) {
      this.renderHelpOverlay(width, height, canvas);
    } else {
      main.layout({ x: 1, y: 1, width, height });
      main.render(renderCtx);
    }

    term(CURSOR_HIDE);
    diffToTerminal(fb.back, fb.front, (text) => term(text), width, height);

    term(`\x1b[${canvas.terminalCursorY};${canvas.terminalCursorX}H`);
    if (canvas.terminalCursorVisible) {
      term(CURSOR_SHOW);
    }
  }

  private renderHelpOverlay(width: number, height: number, canvas: FramebufferCanvas): void {
    const overlayY = 3;
    const overlayHeight = height - 4;

    const helpSections = [
      {
        title: "Navigation",
        keys: [
          ["F1-F7", "Switch tabs"],
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
          ["F1", "Dashboard - metrics and server control"],
          ["F2", "Logs - live server log viewer"],
          ["F3", "Tasks - inference task history"],
          ["F4", "Profiles - preset editing and management"],
          ["F5", "Versions - install and switch llama.cpp builds"],
          ["F6", "Models - browse, download, and manage GGUF models"],
          ["F7", "Options - global application settings"],
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

    canvas.setForegroundColor("canvas");
    canvas.setBackgroundColor("canvasSubtle");
    canvas.clearRect(1, overlayY, width, height - overlayY);

    for (let i = 0; i < overlayHeight && i < contentLines.length; i++) {
      const line = contentLines[i]!;
      const y = startY + i;
      canvas.moveTo(1, y);

      if (line.isTitle) {
        fg(canvas, "accent", line.text);
      } else if (line.isHeader) {
        fg(canvas, "accentColor", line.text);
      } else if (line.key) {
        fg(canvas, "accent", `    ${line.key}`);
        fg(canvas, "text", `     ${line.desc}`);
      } else {
        fg(canvas, "canvasSubtle", line.text);
      }
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

    this.mouseHandler = (action: string, data: any) => {
      if (typeof data?.x !== "number" || typeof data?.y !== "number") return;
      const point = { x: data.x, y: data.y };
      if (action === "MOUSE_LEFT_BUTTON_PRESSED") {
        focusManager.handleMouseDown(point);
      } else if (action === "MOUSE_LEFT_BUTTON_RELEASED") {
        focusManager.handleMouseUp(point);
      }
    };
    (this.term as any).on("mouse", this.mouseHandler);
  }

  private setupResizeHandler(): void {
    this.resizeHandler = () => {
      if (this._resizeTimer) clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => {
        if (this._main) {
          this._main.markDirty();
        }
        this._resizeTimer = null;
      }, 100);
    };
    this.term.on("resize", this.resizeHandler);
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
    if (this.resizeHandler) {
      this.term.removeListener("resize", this.resizeHandler);
      this.resizeHandler = null;
    }
    if (this._resizeTimer) {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = null;
    }
    focusManager.clear();
    this._main?.onDestroy();
    taskStore.dispose();
    this.term(CURSOR_SHOW);
    const cfg = this._ctx?.getConfig();
    if (cfg?.dashboard.killServerOnExit) {
      stopServer().catch(() => {});
    }
  }
}
