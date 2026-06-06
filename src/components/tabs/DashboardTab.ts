import { Control } from "../ui/Control.js";
import { Column, Row } from "../ui/Layout.js";
import { Button } from "../ui/widgets/Button.js";
import { Divider } from "../ui/widgets/Divider.js";
import { LogsViewer } from "../specialized/LogsViewer.js";
import { themeColors, fg } from "../../lib/theme.js";
import { getStatus, startServer, stopServer, serverLogLines, onServerLog } from "../../lib/server.js";
import { getServerMetrics, MetricsData } from "../../lib/api.js";
import { fireAsync, formatUptime } from "../../lib/utils.js";
import type { TabContext } from "../../lib/tabcontext.js";
import type { Size } from "../ui/types.js";

class MetricsControl extends Control {
  public _metrics: MetricsData | null = null;

  measure(parentSize?: Size): Size {
    return { width: parentSize?.width ?? this.rect.width, height: 2 };
  }

  render(): void {
    if (!this.visible || !this.needsRender) return;
    const term = this.term;
    const { x, y, width } = this.rect;

    const m = this._metrics;
    const colW = Math.floor((width - 1) / 2);

    const metrics = [
      { label: "Prompt/s", value: m ? m.promptTokensPerSec.toFixed(1) : "—" },
      { label: "Predict/s", value: m ? m.predictedTokensPerSec.toFixed(1) : "—" },
      { label: "Processing", value: m ? String(m.requestsProcessing) : "—" },
      { label: "Deferred", value: m ? String(m.requestsDeferred) : "—" },
    ];

    for (let row = 0; row < 2; row++) {
      term.moveTo(x, y + row);
      for (let col = 0; col < 2; col++) {
        const idx = row * 2 + col;
        const met = metrics[idx]!;
        const cell = ` ${met.label}: ${met.value} `.padEnd(colW);
        fg(term, themeColors.textMuted, cell.substring(0, colW));
      }
    }

    this.needsRender = false;
  }
}

class StatusControl extends Control {
  measure(parentSize?: Size): Size {
    return { width: parentSize?.width ?? this.rect.width, height: 1 };
  }

  render(): void {
    if (!this.visible || !this.needsRender) return;
    const term = this.term;
    term.moveTo(this.rect.x, this.rect.y);

    const status = getStatus();
    const stateText = status.running ? "Running" : "Stopped";
    const stateColor = status.running ? themeColors.success : themeColors.textMuted;

    fg(term, stateColor, ` ${stateText}`);

    if (status.running && status.pid) {
      fg(term, themeColors.text, `  PID: ${status.pid}`);
      fg(term, themeColors.textMuted, `  Uptime: ${formatUptime(status.uptime)}`);
    }

    const endX = (term as any).cursorX ?? this.rect.x;
    const padLen = this.rect.width - (endX - this.rect.x);
    if (padLen > 0) {
      fg(term, themeColors.canvas, " ".repeat(padLen));
    }

    this.needsRender = false;
  }
}

export class DashboardControl extends Control {
  protected _ctx: TabContext | null = null;
  protected _column: Column;
  protected _buttonRow: Row;
  protected _buttons: Button[];
  protected _metricsControl: MetricsControl;
  protected _statusControl: StatusControl;
  protected _logsControl: LogsViewer;
  protected _logUnsub: (() => void) | null = null;
  protected _logRenderTimer: ReturnType<typeof setTimeout> | null = null;
  protected _metricsTimer: ReturnType<typeof setInterval> | null = null;
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

    this._metricsControl = new MetricsControl();
    this._statusControl = new StatusControl();
    this._logsControl = new LogsViewer({
      getLines: () => serverLogLines,
    });
    this._logsControl.flex = 1;

    this._column = new Column();
    this._column.add(this._buttonRow);
    this._column.add(new Divider());
    this._column.add(this._metricsControl);
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
      ctx.scheduleRender();
    });

    buttons[1]?.setAction(() => {
      fireAsync(async () => {
        await stopServer();
      }, ctx);
      this.markDirty();
      ctx.scheduleRender();
    });

    buttons[2]?.setAction(() => {
      fireAsync(async () => {
        const config = ctx.getConfig();
        if (!config) throw new Error("No config loaded");
        await stopServer();
        await startServer(config);
      }, ctx);
      this.markDirty();
      ctx.scheduleRender();
    });

    this._metricsTimer = setInterval(() => {
      const config = ctx.getConfig();
      if (!config) return;
      getServerMetrics(config).then((m) => {
        this._metricsControl._metrics = m;
        this.markDirty();
        ctx.scheduleRender();
      }).catch(() => {
        this._metricsControl._metrics = null;
        this.markDirty();
        ctx.scheduleRender();
      });
    }, 2000);

    this._logUnsub = onServerLog(() => {
      if (this._logRenderTimer) clearTimeout(this._logRenderTimer);
      this._logRenderTimer = setTimeout(() => {
        this.markDirty();
        ctx.scheduleRender();
      }, 200);
    });

    this.needsRender = true;
  }

  onDetach(): void {
    this._attached = false;
    if (this._metricsTimer) {
      clearInterval(this._metricsTimer);
      this._metricsTimer = null;
    }
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

  markDirty(): void {
    super.markDirty();
    this._ctx?.scheduleRender();
  }
}

export function createDashboardTab(ctx: TabContext): Control {
  return new DashboardControl(ctx);
}
