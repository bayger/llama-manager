import type { Terminal } from "terminal-kit";
import { themeColors, fg, termHeight, termWidth } from "../lib/theme.js";
import { loadConfig } from "../lib/config.js";
import { taskStore } from "../lib/tasks.js";
import { Control } from "./ui/Control.js";
import { focusManager } from "./ui/FocusManager.js";
import type { RenderContext } from "./ui/types.js";
import { Framebuffer } from "../lib/framebuffer.js";
import { FramebufferCanvas } from "../lib/framebuffer-canvas.js";
import { diffToTerminal } from "../lib/framebuffer-diff.js";

// Tab imports
import { createServerTab } from "./tabs/ServerTab.js";
import { createTasksTab } from "./tabs/TasksTab.js";
import { createVersionsTab } from "./tabs/VersionsTab.js";
import { createDashboardTab } from "./tabs/DashboardTab.js";
import { createModelsTab } from "./tabs/ModelsTab.js";
import { createOptionsTab } from "./tabs/OptionsTab.js";
import type { TabContext } from "../lib/tabcontext.js";

const TABS = ["Dashboard", "Profiles", "Tasks", "Versions", "Models", "Options"] as const;
type TabId = (typeof TABS)[number];

interface TabModule {
  render(): void;
  handleKey(key: string): boolean;
  dispose?(): void;
}

interface TabEntry {
  legacy: TabModule;
  control: Control | null;
}

interface AppState {
  activeTab: TabId;
  message: string | null;
  messageTimer: ReturnType<typeof setTimeout> | null;
  textInputFocused: boolean;
  helpOverlayVisible: boolean;
  config: any;
}

export class App {
  term: Terminal;
  state: AppState;
  private keyHandler: ((name: string, matches: string[], data: any) => void) | null = null;
  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  private _ctx: TabContext | null = null;
  private _renderContext: RenderContext | null = null;
  private _tabs: Record<TabId, TabEntry> | null = null;
  private dirty = { tabbar: false, content: false, statusbar: false };
  private _fb: Framebuffer | null = null;
  private _canvas: FramebufferCanvas | null = null;
  private _firstRender = true;

  constructor(term: Terminal) {
    this.term = term;
    this.state = {
      activeTab: "Dashboard",
      message: null,
      messageTimer: null,
      textInputFocused: false,
      helpOverlayVisible: false,
      config: null,
    };
  }

  private get tabs(): Record<TabId, TabEntry> {
    if (!this._tabs) throw new Error("tabs not initialized");
    return this._tabs;
  }

  private get renderContext(): RenderContext {
    if (!this._renderContext) throw new Error("renderContext not initialized");
    return this._renderContext;
  }

  private getActiveControl(): Control | null {
    const entry = this.tabs[this.state.activeTab];
    return entry.control || null;
  }

  async start(): Promise<void> {
    await loadConfig().then((config) => {
      this.state.config = config;
      taskStore.init(config);
    });

    this._fb = new Framebuffer();
    this._fb.resize(termWidth(this.term), termHeight(this.term));
    this._fb.clearFront();

    this._canvas = new FramebufferCanvas(this._fb, this.term);

    this._ctx = {
      term: this.term,
      canvas: this._canvas,
      scheduleRender: () => this.scheduleRender(),
      showMessage: (msg: string) => this.showMessage(msg),
      setTextInputFocused: (focused: boolean) => this.setTextInputFocused(focused),
      getConfig: () => this.state.config,
      setConfig: (config: any) => { this.state.config = config; },
    };

    this._renderContext = {
      term: this.term,
      canvas: this._canvas,
      scheduleRender: () => this.scheduleRender(),
      showMessage: (msg: string) => this.showMessage(msg),
      getConfig: () => this.state.config,
    };

    const factoryFns: Record<TabId, (ctx: TabContext) => TabModule | Control> = {
      Profiles: createServerTab,
      Tasks: createTasksTab,
      Versions: createVersionsTab,
      Models: createModelsTab,
      Dashboard: createDashboardTab,
      Options: createOptionsTab,
    };

    this._tabs = {} as Record<TabId, TabEntry>;
    for (const tabId of TABS) {
      const instance = factoryFns[tabId](this._ctx);
      const isControl = instance instanceof Control;
      this._tabs[tabId] = {
        legacy: isControl ? this._wrapControl(instance) : instance,
        control: isControl ? instance : null,
      };
    }

    this.setupKeyHandler();
    this.render();

    const initialControl = this.getActiveControl();
    if (initialControl) {
      focusManager.setRoot(initialControl);
      focusManager.focusFirst();
    }
  }

  private _wrapControl(control: Control): TabModule {
    return {
      render: () => control.render(),
      handleKey: (key: string) => focusManager.handleKey(key),
      dispose: () => control.detach(),
    };
  }

  setActiveTab(tab: TabId): void {
    const prevControl = this.getActiveControl();
    if (prevControl) {
      focusManager.clear();
    }

    this.state.activeTab = tab;
    this.dirty.tabbar = true;
    this.dirty.content = true;
    this.dirty.statusbar = true;
    this.render();

    const newControl = this.getActiveControl();
    if (newControl) {
      focusManager.setRoot(newControl);
      focusManager.focusFirst();
    }
  }

