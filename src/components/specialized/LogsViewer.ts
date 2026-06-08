import { Control } from "../ui/Control.js";
import { themeColors, fg } from "../../lib/theme.js";
import { renderLogLine } from "../../lib/logcolors.js";
import type { Size } from "../ui/types.js";

export interface LogsViewerConfig {
  getLines: () => string[];
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

  render(): void {
    if (!this.visible || !this.needsRender) return;
    const canvas = this.canvas;
    const { x, y, width, height } = this.rect;

    if (height <= 0) {
      this.needsRender = false;
      return;
    }

    const lines = this._config.getLines();
    const totalLines = lines.length;
    const startIdx = Math.max(0, totalLines - height);
    const visibleLines = lines.slice(startIdx);

    for (let i = 0; i < height; i++) {
      if (i < visibleLines.length) {
        renderLogLine(canvas, x, y + i, width, visibleLines[i]!);
      } else {
        canvas.moveTo(x, y + i);
        fg(canvas, themeColors.canvas, " ".repeat(width));
      }
    }

    this.needsRender = false;
  }
}
