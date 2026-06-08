import { Control } from "../Control.js";
import { fg, themeColors } from "../../../lib/theme.js";
import type { Size } from "../types.js";

const SPINNER_FRAMES = ["\u240b", "\u2413", "\u2419", "\u2418", "\u243c", "\u2434", "\u2426", "\u2427", "\u2407", "\u240f"];

export class ProgressBar extends Control {
  focusable = false;
  public progress = 0;
  public label = "";
  public filledColor = themeColors.accent;
  public emptyColor = themeColors.border;
  public labelColor = themeColors.warning;
  public extraLabel = "";

  measure(_parentSize?: Size): Size {
    return { width: this.rect.width || 60, height: 2 };
  }

  render(): void {
    if (!this.visible || !this.needsRender) return;
    const { canvas, rect } = this;
    const { x, y, width } = rect;

    const barWidth = Math.max(10, width - this.label.length - 10);
    const filled = Math.round((this.progress / 100) * barWidth);
    const empty = barWidth - filled;
    const frame = SPINNER_FRAMES[Math.floor(Date.now() / 100) % SPINNER_FRAMES.length];

    canvas.moveTo(x, y);
    fg(canvas, this.labelColor, `${frame} ${this.label} ${this.progress}%`);
    if (this.extraLabel) {
      fg(canvas, themeColors.textMuted, ` ${this.extraLabel}`);
    }

    canvas.moveTo(x, y + 1);
    fg(canvas, this.filledColor, "\u2588".repeat(filled));
    fg(canvas, this.emptyColor, "\u2591".repeat(empty));

    this.needsRender = false;
  }
}