  showMessage(msg: string): void {
    if (this.state.messageTimer) {
      clearTimeout(this.state.messageTimer);
    }
    this.state.message = msg;
    this.state.messageTimer = setTimeout(() => {
      this.state.message = null;
      this.state.messageTimer = null;
      this.dirty.statusbar = true;
      this.render();
    }, 3000);
    this.dirty.statusbar = true;
    this.render();
  }

  setTextInputFocused(focused: boolean): void {
    this.state.textInputFocused = focused;
    focusManager.activateTextInput(focused);
  }

  scheduleRender(): void {
    this.dirty.content = true;
    if (this.renderTimer) return;
    this.renderTimer = setTimeout(() => {
      this.renderTimer = null;
      this.render();
    }, 0);
  }

  render(): void {
    const { term } = this;
    const fb = this._fb!;
    const canvas = this._canvas!;
    const { activeTab, message } = this.state;
    const width = termWidth(term);
    const height = termHeight(term);

    // Resize if needed
    fb.resize(width, height);

    // First render: clear full screen
    if (this._firstRender) {
      fb.clearFront();
      this._firstRender = false;
      this.dirty.tabbar = true;
      this.dirty.content = true;
      this.dirty.statusbar = true;
    }

    // Swap buffers (old front becomes back for diff)
    fb.swap();
    // Copy previous frame into new front so clean regions carry over
    fb.copyRegion(fb.back, 0, 0, width, height, 0, 0);

    // --- Tab bar (row 1-2) ---
    if (this.dirty.tabbar) {
      // Clear row 1 before rendering tabs so leftover characters don't remain
      canvas.moveTo(1, 1);
      canvas.eraseLine();
      this.renderTabs(TABS.indexOf(activeTab), width, canvas);
    }

    // --- Content area (row 3 to height-1) ---
    if (this.dirty.content) {
      if (this.state.helpOverlayVisible) {
        this.renderHelpOverlay(width, height, canvas);
      } else {
        const control = this.getActiveControl();
        if (control) {
          control.attach(this.renderContext);
          control.layout({ x: 1, y: 3, width: width, height: height - 4 });
          control.render();
        } else {
          canvas.moveTo(1, 3);
          this.tabs[activeTab].legacy.render();
        }
      }
    }

    // --- Status bar (last row) ---
    if (this.dirty.statusbar) {
      canvas.moveTo(1, height);
      canvas.eraseLine();
      if (message) {
        fg(canvas, themeColors.success, message);
        fg(canvas, themeColors.textMuted, ` | ? help`);
      } else {
        fg(canvas, themeColors.textMuted, `${activeTab} | F1-F6 navigate | q quit | ? help`);
      }
    }

    // Diff front vs back and emit ANSI to terminal
    diffToTerminal(fb.back, fb.front, term, width, height);

    this.dirty.tabbar = false;
    this.dirty.content = false;
    this.dirty.statusbar = false;
  }

