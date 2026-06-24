import { Control } from "../Control";
import { fg, fgBg, themeColors } from "../../../lib/theme";
import { spinnerChar } from "../../../lib/utils";
import type { Color } from "../../../lib/theme";
import type { Size, RenderContext } from "../types";

export class ProgressBar extends Control {
  focusable = false;
  protected _progress = 0;
  protected _label = "";
  protected _filledColor: Color = "accent";
  protected _emptyColor: Color = "border";
  protected _labelColor: Color = "warning";
  protected _extraLabel = "";

  get progress(): number { return this._progress; }
  set progress(v: number) { if (v !== this._progress) { this._progress = v; this.markDirty(); } }

  get label(): string { return this._label; }
  set label(v: string) { if (v !== this._label) { this._label = v; this.markDirty(); } }

  get filledColor(): Color { return this._filledColor; }
  set filledColor(v: Color) { if (v !== this._filledColor) { this._filledColor = v; this.markDirty(); } }

  get emptyColor(): Color { return this._emptyColor; }
  set emptyColor(v: Color) { if (v !== this._emptyColor) { this._emptyColor = v; this.markDirty(); } }

  get labelColor(): Color { return this._labelColor; }
  set labelColor(v: Color) { if (v !== this._labelColor) { this._labelColor = v; this.markDirty(); } }

  get extraLabel(): string { return this._extraLabel; }
  set extraLabel(v: string) { if (v !== this._extraLabel) { this._extraLabel = v; this.markDirty(); } }

  measure(_parentSize?: Size): Size {
    return { width: this.rect.width || 60, height: 2 };
  }

  draw(ctx: RenderContext): void {
    const { canvas } = ctx;
    const { x, y, width } = this.rect;

    const barWidth = Math.max(10, width);
    const exactFilled = (this.progress / 100) * barWidth;
    const fullBlocks = Math.floor(exactFilled);
    const remainder = Math.round((exactFilled - fullBlocks) * 8);
    const empty = barWidth - fullBlocks - (remainder > 0 ? 1 : 0);
    const frame = spinnerChar();

    // Partial fill characters: index 0=none, 1-8=eighths
    const partialBlocks = ["", "\u258F", "\u258E", "\u258D", "\u258C", "\u258B", "\u258A", "\u2589", "\u2588"];

    canvas.moveTo(x, y);
    fg(canvas, this.labelColor, `${frame} ${this.label} ${this.progress.toFixed(1)}%`);
    if (this.extraLabel) {
      fg(canvas, "textMuted", ` ${this.extraLabel}`);
    }

    canvas.moveTo(x, y + 1);
    fgBg(canvas, this.filledColor, this.filledColor, " ".repeat(fullBlocks));
    if (remainder > 0) {
      fgBg(canvas, this.filledColor, this.emptyColor, partialBlocks[remainder]);
    }
    fgBg(canvas, this.emptyColor, this.emptyColor, " ".repeat(empty));
  }
}
