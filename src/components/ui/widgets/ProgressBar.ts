import { Control } from "../Control.js";
import { fg, themeColors } from "../../../lib/theme.js";
import type { Size, RenderContext } from "../types.js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠇"];

export class ProgressBar extends Control {
  focusable = false;
  protected _progress = 0;
  protected _label = "";
  protected _filledColor = themeColors.accent;
  protected _emptyColor = themeColors.border;
  protected _labelColor = themeColors.warning;
  protected _extraLabel = "";

  get progress(): number { return this._progress; }
  set progress(v: number) { if (v !== this._progress) { this._progress = v; this.markDirty(); } }

  get label(): string { return this._label; }
  set label(v: string) { if (v !== this._label) { this._label = v; this.markDirty(); } }

  get filledColor(): string { return this._filledColor; }
  set filledColor(v: string) { if (v !== this._filledColor) { this._filledColor = v; this.markDirty(); } }

  get emptyColor(): string { return this._emptyColor; }
  set emptyColor(v: string) { if (v !== this._emptyColor) { this._emptyColor = v; this.markDirty(); } }

  get labelColor(): string { return this._labelColor; }
  set labelColor(v: string) { if (v !== this._labelColor) { this._labelColor = v; this.markDirty(); } }

  get extraLabel(): string { return this._extraLabel; }
  set extraLabel(v: string) { if (v !== this._extraLabel) { this._extraLabel = v; this.markDirty(); } }

  measure(_parentSize?: Size): Size {
    return { width: this.rect.width || 60, height: 2 };
  }

  render(ctx: RenderContext): void {
    if (!this.visible || !this.needsRender) return;
    super.render(ctx);
    const { canvas } = ctx;
    const { x, y, width } = this.rect;

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
