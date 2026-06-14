import { Control } from "../ui/Control.js";
import { Column, Row } from "../ui/Layout.js";
import { Button } from "../ui/widgets/Button.js";
import { Spacer } from "../ui/widgets/Spacer.js";
import { Label } from "../ui/widgets/Label.js";
import { Section } from "../ui/widgets/Section.js";
import { LogsViewer } from "../specialized/LogsViewer.js";
import { MetricsPanel } from "../specialized/MetricsPanel.js";
import { fg } from "../../lib/theme.js";
import { getStatus, startServer, stopServer, serverLogLines, onServerLog, onServerStatusChange } from "../../lib/server.js";
import { fireAsync } from "../../lib/utils.js";
import { BACKEND_LABELS } from "../../lib/versions.js";
import type { TabContext } from "../../lib/tabcontext.js";
import type { Size, RenderContext } from "../ui/types.js";

export class DashboardControl extends Control {
  protected _ctx: TabContext | null = null;
  protected _column: Column;
  protected _buttonRow: Row;
  protected _buttons: Button[];
  protected _profileLabel: Label;
  protected _versionLabel: Label;
  protected _metricsSection: Section;
  protected _logsSection: Section;
  protected _metricsPanel: MetricsPanel;
  protected _logsControl: LogsViewer;
  protected _logUnsub: (() => void) | null = null;
  protected _statusUnsub: (() => void) | null = null;
  protected _logRenderTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;

    this._buttonRow = new Row();
    this._buttons = [
      new Button({ label: "Start" }),
      new Button({ label: "Stop" }),
      new Button({ label: "Restart" }),
    ];
    for (const btn of this._buttons) {
      this._buttonRow.add(btn);
    }

    const sep1 = new Label();
    sep1.text = "│";
    sep1.color = "borderMuted";
    sep1.focusable = false;
    this._buttonRow.add(sep1);

    this._profileLabel = new Label();
    this._profileLabel.text = "";
    this._profileLabel.color = "textMuted";
    this._profileLabel.focusable = false;
    const profileLbl = this._profileLabel;
    this._profileLabel.measure = () => ({ width: "Profile: ".length + profileLbl.text.length, height: 1 });
    profileLbl.draw = (ctx: RenderContext) => {
      const canvas = ctx.canvas;
      canvas.moveTo(profileLbl.rect.x, profileLbl.rect.y);
      fg(canvas, "textMuted", "Profile ");
      fg(canvas, "accentColor", profileLbl.text);
    };
    this._buttonRow.add(this._profileLabel);

    const sep2 = new Label();
    sep2.text = "│";
    sep2.color = "borderMuted";
    sep2.focusable = false;
    this._buttonRow.add(sep2);

    this._versionLabel = new Label();
    this._versionLabel.text = "";
    this._versionLabel.color = "textMuted";
    this._versionLabel.focusable = false;
    const versionLbl = this._versionLabel;
    this._versionLabel.measure = () => ({ width: Math.max("Version: ".length + versionLbl.text.length, 1), height: 1 });
    versionLbl.draw = (ctx: RenderContext) => {
      const canvas = ctx.canvas;
      canvas.moveTo(versionLbl.rect.x, versionLbl.rect.y);
      fg(canvas, "textMuted", "Version ");
      fg(canvas, "text", versionLbl.text);
    };
    this._buttonRow.add(this._versionLabel);

    this._metricsPanel = new MetricsPanel();
    this._logsControl = new LogsViewer({
      getLines: () => serverLogLines,
      emptyMessage: "Start the server to see logs",
    });
    this._logsControl.flex = 1;

    this._metricsSection = new Section();
    this._metricsSection.title = "Realtime Metrics";
    this._metricsSection.add(this._metricsPanel);

    this._logsSection = new Section();
    this._logsSection.title = "Live Logs";
    this._logsSection.add(this._logsControl);
    this._logsSection.flex = 1;

    this._column = new Column();
    this._column.add(this._buttonRow);
    this._column.add(new Spacer());
    this._column.add(this._metricsSection);
    this._column.add(new Spacer());
    this._column.add(this._logsSection);

    this.add(this._column);
  }

  measure(parentSize?: Size): Size {
    return parentSize ? { width: parentSize.width, height: parentSize.height } : super.measure(parentSize);
  }

  onInit(): void {
    if (!this._ctx) return;
    const ctx = this._ctx;
    const buttons = this._buttons;

    buttons[0]?.setAction(() => {
      fireAsync(async () => {
        const config = ctx.getConfig();
        if (!config) throw new Error("No config loaded");
        await startServer(config);
      }, ctx);
      this.markDirty();
    });

    buttons[1]?.setAction(() => {
      fireAsync(async () => {
        await stopServer();
      }, ctx);
      this.markDirty();
    });

    buttons[2]?.setAction(() => {
      fireAsync(async () => {
        const config = ctx.getConfig();
        if (!config) throw new Error("No config loaded");
        await stopServer();
        await startServer(config);
      }, ctx);
      this.markDirty();
    });

    this.updateProfileLabel();

    this._logUnsub = onServerLog(() => {
      if (this._logRenderTimer) clearTimeout(this._logRenderTimer);
      this._logRenderTimer = setTimeout(() => {
        this.markDirty();
      }, 200);
    });

    this._statusUnsub = onServerStatusChange(() => {
      this.markDirty();
      this._ctx?.showCursor();
    });

    this.markDirty();
  }

  onDestroy(): void {
    if (this._logUnsub) {
      this._logUnsub();
      this._logUnsub = null;
    }
    if (this._statusUnsub) {
      this._statusUnsub();
      this._statusUnsub = null;
    }
    if (this._logRenderTimer) {
      clearTimeout(this._logRenderTimer);
      this._logRenderTimer = null;
    }
    this._ctx = null;
  }

  draw(ctx: RenderContext): void {
    this.updateProfileLabel();
    this.updateButtons();
  }

  onFocus(): void {
    super.onFocus();
    this.updateButtons();
    const firstEnabled = this._buttons.find(b => !b.disabled);
    if (firstEnabled) {
      firstEnabled.focus();
    }
  }

  updateProfileLabel(): void {
    const config = this._ctx?.getConfig();
    this._profileLabel.text = config ? config.server.activeProfile : "";

    if (config && config.activeVersion) {
      const version = config.activeVersion;
      const backend = version.split("-").slice(1).join("-");
      const label = BACKEND_LABELS[backend] || backend || "CPU";
      this._versionLabel.text = `${version} ${label}`;
    } else {
      this._versionLabel.text = "";
    }
  }

  updateButtons(): void {
    const status = getStatus();
    this._buttons[0].disabled = status.running;
    this._buttons[1].disabled = !status.running;
    this._buttons[2].disabled = !status.running;
  }
}

export function createDashboardTab(ctx: TabContext): Control {
  return new DashboardControl(ctx);
}
