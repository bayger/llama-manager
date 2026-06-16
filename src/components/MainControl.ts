import { Control } from "./ui/Control";
import { Column } from "./ui/Layout";
import { HalfBar } from "./ui/widgets/HalfBar";
import { Color, fg } from "../lib/theme";
import type { Point, Rect, RenderContext, Size } from "./ui/types";
import type { TabContext } from "../lib/tabcontext";
import pkg from "../../package.json";

import { createServerTab } from "./tabs/ServerTab";
import { createTasksTab } from "./tabs/TasksTab";
import { createVersionsTab } from "./tabs/VersionsTab";
import { createDashboardTab } from "./tabs/DashboardTab";
import { createModelsTab } from "./tabs/ModelsTab";
import { createOptionsTab } from "./tabs/OptionsTab";
import { focusManager } from "./ui/FocusManager";

export const TABS = ["Dashboard", "Tasks", "Profiles", "Versions", "Models", "Options"] as const;
export type TabId = (typeof TABS)[number];

export class MainControl extends Column {
  foregroundColor = 'canvas' as Color;
  backgroundColor = 'canvas' as Color;
  protected _topBar: HalfBar;
  protected _tabBar: TabBar;
  protected _tabContent: TabContent;
  protected _statusBarHalfBar: HalfBar;
  protected _statusBar: StatusBar;
  protected _bottomBar: HalfBar;
  protected _activeTab: TabId = "Dashboard";
  protected _message: string | null = null;
  protected _messageTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    protected _ctx: TabContext,
    protected _onQuit: () => void,
  ) {
    super();

    this._topBar = new HalfBar();
    this._tabBar = new TabBar((index) => {
      this.setActiveTab(TABS[index]);
    });
    this._tabContent = new TabContent(_ctx);
    this._statusBarHalfBar = new HalfBar();
    this._statusBarHalfBar.mode = 'top';
    this._statusBar = new StatusBar();
    this._bottomBar = new HalfBar();
    this._bottomBar.mode = 'bottom';

    this.add(this._topBar);
    this.add(this._tabBar);
    this.add(this._tabContent);
    this.add(this._statusBarHalfBar);
    this.add(this._statusBar);
    this.add(this._bottomBar);

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

  draw(_ctx: RenderContext): void {
    super.draw(_ctx);
  }
}

class TabBar extends Control {
  focusable = false;
  backgroundColor: Color = "canvasSubtle";
  protected _selectedIndex = 0;
  protected _tabRects: { start: number; end: number }[] = [];
  protected _onTabClick: ((index: number) => void) | null = null;
  protected _appStr = `Llama Manager `;

  constructor(onTabClick?: (index: number) => void) {
    super();
    this._onTabClick = onTabClick || null;
  }

  measure(_parentSize?: Size): Size {
    return { width: this.rect.width || 80, height: 2 };
  }

  setSelectedIndex(idx: number): void {
    this._selectedIndex = idx;
    this.markDirty();
  }

  draw(ctx: RenderContext): void {
    const canvas = ctx.canvas;
    const { x, y, width } = this.rect;

    canvas.moveTo(x, y);
    fg(canvas, "text", " ");
    canvas.bold();
    fg(canvas, "accentColor", this._appStr);
    canvas.bold(false);
    fg(canvas, "borderMuted", " │ ");

    this._tabRects = [];
    let pos = 0;
    let activeStart = 0;
    let activeEnd = 0;
    for (let i = 0; i < TABS.length; i++) {
      const labelLen = `F${i + 1} ${TABS[i]}`.length;
      this._tabRects.push({ start: pos, end: pos + labelLen });
      if (i === this._selectedIndex) {
        fg(canvas, "textMuted", `F${i + 1}`);
        canvas.bold();
        fg(canvas, "accent", ` ${TABS[i]}`);
        canvas.bold(false);
        activeStart = pos;
        activeEnd = pos + labelLen;
      } else {
        fg(canvas, "border", `F${i + 1}`);
        canvas.bold();
        fg(canvas, "textMuted", ` ${TABS[i]}`);
        canvas.bold(false);
      }
      pos += labelLen;
      if (i < TABS.length - 1) {
        fg(canvas, "borderMuted", " │ ");
        pos += 3;
      }
    }

    const rightPadding = 1;
    const padLen = width - pos - this._appStr.length - rightPadding - 3;
    if (padLen > 0) {
      fg(canvas, "borderMuted", " ".repeat(padLen));
    }

    canvas.moveTo(x, y + 1);
    for (let i = 0; i < width; i++) {
      fg(canvas, "canvas", "\u2584");
    }
  }

  onMouseDown(point: Point): boolean {
    if (point.y !== this.rect.y) return false;
    const offset = point.x - this.rect.x - 1 - this._appStr.length - 3;
    for (let i = 0; i < this._tabRects.length; i++) {
      const rect = this._tabRects[i]!;
      if (offset >= rect.start && offset < rect.end) {
        this._onTabClick?.(i);
        return true;
      }
    }
    return false;
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

  draw(ctx: RenderContext): void {
    const { x, y, width, height } = this.rect;

    const control = this.getActiveControl();
    if (control) {
      const pad = 1;
      control.layout({ x: x + pad, y: y, width: Math.max(0, width - pad * 2), height });
    }
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

const APP_VERSION = pkg.version;

class StatusBar extends Control {
  focusable = false;
  backgroundColor: Color = "canvasSubtle";
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

  draw(ctx: RenderContext): void {
    const canvas = ctx.canvas;
    const { x, y, width } = this.rect;
    const versionStr = `v${APP_VERSION} `;

    canvas.moveTo(x, y);
    fg(canvas, "text", " ");

    let leftLen = 0;
    if (this._message) {
      const isError = this._message.startsWith("Error") || this._message.startsWith("Failed");
      fg(canvas, isError ? "danger" : "success", this._message);
      fg(canvas, "borderMuted", "  │  ");
      fg(canvas, "textMuted", "? help");
      leftLen = this._message.length + 10;
    } else {
      fg(canvas, "accentColor", this._activeTab);
      fg(canvas, "borderMuted", "  │  ");
      fg(canvas, "textMuted", "F1-F6 navigate");
      fg(canvas, "borderMuted", "  │  ");
      fg(canvas, "textMuted", "q quit");
      fg(canvas, "borderMuted", "  │  ");
      fg(canvas, "textMuted", "? help");
      leftLen = this._activeTab.length + 40;
    }

    const padding = 2;
    const padLen = width - leftLen - versionStr.length - padding;
    if (padLen > 0) {
      fg(canvas, "borderMuted", " ".repeat(padLen));
    }
    fg(canvas, "textMuted", versionStr);
  }
}
