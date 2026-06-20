import { Control } from "../ui/Control";
import { LogsViewer } from "../specialized/LogsViewer";
import { serverLogLines, onServerLog } from "../../lib/server";
import type { TabContext } from "../../lib/tabcontext";
import type { Size, RenderContext } from "../ui/types";

export class LogsControl extends Control {
  protected _ctx: TabContext | null = null;
  protected _logsControl: LogsViewer;
  protected _logUnsub: (() => void) | null = null;
  protected _logRenderTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;

    this._logsControl = new LogsViewer({
      getLines: () => serverLogLines,
      emptyMessage: "Start the server to see logs",
    });
    this._logsControl.flex = 1;

    this.add(this._logsControl);
  }

  measure(parentSize?: Size): Size {
    return parentSize ? { width: parentSize.width, height: parentSize.height } : super.measure(parentSize);
  }

  onInit(): void {
    this._logUnsub = onServerLog(() => {
      if (this._logRenderTimer) clearTimeout(this._logRenderTimer);
      this._logRenderTimer = setTimeout(() => {
        this.markDirty();
      }, 200);
    });
    this.markDirty();
  }

  onDestroy(): void {
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

  draw(_ctx: RenderContext): void {
    // nothing extra to do
  }

  onFocus(): void {
    super.onFocus();
  }
}

export function createLogsTab(ctx: TabContext): Control {
  return new LogsControl(ctx);
}
