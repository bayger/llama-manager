import { Control } from "../ui/Control.js";
import { LogsViewer } from "../specialized/LogsViewer.js";
import { serverLogLines, onServerLog } from "../../lib/server.js";
import type { TabContext } from "../../lib/tabcontext.js";
import type { Size } from "../ui/types.js";

export class LiveLogsControl extends Control {
  protected _ctx: TabContext | null = null;
  protected _viewer: LogsViewer;
  protected _logUnsub: (() => void) | null = null;
  protected _logRenderTimer: ReturnType<typeof setTimeout> | null = null;
  protected _attached = false;

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;
    this._viewer = new LogsViewer({
      getLines: () => serverLogLines,
    });
    this.add(this._viewer);
  }

  measure(parentSize?: Size): Size {
    return parentSize ? { width: parentSize.width, height: parentSize.height } : super.measure(parentSize);
  }

  onAttach(): void {
    if (!this._ctx || this._attached) return;
    this._attached = true;
    const ctx = this._ctx;

    this._logUnsub = onServerLog(() => {
      if (this._logRenderTimer) clearTimeout(this._logRenderTimer);
      this._logRenderTimer = setTimeout(() => {
        this._viewer.markDirty();
        ctx.scheduleRender();
      }, 200);
    });

    this._viewer.needsRender = true;
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
}

export function createLiveLogsTab(ctx: TabContext): Control {
  return new LiveLogsControl(ctx);
}
