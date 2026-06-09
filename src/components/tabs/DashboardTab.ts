import { Control } from "../ui/Control.js";
import { Column, Row } from "../ui/Layout.js";
import { Button } from "../ui/widgets/Button.js";
import { Divider } from "../ui/widgets/Divider.js";
import { Label } from "../ui/widgets/Label.js";
import { LogsViewer } from "../specialized/LogsViewer.js";
import { themeColors, fg } from "../../lib/theme.js";
import { getStatus, startServer, stopServer, serverLogLines, onServerLog } from "../../lib/server.js";
import { fireAsync, formatUptime } from "../../lib/utils.js";
import { BACKEND_LABELS } from "../../lib/versions.js";
import type { TabContext } from "../../lib/tabcontext.js";
import type { Size } from "../ui/types.js";

class StatusControl extends Control {
  measure(parentSize?: Size): Size {
    return { width: parentSize?.width ?? this.rect.width, height: 1 };
  }

  render(): void {
    if (!this.visible || !this.needsRender) return;
    const canvas = this.canvas;
    canvas.moveTo(this.rect.x, this.rect.y);

    const status = getStatus();
    const stateText = status.running ? "Running" : "Stopped";
    const stateColor = status.running ? themeColors.success : themeColors.textMuted;

    fg(canvas, stateColor, ` ${stateText}`);

    if (status.running && status.pid) {
      fg(canvas, themeColors.text, `  PID: ${status.pid}`);
      fg(canvas, themeColors.textMuted, `  Uptime: ${formatUptime(status.uptime)}`);
    }

    const endX = canvas.cursorX ?? this.rect.x;
    const padLen = this.rect.width - (endX - this.rect.x);
    if (padLen > 0) {
      fg(canvas, themeColors.canvas, " ".repeat(padLen));
    }

    this.needsRender = false;
  }
}

export class DashboardControl extends Control {
  protected _ctx: TabContext | null = null;
  protected _column: Column;
  protected _buttonRow: Row;
  protected _buttons: Button[];
  protected _profileLabel: Label;
  protected _versionLabel: Label;
  protected _statusControl: StatusControl;
  protected _logsControl: LogsViewer;
  protected _logUnsub: (() => void) | null = null;
  protected _logRenderTimer: ReturnType<typeof setTimeout> | null = null;
  protected _attached = false;

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
    sep1.color = themeColors.border;
    sep1.focusable = false;
    this._buttonRow.add(sep1);

      this._profileLabel = new Label();
    this._profileLabel.text = "";
    this._profileLabel.color = themeColors.textMuted;
    this._profileLabel.focusable = false;
    const profileLbl = this._profileLabel;
    this._profileLabel.measure = () => ({ width: "Profile: ".length + profileLbl.text.length, height: 1 });
    this._profileLabel.render = () => {
      if (!profileLbl.visible || !profileLbl.needsRender) return;
      const { canvas, rect } = profileLbl;
      canvas.moveTo(rect.x, rect.y);
      fg(canvas, themeColors.textMuted, "Profile: ");
      fg(canvas, themeColors.text, profileLbl.text);
      const endX = canvas.cursorX ?? rect.x;
      const padLen = rect.width - (endX - rect.x);
      if (padLen > 0) {
        fg(canvas, themeColors.canvas, " ".repeat(padLen));
      }
      profileLbl.needsRender = false;
    };
    this._buttonRow.add(this._profileLabel);

    const sep2 = new Label();
    sep2.text = "│";
    sep2.color = themeColors.border;
    sep2.focusable = false;
    this._buttonRow.add(sep2);

     this._versionLabel = new Label();
    this._versionLabel.text = "";
    this._versionLabel.color = themeColors.textMuted;
    this._versionLabel.focusable = false;
    const versionLbl = this._versionLabel;
    this._versionLabel.measure = () => ({ width: Math.max("Version: ".length + versionLbl.text.length, 1), height: 1 });
    this._versionLabel.render = () => {
      if (!versionLbl.visible || !versionLbl.needsRender) return;
      const { canvas, rect } = versionLbl;
      canvas.moveTo(rect.x, rect.y);
      fg(canvas, themeColors.textMuted, "Version: ");
      fg(canvas, themeColors.text, versionLbl.text);
      const endX = canvas.cursorX ?? rect.x;
      const padLen = rect.width - (endX - rect.x);
      if (padLen > 0) {
        fg(canvas, themeColors.canvas, " ".repeat(padLen));
      }
      versionLbl.needsRender = false;
    };
    this._buttonRow.add(this._versionLabel);

    this._statusControl = new StatusControl();
    this._logsControl = new LogsViewer({
      getLines: () => serverLogLines,
    });
    this._logsControl.flex = 1;

    this._column = new Column();
    this._column.add(this._buttonRow);
    this._column.add(new Divider());
    this._column.add(this._statusControl);
    this._column.add(new Divider());
    this._column.add(this._logsControl);

    this.add(this._column);
  }

  measure(parentSize?: Size): Size {
    return parentSize ? { width: parentSize.width, height: parentSize.height } : super.measure(parentSize);
  }

  onAttach(): void {
    if (!this._ctx || this._attached) return;
    this._attached = true;
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

    this.markDirty();
  }

  onDetach(): void {
    this._attached = false;
    if (this._logUnsub) {
      this._logUnsub();
      this._logUnsub = null;
    }
    if (this._logRenderTimer) {
      clearTimeout(this._logRenderTimer);
      this._logRenderTimer = null;
    }
    this._ctx = null;
  }

  onFocus(): void {
    super.onFocus();
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
}

export function createDashboardTab(ctx: TabContext): Control {
  return new DashboardControl(ctx);
}
