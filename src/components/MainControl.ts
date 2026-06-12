import { Control } from "./ui/Control.js";
import { Column } from "./ui/Layout.js";
import { fg, themeColors } from "../lib/theme.js";
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

export class MainControl extends Column {
  protected _tabBar: TabBar;
  protected _tabContent: TabContent;
  protected _statusBar: StatusBar;
  protected _activeTab: TabId = "Dashboard";
  protected _message: string | null = null;
  protected _messageTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    protected _ctx: TabContext,
    protected _onQuit: () => void,
  ) {
    super();

    this._tabBar = new TabBar();
    this._tabContent = new TabContent(_ctx);
    this._statusBar = new StatusBar();

    this.add(this._tabBar);
    this.add(this._tabContent);
    this.add(this._statusBar);

    this._tabContent.flex = 1;
  }

  measure(parentSize: Size): Size {
    return { width: parentSize.width, height: parentSize.height };
  }

  onInit(): void {
    super.onInit();
    this.markDirty();
  }

  onDestroy(): void {
    super.onDestroy();
    if (this._messageTimer) {
      clearTimeout(this._messageTimer);
      this._messageTimer = null;
    }
  }

  setActiveTab(tab: TabId): void {
    this._activeTab = tab;
    this._tabBar.setSelectedIndex(TABS.indexOf(tab));
    this._tabContent.setActiveTab(tab);
    this._statusBar.setActiveTab(tab);

    const control = this._tabContent.getActiveControl();
    if (control) {
      focusManager.setFocus(control);
    }
  }

  showMessage(msg: string): void {
    if (this._messageTimer) {
      clearTimeout(this._messageTimer);
    }
    this._message = msg;
    this._statusBar.setMessage(msg);
    this._messageTimer = setTimeout(() => {
      this._message = null;
      this._messageTimer = null;
      this._statusBar.setMessage(null);
    }, 3000);
  }

  getActiveControl(): Control | null {
    return this._tabContent.getActiveControl();
  }

  handleKey(key: string): boolean {
    if (key === "CTRL_C" || key === "q") {
      this._onQuit();
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
    return false;
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

  render(ctx: RenderContext): void {
    super.render(ctx);
  }
}

class TabBar extends Control {
  focusable = false;
  protected _selectedIndex = 0;

  measure(_parentSize?: Size): Size {
    return { width: this.rect.width || 80, height: 2 };
  }

  setSelectedIndex(idx: number): void {
    this._selectedIndex = idx;
    this.markDirty();
  }

  render(ctx: RenderContext): void {
    if (!this.visible || !this.needsRender) return;
    const canvas = ctx.canvas;
    const { x, y, width } = this.rect;

    canvas.clearRect(x, y, width, 2, themeColors.canvasSubtle);
    canvas.moveTo(x, y);

    let pos = 0;
    let activeStart = 0;
    let activeEnd = 0;
    for (let i = 0; i < TABS.length; i++) {
      const labelLen = `F${i + 1} ${TABS[i]}`.length;
      if (i === this._selectedIndex) {
        fg(canvas, themeColors.textMuted, `F${i + 1}`);
        canvas.bold();
        fg(canvas, themeColors.accent, ` ${TABS[i]}`);
        canvas.styleReset();
        activeStart = pos;
        activeEnd = pos + labelLen;
      } else {
        fg(canvas, themeColors.border, `F${i + 1}`);
        fg(canvas, themeColors.textMuted, ` ${TABS[i]}`);
      }
      pos += labelLen;
      if (i < TABS.length - 1) {
        fg(canvas, themeColors.borderMuted, " │ ");
        pos += 3;
      }
    }

    canvas.moveTo(x, y + 1);
    for (let i = 0; i < width; i++) {
      if (i >= activeStart && i < activeEnd) {
        fg(canvas, themeColors.accent, "\u2501");
      } else {
        fg(canvas, themeColors.borderMuted, "\u2501");
      }
    }

    this.needsRender = false;
  }
}

class TabContent extends Control {
  focusable = false;
  protected _tabs: Map<TabId, Control>;
  protected _activeTab: TabId = "Dashboard";

  constructor(ctx: TabContext) {
    super();

    const factoryFns: Record<TabId, (ctx: TabContext) => Control> = {
      Dashboard: createDashboardTab,
      Profiles: createServerTab,
      Tasks: createTasksTab,
      Versions: createVersionsTab,
      Models: createModelsTab,
      Options: createOptionsTab,
    };

    this._tabs = new Map();
    for (const tabId of TABS) {
      const control = factoryFns[tabId](ctx);
      if (tabId !== "Dashboard") {
        control.visible = false;
      }
      this._tabs.set(tabId, control);
      this.add(control);
    }
  }

  setActiveTab(tab: TabId): void {
    for (const [tabId, control] of this._tabs) {
      control.visible = tabId === tab;
    }
    this._activeTab = tab;
    this.markDirty();
  }

  getActiveControl(): Control | null {
    return this._tabs.get(this._activeTab) || null;
  }

  render(ctx: RenderContext): void {
    if (!this.visible || !this.needsRender) return;
    const { x, y, width, height } = this.rect;
    const canvas = ctx.canvas;

    canvas.clearRect(x, y, width, height, themeColors.canvas);

    const control = this.getActiveControl();
    if (control) {
      control.layout({ x, y, width, height });
      control.render(ctx);
    }

    this.needsRender = false;
  }

  handleKey(key: string): boolean {
    const control = this.getActiveControl();
    if (control) {
      return control.handleKey(key);
    }
    return false;
  }

  handleChar(char: string): boolean {
    const control = this.getActiveControl();
    if (control) {
      return control.handleChar(char);
    }
    return false;
  }
}

class StatusBar extends Control {
  focusable = false;
  protected _message: string | null = null;
  protected _activeTab: TabId = "Dashboard";

  measure(_parentSize?: Size): Size {
    return { width: this.rect.width || 80, height: 1 };
  }

  setMessage(msg: string | null): void {
    this._message = msg;
    this.markDirty();
  }

  setActiveTab(tab: TabId): void {
    this._activeTab = tab;
    this.markDirty();
  }

  render(ctx: RenderContext): void {
    if (!this.visible || !this.needsRender) return;
    const canvas = ctx.canvas;
    const { x, y, width } = this.rect;

    canvas.clearRect(x, y, width, 1, themeColors.canvasSubtle);
    canvas.moveTo(x, y);

    if (this._message) {
      const isError = this._message.startsWith("Error") || this._message.startsWith("Failed");
      fg(canvas, isError ? themeColors.danger : themeColors.success, this._message);
      fg(canvas, themeColors.borderMuted, "  │  ");
      fg(canvas, themeColors.textMuted, "? help");
    } else {
      fg(canvas, themeColors.accentColor, this._activeTab);
      fg(canvas, themeColors.borderMuted, "  │  ");
      fg(canvas, themeColors.textMuted, "F1-F6 navigate");
      fg(canvas, themeColors.borderMuted, "  │  ");
      fg(canvas, themeColors.textMuted, "q quit");
      fg(canvas, themeColors.borderMuted, "  │  ");
      fg(canvas, themeColors.textMuted, "? help");
    }

    this.needsRender = false;
  }
}
