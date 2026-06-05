import type { Terminal } from "terminal-kit";
import { themeColors, fg, termHeight, termWidth } from "../lib/theme.js";
import { loadConfig } from "../lib/config.js";
import { taskStore } from "../lib/tasks.js";

// Tab imports
import { createServerTab } from "./tabs/ServerTab.js";
import { createTasksTab } from "./tabs/TasksTab.js";
import { createVersionsTab } from "./tabs/VersionsTab.js";
import { createDashboardTab } from "./tabs/DashboardTab.js";
import { createModelsTab } from "./tabs/ModelsTab.js";
import { createLiveLogsTab } from "./tabs/LiveLogsTab.js";
import { createOptionsTab } from "./tabs/OptionsTab.js";
import type { TabContext } from "../lib/tabcontext.js";

const TABS = ["Dashboard", "Profiles", "Tasks", "Versions", "Models", "Logs", "Options"] as const;
type TabId = (typeof TABS)[number];

interface TabModule {
  render(): void;
  handleKey(key: string): boolean;
  dispose?(): void;
}

interface AppState {
  activeTab: TabId;
  message: string | null;
  messageTimer: ReturnType<typeof setTimeout> | null;
  textInputFocused: boolean;
  config: any;
}

export class App {
  term: Terminal;
  state: AppState;
  private keyHandler: ((name: string, matches: string[], data: any) => void) | null = null;
  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  private _ctx: TabContext | null = null;
  private _tabModules: Record<TabId, TabModule> | null = null;
  private dirty = { tabbar: false, content: false, statusbar: false };

  constructor(term: Terminal) {
    this.term = term;
    this.state = {
      activeTab: "Dashboard",
      message: null,
      messageTimer: null,
      textInputFocused: false,
      config: null,
    };
  }

  private get tabModules(): Record<TabId, TabModule> {
    if (!this._tabModules) throw new Error("tabModules not initialized");
    return this._tabModules;
  }

  async start(): Promise<void> {
    await loadConfig().then((config) => {
      this.state.config = config;
      taskStore.init(config);
    });

    this._ctx = {
      term: this.term,
      scheduleRender: () => this.scheduleRender(),
      showMessage: (msg: string) => this.showMessage(msg),
      setTextInputFocused: (focused: boolean) => this.setTextInputFocused(focused),
      getConfig: () => this.state.config,
    };

    this._tabModules = {
      Profiles: createServerTab(this._ctx),
      Tasks: createTasksTab(this._ctx),
      Versions: createVersionsTab(this._ctx),
      Models: createModelsTab(this._ctx),
      Dashboard: createDashboardTab(this._ctx),
      Logs: createLiveLogsTab(this._ctx),
      Options: createOptionsTab(this._ctx),
    };

    this.setupKeyHandler();
    this.render();
  }

  setActiveTab(tab: TabId): void {
    this.state.activeTab = tab;
    this.dirty.tabbar = true;
    this.dirty.content = true;
    this.dirty.statusbar = true;
    this.render();
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
    const { activeTab, message } = this.state;
    const width = termWidth(term);
    const height = termHeight(term);

    // First render: clear full screen
    if (!this.dirty.tabbar && !this.dirty.content && !this.dirty.statusbar) {
      term.moveTo(1, 1);
      term('\x1b[0J');
      this.dirty.tabbar = true;
      this.dirty.content = true;
      this.dirty.statusbar = true;
    }

    // --- Tab bar (row 1-2) ---
    if (this.dirty.tabbar) {
      this.renderTabs(TABS.indexOf(activeTab), width);
    }

    // --- Content area (row 3 to height-1) ---
    if (this.dirty.content) {
      if (this.dirty.tabbar) {
        for (let y = 3; y < height; y++) {
          term.moveTo(1, y);
          term.eraseLine();
        }
      }
      term.moveTo(1, 3);
      this.tabModules[activeTab].render();
    }

    // --- Status bar (last row) ---
    if (this.dirty.statusbar) {
      term.moveTo(1, height);
      term.eraseLine();
      if (message) {
        fg(term, themeColors.success, message);
        fg(term, themeColors.textMuted, ` | ? help`);
      } else {
        fg(term, themeColors.textMuted, `${activeTab} | F1-F7 navigate | q quit | ? help`);
      }
    }

    this.dirty.tabbar = false;
    this.dirty.content = false;
    this.dirty.statusbar = false;
  }

  private renderTabs(selectedIndex: number, width: number): void {
    const { term } = this;
    term.moveTo(1, 1);
    term.eraseLine();

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
        fg(term, themeColors.textMuted, `F${i + 1}`);
        term.bold;
        fg(term, themeColors.accent, ` ${TABS[i]}`);
        term.styleReset();
      } else {
        fg(term, themeColors.border, `F${i + 1}`);
        fg(term, themeColors.textMuted, ` ${TABS[i]}`);
      }
      if (i < labels.length - 1) {
        term('  ');
      }
    }

    term.moveTo(1, 2);
    term.eraseLine();
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
      if (i >= activeStart && i < activeEnd) {
        fg(term, themeColors.accent, '\u2550');
      } else {
        fg(term, themeColors.border, '\u2500');
      }
    }
  }

  private setupKeyHandler(): void {
    this.keyHandler = (name: string, _matches: string[], data: any) => {
      if (name === 'CTRL_C') {
        this.dispose();
        this.term.grabInput(false);
        this.term.fullscreen(false);
        this.term.styleReset();
        process.exit(0);
        return;
      }

      if (name === 'q' && !this.state.textInputFocused) {
        this.dispose();
        this.term.grabInput(false);
        this.term.fullscreen(false);
        this.term.styleReset();
        process.exit(0);
        return;
      }

      if (name.startsWith('F') && !name.startsWith('F1')) {
        const num = parseInt(name.slice(1), 10);
        if (num >= 1 && num <= 7) {
          this.setActiveTab(TABS[num - 1]);
          return;
        }
      }
      if (name === 'F1') {
        this.setActiveTab(TABS[0]);
        return;
      }

      if (name === '?' && !this.state.textInputFocused) {
        this.showMessage(`${this.state.activeTab} | F1-F7 navigate | q quit`);
        return;
      }

      if (!this.state.textInputFocused) {
        if (name === 'TAB') {
          const idx = TABS.indexOf(this.state.activeTab);
          if (idx < TABS.length - 1) {
            this.setActiveTab(TABS[idx + 1]);
            return;
          }
        }
        if (name === 'SHIFT_TAB') {
          const idx = TABS.indexOf(this.state.activeTab);
          if (idx > 0) {
            this.setActiveTab(TABS[idx - 1]);
            return;
          }
        }
      }

      const handled = this.tabModules[this.state.activeTab].handleKey(name);
      if (!handled && !this.state.textInputFocused) {
      }
    };

    this.term.on('key', this.keyHandler);
  }

  dispose(): void {
    if (this.keyHandler) {
      this.term.removeListener('key', this.keyHandler);
      this.keyHandler = null;
    }
    if (this.state.messageTimer) {
      clearTimeout(this.state.messageTimer);
      this.state.messageTimer = null;
    }
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    if (this._tabModules) {
      for (const tab of Object.values(this._tabModules)) {
        if (tab.dispose) tab.dispose();
      }
    }
    taskStore.dispose();
  }
}
