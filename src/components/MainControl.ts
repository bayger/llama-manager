import { Control } from "./ui/Control.js";
import { Column } from "./ui/Layout.js";
import { fg, themeColors, termWidth, termHeight } from "../lib/theme.js";
import type { Rect, RenderContext, Size } from "./ui/types.js";
import type { TabContext } from "../lib/tabcontext.js";

import { createServerTab } from "./tabs/ServerTab.js";
import { createTasksTab } from "./tabs/TasksTab.js";
import { createVersionsTab } from "./tabs/VersionsTab.js";
import { createDashboardTab } from "./tabs/DashboardTab.js";
import { createModelsTab } from "./tabs/ModelsTab.js";
import { createOptionsTab } from "./tabs/OptionsTab.js";
import { focusManager } from "./ui/FocusManager.js";

export const TABS = ["Dashboard", "Profiles", "Tasks", "Versions", "Models", "Options"] as const;
export type TabId = (typeof TABS)[number];

interface TabModule {
  render(): void;
  handleKey(key: string): boolean;
  dispose?(): void;
}

interface TabEntry {
  legacy: TabModule;
  control: Control | null;
}

// — TabBar —

export class TabBar extends Control {
  focusable = false;
  protected selectedIndex = 0;

  measure(_parentSize?: Size): Size {
    return { width: this.rect.width || 80, height: 2 };
  }

  setSelectedIndex(idx: number): void {
    this.selectedIndex = idx;
    this.markDirty();
  }

  render(): void {
    if (!this.visible || !this.needsRender) return;
    const { canvas, rect } = this;
    const { x, y, width } = rect;

    // Row 1: tab labels
    canvas.moveTo(x, y);
    canvas.eraseLine();

    for (let i = 0; i < TABS.length; i++) {
      if (i === this.selectedIndex) {
        fg(canvas, themeColors.textMuted, `F${i + 1}`);
        canvas.bold();
        fg(canvas, themeColors.accent, ` ${TABS[i]}`);
        canvas.styleReset();
      } else {
        fg(canvas, themeColors.border, `F${i + 1}`);
        fg(canvas, themeColors.textMuted, ` ${TABS[i]}`);
      }
      if (i < TABS.length - 1) {
        canvas.write("  ");
      }
    }

    // Row 2: active tab underline
    canvas.moveTo(x, y + 1);
    canvas.eraseLine();

    let pos = 0;
    let activeStart = 0;
    let activeEnd = 0;
    for (let i = 0; i < TABS.length; i++) {
      const label = `F${i + 1} ${TABS[i]}`;
      if (i === this.selectedIndex) {
        activeStart = pos;
        activeEnd = pos + label.length;
      }
      pos += label.length + 2;
    }

    for (let i = 0; i < width; i++) {
      const color = i >= activeStart && i < activeEnd ? themeColors.accent : themeColors.border;
      fg(canvas, color, "\u2501");
    }

    this.needsRender = false;
  }
}

// — TabContent —

class TabContent extends Control {
  focusable = false;
  protected tabs: Record<TabId, TabEntry> | null = null;
  protected activeTab: TabId = "Dashboard";

  setTabs(tabs: Record<TabId, TabEntry>): void {
    this.tabs = tabs;
  }

  setActiveTab(tab: TabId): void {
    this.activeTab = tab;
    this.markDirty();
  }

  getActiveControl(): Control | null {
    if (!this.tabs) return null;
    const entry = this.tabs[this.activeTab];
    return entry.control || null;
  }

  render(): void {
    if (!this.visible || !this.needsRender) return;
    if (!this.tabs) return;

    const { canvas, rect } = this;
    const { x, y, width, height } = rect;

    // Clear content area
    canvas.fillRect(x, y, width, height);

    const control = this.getActiveControl();
    if (control) {
      control.layout({ x, y, width, height });
      control.render();
    } else {
      canvas.moveTo(x, y);
      this.tabs[this.activeTab].legacy.render();
    }

    this.needsRender = false;
  }

  handleKey(key: string): boolean {
    if (!this.tabs) return false;
    const control = this.getActiveControl();
    if (control) {
      return control.handleKey(key);
    }
    return this.tabs[this.activeTab].legacy.handleKey(key);
  }
}

// — StatusBar —

export class StatusBar extends Control {
  focusable = false;
  protected message: string | null = null;
  protected activeTab: TabId = "Dashboard";

  measure(_parentSize?: Size): Size {
    return { width: this.rect.width || 80, height: 1 };
  }

  setMessage(msg: string | null): void {
    this.message = msg;
    this.markDirty();
  }

  setActiveTab(tab: TabId): void {
    this.activeTab = tab;
    this.markDirty();
  }