  private renderHelpOverlay(width: number, height: number, canvas: FramebufferCanvas): void {
    const overlayY = 3;
    const overlayHeight = height - 4;

    const helpSections = [
      {
        title: 'Navigation',
        keys: [
          ['F1-F6', 'Switch tabs'],
          ['Tab / Shift+Tab', 'Move focus'],
          ['Enter', 'Confirm / select'],
          ['Esc', 'Cancel / go back'],
        ],
      },
      {
        title: 'Actions',
        keys: [
          ['?', 'Toggle help'],
          ['q', 'Quit application'],
        ],
      },
      {
        title: 'Tab Shortcuts',
        keys: [
          ['F1', 'Dashboard — metrics and server control'],
          ['F2', 'Profiles — preset editing and management'],
          ['F3', 'Tasks — inference task history'],
          ['F4', 'Versions — install and switch llama.cpp builds'],
          ['F5', 'Models — browse, download, and manage GGUF models'],
          ['F6', 'Options — global application settings'],
        ],
      },
    ];

    const contentLines: { text: string; key: string; desc: string; isTitle: boolean; isHeader: boolean }[] = [];
    contentLines.push({ text: '  KEYBOARD SHORTCUTS', key: '', desc: '', isTitle: true, isHeader: false });
    contentLines.push({ text: '', key: '', desc: '', isTitle: false, isHeader: false });

    for (const section of helpSections) {
      contentLines.push({ text: `  ${section.title}`, key: '', desc: '', isTitle: false, isHeader: true });
      for (const [key, desc] of section.keys) {
        contentLines.push({ text: `    ${key.padEnd(22)}     ${desc}`, key, desc, isTitle: false, isHeader: false });
      }
      contentLines.push({ text: '', key: '', desc: '', isTitle: false, isHeader: false });
    }

    const contentHeight = contentLines.length;
    const startY = overlayY + Math.max(1, Math.floor((overlayHeight - contentHeight) / 2));

    for (let y = overlayY; y < height; y++) {
      canvas.moveTo(1, y);
      canvas.bgColorRgbHex(themeColors.canvasSubtle);
      canvas.colorRgbHex(themeColors.canvasSubtle);
      canvas.write(' '.repeat(width));
      canvas.styleReset();
    }

    for (let i = 0; i < overlayHeight && i < contentLines.length; i++) {
      const line = contentLines[i]!;
      const y = startY + i;
      canvas.moveTo(1, y);
      canvas.bgColorRgbHex(themeColors.canvasSubtle);

      if (line.isTitle) {
        canvas.colorRgbHex(themeColors.accent).write(line.text);
      } else if (line.isHeader) {
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

  private renderTabs(selectedIndex: number, width: number, canvas: FramebufferCanvas): void {
    // Row 1: tab labels
    canvas.moveTo(1, 1);

    const labels: string[] = [];
    const positions: { start: number; end: number }[] = [];
    let offset = 0;

    for (let i = 0; i < TABS.length; i++) {
      const label = `F${i + 1} ${TABS[i]}`;
      positions.push({ start: offset, end: offset + label.length });
      labels.push(label);
      offset += label.length + 2;
    }

    for (let i = 0; i < labels.length; i++) {
      if (i === selectedIndex) {
        fg(canvas, themeColors.textMuted, `F${i + 1}`);
        canvas.bold();
        fg(canvas, themeColors.accent, ` ${TABS[i]}`);
        canvas.styleReset();
      } else {
        fg(canvas, themeColors.border, `F${i + 1}`);
        fg(canvas, themeColors.textMuted, ` ${TABS[i]}`);
      }
      if (i < labels.length - 1) {
        canvas.write('  ');
      }
    }

    // Row 2: active tab underline
    canvas.moveTo(1, 2);
    canvas.eraseLine();
    let activeStart = 0;
    let activeEnd = 0;
    let pos = 0;
    for (let i = 0; i < TABS.length; i++) {
      const label = `F${i + 1} ${TABS[i]}`;
      if (i === selectedIndex) {
        activeStart = pos;
        activeEnd = pos + label.length;
      }
      pos += label.length + 2;
    }

    for (let i = 0; i < width; i++) {
      const color = i >= activeStart && i < activeEnd ? themeColors.accent : themeColors.border;
      fg(canvas, color, '\u2501');
    }
  }

  private setupKeyHandler(): void {
    this.keyHandler = (name: string, _matches: string[], data: any) => {
      const textActive = focusManager.isTextInputActive();

      if (name === 'CTRL_C') {
        this.dispose();
        this.term.grabInput(false);
        this.term.fullscreen(false);
        this.term.styleReset();
        process.exit(0);
        return;
      }

      if (name === 'q' && !textActive) {
        this.dispose();
        this.term.grabInput(false);
        this.term.fullscreen(false);
        this.term.styleReset();
        process.exit(0);
        return;
      }

      if (textActive) {
        const control = this.getActiveControl();
        if (control) {
          focusManager.handleKey(name);
        }
        return;
      }

      if (name.startsWith('F') && !name.startsWith('F1')) {
        const num = parseInt(name.slice(1), 10);
        if (num >= 1 && num <= 6) {
          this.setActiveTab(TABS[num - 1]);
          return;
        }
      }
      if (name === 'F1') {
        this.setActiveTab(TABS[0]);
        return;
      }

      if (name === '?') {
        this.state.helpOverlayVisible = !this.state.helpOverlayVisible;
        this.dirty.content = true;
        this.render();
        return;
      }

      if (this.state.helpOverlayVisible) {
        if (name === '?' || name === 'Escape') {
          this.state.helpOverlayVisible = false;
          this.dirty.content = true;
          this.render();
          return;
        }
        return;
      }

      const control = this.getActiveControl();
      if (control) {
        focusManager.handleKey(name);
      } else {
        this.tabs[this.state.activeTab].legacy.handleKey(name);
      }
    };

    this.term.on('key', this.keyHandler);

    // Mouse handling
    const mouseHandler = (_data: any) => {
      const nx = (_data as any).nx;
      const ny = (_data as any).ny;
      const button = (_data as any).button;
      if (button === 0 && typeof nx === 'number' && typeof ny === 'number') {
        focusManager.handleMouse({ x: nx + 1, y: ny + 1 });
      }
    };
    (this.term as any).on('mouse', mouseHandler);
    (this._ctx as any).mouseHandler = mouseHandler;
  }

  dispose(): void {
    if (this.keyHandler) {
      this.term.removeListener('key', this.keyHandler);
      this.keyHandler = null;
    }
    const mouseHandler = (this._ctx as any).mouseHandler;
    if (mouseHandler) {
      (this.term as any).removeListener('mouse', mouseHandler);
      (this._ctx as any).mouseHandler = null;
    }
    if (this.state.messageTimer) {
      clearTimeout(this.state.messageTimer);
      this.state.messageTimer = null;
    }
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    focusManager.clear();
    if (this._tabs) {
      for (const entry of Object.values(this._tabs)) {
        if (entry.control) {
          entry.control.detach();
        } else if (entry.legacy.dispose) {
          entry.legacy.dispose();
        }
      }
    }
    taskStore.dispose();
  }
}
