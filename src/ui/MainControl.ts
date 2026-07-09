import { Control } from "../framework/Control";
import { Column } from "../framework/Layout";
import { Spacer } from "../framework/widgets/Spacer";
import { Color, fg } from "../lib/theme";
import type { Point, Rect, RenderContext, Size } from "../framework/types";
import type { TabContext } from "../lib/tabcontext";
import pkg from "../../package.json";
import { getStatus, onServerStatusChange } from "../lib/server";
import { formatUptime } from "../lib/utils";
import { checkForUpdate } from "../lib/updates";
import { createUpdateInfoModal } from "./specialized/UpdateInfoModal";

import { createServerTab } from "./tabs/ServerTab";
import { createTasksTab } from "./tabs/TasksTab";
import { createVersionsTab } from "./tabs/VersionsTab";
import { createDashboardTab } from "./tabs/DashboardTab";
import { createLogsTab } from "./tabs/LogsTab";
import { createModelsTab } from "./tabs/ModelsTab";
import { createOptionsTab } from "./tabs/OptionsTab";
import { focusManager } from "../framework/FocusManager";

export const TABS = ["Dashboard", "Logs", "Tasks", "Profiles", "Versions", "Models", "Options"] as const;
export type TabId = (typeof TABS)[number];

export class MainControl extends Column {
  foregroundColor = 'canvas' as Color;
  backgroundColor = 'canvas' as Color;
  protected _tabBar: TabBar;
  protected _tabContent: TabContent;
  protected _statusBar: StatusBar;
  protected _activeTab: TabId = "Dashboard";
  protected _message: string | null = null;
  protected _messageTimer: ReturnType<typeof setTimeout> | null = null;
  protected _updateCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    protected _ctx: TabContext,
    protected _onQuit: () => void | Promise<void>,
  ) {
    super();

    this._tabBar = new TabBar((index) => {
      this.setActiveTab(TABS[index]);
    });
    this._tabContent = new TabContent(_ctx);
    this._statusBar = new StatusBar();

    this.add(this._tabBar);
    this.add(new Spacer());
    this.add(this._tabContent);
    this.add(new Spacer());
    this.add(this._statusBar);

    this._tabContent.flex = 1;
  }

  measure(parentSize: Size): Size {
    return { width: parentSize.width, height: parentSize.height };
  }

  onInit(): void {
    super.onInit();
    this.markDirty();
    this.startUpdateChecks();
  }

  onDestroy(): void {
    super.onDestroy();
    if (this._messageTimer) {
      clearTimeout(this._messageTimer);
      this._messageTimer = null;
    }
    if (this._updateCheckInterval) {
      clearInterval(this._updateCheckInterval);
      this._updateCheckInterval = null;
    }
  }

  protected startUpdateChecks(): void {
    const config = this._ctx.getConfig();
    if (!config) return;

    const runCheck = async () => {
      const cfg = this._ctx.getConfig();
      if (!cfg) return;
      const result = await checkForUpdate(cfg, APP_VERSION);
      if (result) {
        this._statusBar.setUpdateAvailable(result.isAvailable, result.latestVersion);
        this.markAllDirty();
      }
    };

    if (config.updates.checkOnStartup) {
      runCheck();
    }

    this._updateCheckInterval = setInterval(() => {
      runCheck();
    }, 6 * 60 * 60 * 1000);
  }

  setUpdateAvailable(available: boolean, version: string | null): void {
    this._statusBar.setUpdateAvailable(available, version);
    this.markAllDirty();
  }

  setActiveTab(tab: TabId): void {
    this._activeTab = tab;
    this._tabBar.setSelectedIndex(TABS.indexOf(tab));
    this._tabContent.setActiveTab(tab);

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

  getTabContent(): Control {
    return this._tabContent;
  }

  handleKey(key: string): boolean {
    if (key === "CTRL_C" || key === "q") {
      this._onQuit();
      return true;
    }

    if (key === "?" && !focusManager.isTextInputActive()) {
      return false;
    }

    for (let i = 0; i < 7; i++) {
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
  backgroundColor: Color = "surface";
  protected _selectedIndex = 0;
  protected _tabRects: { start: number; end: number }[] = [];
  protected _onTabClick: ((index: number) => void) | null = null;
  protected _appStr = `Llama Manager `;

  constructor(onTabClick?: (index: number) => void) {
    super();
    this._onTabClick = onTabClick || null;
  }

  measure(_parentSize?: Size): Size {
    return { width: this.rect.width || 80, height: 3 };
  }

  setSelectedIndex(idx: number): void {
    this._selectedIndex = idx;
    this.markDirty();
  }

  draw(ctx: RenderContext): void {
    const canvas = ctx.canvas;
    const { x, y, width } = this.rect;

    canvas.moveTo(x, y + 1);
    fg(canvas, "text", " ");
    canvas.bold();
    fg(canvas, "accentColor", this._appStr);
    canvas.bold(false);
    fg(canvas, "borderMuted", " · ");

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
      fg(canvas, "borderMuted", "  ·  ");
        pos += 5;
      }
    }

    const rightPadding = 1;
    const padLen = width - pos - this._appStr.length - rightPadding - 3;
    if (padLen > 0) {
      fg(canvas, "borderMuted", " ".repeat(padLen));
    }

    canvas.moveTo(x, y + 2);
    for (let i = 0; i < width; i++) {
      fg(canvas, "canvas", " ");
    }
  }

  onMouseDown(point: Point): boolean {
    if (point.y !== this.rect.y + 1) return false;
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
      Logs: createLogsTab,
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
  backgroundColor: Color = "surface";
  protected _message: string | null = null;
  protected _serverRunning = false;
  protected _serverPid: number | null = null;
  protected _serverUptime = 0;
  protected _statusUnsubscribe: (() => void) | null = null;
  protected _uptimeInterval: ReturnType<typeof setInterval> | null = null;
  protected _updateAvailable = false;
  protected _latestVersion: string | null = null;
  protected _versionRect: { x: number; y: number; len: number } | null = null;

  measure(_parentSize?: Size): Size {
    return { width: this.rect.width || 80, height: 3 };
  }

  onInit(): void {
    super.onInit();
    this.updateServerStatus();
    this._statusUnsubscribe = onServerStatusChange(() => {
      this.updateServerStatus();
    });
  }

  onDestroy(): void {
    super.onDestroy();
    if (this._statusUnsubscribe) {
      this._statusUnsubscribe();
      this._statusUnsubscribe = null;
    }
    if (this._uptimeInterval) {
      clearInterval(this._uptimeInterval);
      this._uptimeInterval = null;
    }
  }

  updateServerStatus(): void {
    const status = getStatus();
    this._serverRunning = status.running;
    this._serverPid = status.pid;
    this._serverUptime = status.uptime;
    this.markDirty();

    if (this._uptimeInterval) {
      clearInterval(this._uptimeInterval);
      this._uptimeInterval = null;
    }
    if (status.running) {
      this._uptimeInterval = setInterval(() => {
        const s = getStatus();
        this._serverUptime = s.uptime;
        this.markDirty();
      }, 1000);
    }
  }

  setMessage(msg: string | null): void {
    this._message = msg;
    this.markDirty();
  }

  setUpdateAvailable(available: boolean, version: string | null): void {
    this._updateAvailable = available;
    this._latestVersion = version;
    this.markDirty();
  }

  onMouseUp(point: Point): boolean {
    if (!this._versionRect) return false;
    const { x, y, len } = this._versionRect;
    if (point.y === y && point.x >= x && point.x < x + len && this._updateAvailable) {
      this.openUpdateModal();
      return true;
    }
    return false;
  }

  protected openUpdateModal(): void {
    if (!this._latestVersion) return;
    const main = this._parent as MainControl | null;
    if (!main) return;
    const ctx = (main as any)._ctx;
    if (!ctx) return;
    ctx.openModal(createUpdateInfoModal(APP_VERSION, this._latestVersion, ctx));
    main.markAllDirty();
  }

  draw(ctx: RenderContext): void {
    const canvas = ctx.canvas;
    const { x, y, width } = this.rect;
    let versionStr: string;
    if (this._updateAvailable && this._latestVersion) {
      versionStr = `v${APP_VERSION} (v${this._latestVersion} available) `;
    } else {
      versionStr = `v${APP_VERSION} `;
    }

    canvas.moveTo(x, y + 1);
    fg(canvas, "text", " ");

    let leftLen = 0;
    if (this._message) {
      const isError = this._message.startsWith("Error") || this._message.startsWith("Failed");
      fg(canvas, isError ? "danger" : "success", this._message);
      fg(canvas, "borderMuted", "  ·  ");
      fg(canvas, "textMuted", "? help");
      leftLen = this._message.length + 10;
    } else {
      fg(canvas, "textMuted", "Server: ");
      const statusColor: Color = this._serverRunning ? "success" : "danger";
      const statusLabel = this._serverRunning ? "Running" : "Stopped";
      fg(canvas, statusColor, statusLabel);
      if (this._serverRunning) {
        fg(canvas, "textMuted", ` (PID ${this._serverPid}, ${formatUptime(this._serverUptime)})`);
      }
      fg(canvas, "borderMuted", "  ·  ");
      fg(canvas, "textMuted", "F1-F7 navigate");
      fg(canvas, "borderMuted", "  ·  ");
      fg(canvas, "textMuted", "q quit");
      fg(canvas, "borderMuted", "  ·  ");
      fg(canvas, "textMuted", "? help");
      const serverLen = this._serverRunning
        ? `Server: Running (PID ${this._serverPid}, ${formatUptime(this._serverUptime)})`.length
        : "Server: Stopped".length;
      leftLen = serverLen + 40;
    }

    const padding = 2;
    const padLen = width - leftLen - versionStr.length - padding;
    if (padLen > 0) {
      fg(canvas, "borderMuted", " ".repeat(padLen));
    }

    const versionX = x + leftLen + (padLen > 0 ? padLen : 0);
    this._versionRect = { x: versionX, y: y + 1, len: versionStr.length };

    if (this._updateAvailable) {
      fg(canvas, "warning", versionStr);
    } else {
      fg(canvas, "textMuted", versionStr);
    }

    canvas.moveTo(x, y + 2);
    for (let i = 0; i < width; i++) {
      fg(canvas, "canvas", " ");
    }
  }
}
