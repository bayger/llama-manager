import { Control } from "../ui/Control.js";
import { Column } from "../ui/Layout.js";
import { ButtonBar } from "../ui/widgets/ButtonBar.js";
import { Button } from "../ui/widgets/Button.js";
import { themeColors, fg } from "../../lib/theme.js";
import { getStatus, startServer, stopServer, serverLogLines, onServerLog } from "../../lib/server.js";
import { fireAsync, formatUptime } from "../../lib/utils.js";
import type { TabContext } from "../../lib/tabcontext.js";
import type { Size } from "../ui/types.js";

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

class LogsControl extends Control {
  render(): void {
    if (!this.visible || !this.needsRender) return;
    const term = this.term;
    const { x, y, width, height } = this.rect;

    if (height <= 0) {
      this.needsRender = false;
      return;
    }

    const totalLines = serverLogLines.length;
    const startIdx = Math.max(0, totalLines - height);
    const visibleLines = serverLogLines.slice(startIdx);

    for (let i = 0; i < height; i++) {
      term.moveTo(x, y + i);
      if (i < visibleLines.length) {
        const line = visibleLines[i]!;
        const truncated = line.substring(0, width);
        fg(term, this.getLineColor(line), truncated);
      } else {
        fg(term, themeColors.canvas, " ".repeat(width));
      }
    }

    this.needsRender = false;
  }

  protected getLineColor(line: string): string {
    if (line.includes("ERROR") || line.includes("FATAL") || line.includes("[E]")) return themeColors.danger;
    if (line.includes("WARN") || line.includes("[W]")) return themeColors.warning;
    if (line.includes("DEBUG") || line.includes("[D]")) return themeColors.textMuted;
    return themeColors.text;
  }
}

export class DashboardControl extends Control {
  protected _ctx: TabContext | null = null;
  protected _column: Column;
  protected _buttonBar: ButtonBar;
  protected _statusControl: StatusControl;
  protected _logsControl: LogsControl;
  protected _logUnsub: (() => void) | null = null;
  protected _logRenderTimer: ReturnType<typeof setTimeout> | null = null;
  protected _attached = false;

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;

    this._buttonBar = new ButtonBar();
    this._buttonBar.add(new Button({ label: "Start" }));
    this._buttonBar.add(new Button({ label: "Stop" }));
    this._buttonBar.add(new Button({ label: "Restart" }));

    this._statusControl = new StatusControl();
    this._logsControl = new LogsControl();
    this._logsControl.flex = 1;

    this._column = new Column();
    this._column.add(this._buttonBar);
    this._column.add(this._statusControl);
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
    const buttons = this._buttonBar.getButtons();

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
    this._buttonBar.focus();
  }

  markDirty(): void {
    super.markDirty();
    this._ctx?.scheduleRender();
  }
}

export function createDashboardTab(ctx: TabContext): Control {
  return new DashboardControl(ctx);
}