  render(): void {
    if (!this.visible || !this.needsRender) return;
    const { canvas, rect } = this;
    const { x, y } = rect;

    canvas.moveTo(x, y);
    canvas.eraseLine();

    if (this.message) {
      fg(canvas, themeColors.success, this.message);
      fg(canvas, themeColors.textMuted, " | ? help");
    } else {
      fg(canvas, themeColors.textMuted, `${this.activeTab} | F1-F6 navigate | q quit | ? help`);
    }

    this.needsRender = false;
  }
}

// — MainControl —

export class MainControl extends Column {
  protected tabBar: TabBar;
  protected tabContent: TabContent;
  protected statusBar: StatusBar;
  protected tabs: Record<TabId, TabEntry>;
  protected activeTab: TabId = "Dashboard";
  protected message: string | null = null;
  protected messageTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    protected ctx: TabContext,
    protected onQuit: () => void,
  ) {
    super();

    this.tabBar = new TabBar();
    this.tabContent = new TabContent();
    this.statusBar = new StatusBar();

    this.add(this.tabBar);
    this.add(this.tabContent);
    this.add(this.statusBar);

    this.tabContent.flex = 1;

    const factoryFns: Record<TabId, (ctx: TabContext) => TabModule | Control> = {
      Dashboard: createDashboardTab,
      Profiles: createServerTab,
      Tasks: createTasksTab,
      Versions: createVersionsTab,
      Models: createModelsTab,
      Options: createOptionsTab,
    };

    this.tabs = {} as Record<TabId, TabEntry>;
    for (const tabId of TABS) {
      const instance = factoryFns[tabId](ctx);
      const isControl = instance instanceof Control;
      this.tabs[tabId] = {
        legacy: isControl ? this.wrapControl(instance) : instance,
        control: isControl ? instance : null,
      };
    }

    this.tabContent.setTabs(this.tabs);
  }

  wrapControl(control: Control): TabModule {
    return {
      render: () => control.render(),
      handleKey: (key: string) => control.handleKey(key),
      dispose: () => control.detach(),
    };
  }

  measure(parentSize: Size): Size {
    return { width: parentSize.width, height: parentSize.height };
  }

  setActiveTab(tab: TabId): void {
    this.activeTab = tab;
    this.tabBar.setSelectedIndex(TABS.indexOf(tab));
    this.tabContent.setActiveTab(tab);
    this.statusBar.setActiveTab(tab);

    const control = this.tabContent.getActiveControl();
    if (control) {
      focusManager.setFocus(control);
    }
  }

  showMessage(msg: string): void {
    if (this.messageTimer) {
      clearTimeout(this.messageTimer);
    }
    this.message = msg;
    this.statusBar.setMessage(msg);
    this.messageTimer = setTimeout(() => {
      this.message = null;
      this.messageTimer = null;
      this.statusBar.setMessage(null);
    }, 3000);
  }

  getActiveControl(): Control | null {
    return this.tabContent.getActiveControl();
  }

  handleKey(key: string): boolean {
    if (key === "CTRL_C" || key === "q") {
      this.onQuit();
      return true;
    }

    for (let i = 0; i < 6; i++) {
      if (key === `F${i + 1}`) {
        this.setActiveTab(TABS[i]);
        return true;
      }
    }

    const control = this.getActiveControl();
    if (control) {
      return control.handleKey(key);
    }
    const entry = this.tabs[this.activeTab];
    return entry.legacy.handleKey(key);
  }

  handleChar(char: string): boolean {
    const control = this.getActiveControl();
    if (control) {
      return control.handleChar(char);
    }
    return false;
  }

  findFocusedDescendant(): Control | null {
    const control = this.getActiveControl();
    if (control) {
      const found = control.findFocusedDescendant();
      if (found) return found;
      if (control.focused) return control;
    }
    return null;
  }

  getAllFocusable(): Control[] {
    const control = this.getActiveControl();
    if (control) {
      const descendants = control.getAllFocusable();
      if (descendants.length > 0) return descendants;
      if (control.focusable) return [control];
    }
    return [];
  }

  attach(renderContext: RenderContext): void {
    super.attach(renderContext);
    for (const entry of Object.values(this.tabs)) {
      if (entry.control) {
        entry.control.attach(renderContext);
      }
    }
  }

  onDetach(): void {
    for (const entry of Object.values(this.tabs)) {
      if (entry.control) {
        entry.control.detach();
      }
    }
    super.onDetach();
  }

  dispose(): void {
    if (this.messageTimer) {
      clearTimeout(this.messageTimer);
      this.messageTimer = null;
    }
    for (const entry of Object.values(this.tabs)) {
      if (entry.control) {
        entry.control.detach();
      } else if (entry.legacy.dispose) {
        entry.legacy.dispose();
      }
    }
  }
}
