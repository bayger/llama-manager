import { Control } from "../ui/Control.js";
import { fg } from "../../lib/theme.js";
import { renderLogLine } from "../../lib/logcolors.js";
import type { Size, RenderContext } from "../ui/types.js";

export interface LogsViewerConfig {
  getLines: () => string[];
  emptyMessage?: string;
}

export class LogsViewer extends Control {
  protected _config: LogsViewerConfig;

  constructor(config: LogsViewerConfig) {
    super();
    this._config = config;
  }

  measure(parentSize?: Size): Size {
    return { width: parentSize?.width ?? this.rect.width, height: parentSize?.height ?? this.rect.height };
  }

  draw(ctx: RenderContext): void {
    const canvas = ctx.canvas;
    const { x, y, width, height } = this.rect;

    if (height <= 0) {
      return;
    }

    canvas.moveTo(x, y);

    const lines = this._config.getLines();
    const totalLines = lines.length;
    const startIdx = Math.max(0, totalLines - height);
    const visibleLines = lines.slice(startIdx);

    if (totalLines === 0 && this._config.emptyMessage) {
      const midY = y + Math.floor(height / 2);
      const pad = Math.max(0, Math.floor((width - this._config.emptyMessage.length) / 2));
      canvas.moveTo(x + pad, midY);
      fg(canvas, "textMuted", this._config.emptyMessage);
    } else {
      for (let i = 0; i < height; i++) {
        if (i < visibleLines.length) {
          renderLogLine(canvas, x, y + i, width, visibleLines[i]!);
        }
      }
    }
  }
}
