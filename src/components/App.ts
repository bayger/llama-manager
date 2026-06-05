import type { Terminal } from "terminal-kit";
import { themeColors, fg, termHeight, termWidth } from "../lib/theme.js";
import { loadConfig } from "../lib/config.js";
import { taskStore } from "../lib/tasks.js";

// Tab imports
import { render as renderServerTab, handleKey as handleServerTabKey, dispose as disposeServerTab } from "./tabs/ServerTab.js";
import { render as renderTasksTab, handleKey as handleTasksTabKey, dispose as disposeTasksTab } from "./tabs/TasksTab.js";
import { render as renderVersionsTab, handleKey as handleVersionsTabKey, dispose as disposeVersionsTab } from "./tabs/VersionsTab.js";
import { render as renderModelsTab, handleKey as handleModelsTabKey, dispose as disposeModelsTab } from "./tabs/ModelsTab.js";
import { render as renderDashboardTab, handleKey as handleDashboardTabKey, dispose as disposeDashboardTab } from "./tabs/DashboardTab.js";
import { render as renderLiveLogsTab, handleKey as handleLiveLogsTabKey, dispose as disposeLiveLogsTab } from "./tabs/LiveLogsTab.js";
import { render as renderOptionsTab, handleKey as handleOptionsTabKey, dispose as disposeOptionsTab } from "./tabs/OptionsTab.js";

const TABS = ["Server", "Tasks", "Versions", "Models", "Dashboard", "Logs", "Options"] as const;
type TabId = (typeof TABS)[number];

interface TabModule {
  render(app: App): void;
  handleKey(app: App, key: string): boolean;
  dispose?(): void;
}

interface AppState {
  activeTab: TabId;
  message: string | null;
  messageTimer: ReturnType<typeof setTimeout> | null;
  textInputFocused: boolean;
  config: any;
}

const tabModules: Record<TabId, TabModule> = {
  Server: { render: renderServerTab, handleKey: handleServerTabKey, dispose: disposeServerTab },
  Tasks: { render: renderTasksTab, handleKey: handleTasksTabKey, dispose: disposeTasksTab },
  Versions: { render: renderVersionsTab, handleKey: handleVersionsTabKey, dispose: disposeVersionsTab },
  Models: { render: renderModelsTab, handleKey: handleModelsTabKey, dispose: disposeModelsTab },
  Dashboard: { render: renderDashboardTab, handleKey: handleDashboardTabKey, dispose: disposeDashboardTab },
  Logs: { render: renderLiveLogsTab, handleKey: handleLiveLogsTabKey, dispose: disposeLiveLogsTab },
  Options: { render: renderOptionsTab, handleKey: handleOptionsTabKey, dispose: disposeOptionsTab },
};

export class App {
  term: Terminal;
  state: AppState;
  private keyHandler: ((name: string, matches: string[], data: any) => void) | null = null;
  private renderTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(term: Terminal) {
    this.term = term;
    this.state = {
      activeTab: "Server",
      message: null,
      messageTimer: null,
      textInputFocused: false,
      config: null,
    };
  }

  async start(): Promise<void> {
    await loadConfig().then((config) => {
      this.state.config = config;
      taskStore.init(config);
    });
    this.setupKeyHandler();
    this.render();
  }

  setActiveTab(tab: TabId): void {
    this.state.activeTab = tab;
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
      this.render();
    }, 3000);
    this.render();
  }

  setTextInputFocused(focused: boolean): void {
    this.state.textInputFocused = focused;
  }

  scheduleRender(): void {
    if (this.renderTimer) return; // Already scheduled
    this.renderTimer = setTimeout(() => {
      this.renderTimer = null;
      this.render();
    }, 0);
  }

  render(): void {
    const { term } = this;
    const { activeTab, message } = this.state;
    const tabIndex = TABS.indexOf(activeTab);
    const width = termWidth(term);

    term.moveTo(1, 1);
    term('\x1b[0J'); // Clear screen from cursor to end

    // --- Tab bar ---
    this.renderTabs(tabIndex, width);

    // --- Content area ---
    term.down(1);
    tabModules[activeTab].render(this);

    // --- Status bar ---
    const statusBarY = termHeight(term);
    term.moveTo(1, statusBarY);
    term.eraseLine();
    if (message) {
      fg(term, themeColors.success, message);
      fg(term, themeColors.textMuted, ` | ? help`);
    } else {
      fg(term, themeColors.textMuted, `${activeTab} | F1-F7 navigate | q quit | ? help`);
    }
  }

  private renderTabs(selectedIndex: number, width: number): void {
    const { term } = this;
    term.moveTo(1, 1);
    term.eraseLine();

    // Build tab labels
    const labels: string[] = [];
    const positions: { start: number; end: number }[] = [];
    let offset = 0;

    for (let i = 0; i < TABS.length; i++) {
      const label = `F${i + 1} ${TABS[i]}`;
      positions.push({ start: offset, end: offset + label.length });
      labels.push(label);
      offset += label.length + 2;
    }

    // Render tab labels
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

    // Render underline
    term.moveTo(1, 2);
    term.eraseLine();
    let underline = '';
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

    for (let i = 0; i < pos - 1; i++) {
      if (i >= activeStart && i < activeEnd) {
        fg(term, themeColors.accent, '\u2550');
      } else {
        fg(term, themeColors.border, '\u2500');
      }
    }
  }

  private setupKeyHandler(): void {
    const self = this;
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

      // F1-F7 tab switching
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

      // ? help
      if (name === '?' && !this.state.textInputFocused) {
        this.showMessage(`${this.state.activeTab} | F1-F7 navigate | q quit`);
        return;
      }

      // Arrow keys for tab navigation when not in text input
      if (!this.state.textInputFocused) {
        if (name === 'RIGHT' || name === 'TAB') {
          const idx = TABS.indexOf(this.state.activeTab);
          if (idx < TABS.length - 1) {
            this.setActiveTab(TABS[idx + 1]);
            return;
          }
        }
        if (name === 'LEFT' || name === 'SHIFT_TAB') {
          const idx = TABS.indexOf(this.state.activeTab);
          if (idx > 0) {
            this.setActiveTab(TABS[idx - 1]);
            return;
          }
        }
      }

      // Pass to active tab
      const handled = tabModules[this.state.activeTab].handleKey(this, name);
      if (!handled && !this.state.textInputFocused) {
        // Tab-level fallback: arrow keys for tab switching
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
    for (const tab of Object.values(tabModules)) {
      if (tab.dispose) tab.dispose();
    }
    taskStore.dispose();
  }
}
