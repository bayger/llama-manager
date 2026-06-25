import { Control } from "../Control";
import { fgBg } from "../../../lib/theme";
import type { Color } from "../../../lib/theme";
import type { Size, RenderContext } from "../types";

export class ProgressBar extends Control {
  focusable = false;
  protected _progress = 0;
  protected _filledColor: Color = "accent";
  protected _emptyColor: Color = "border";

  get progress(): number { return this._progress; }
  set progress(v: number) { if (v !== this._progress) { this._progress = v; this.markDirty(); } }

  get filledColor(): Color { return this._filledColor; }
  set filledColor(v: Color) { if (v !== this._filledColor) { this._filledColor = v; this.markDirty(); } }

  get emptyColor(): Color { return this._emptyColor; }
  set emptyColor(v: Color) { if (v !== this._emptyColor) { this._emptyColor = v; this.markDirty(); } }

  measure(_parentSize?: Size): Size {
    return { width: this.rect.width || 60, height: 1 };
  }

  draw(ctx: RenderContext): void {
    const { canvas } = ctx;
    const { x, y, width } = this.rect;

    const barWidth = Math.max(10, width);
    const exactFilled = (this.progress / 100) * barWidth;
    const fullBlocks = Math.floor(exactFilled);
    const remainder = Math.round((exactFilled - fullBlocks) * 8);
    const empty = barWidth - fullBlocks - (remainder > 0 ? 1 : 0);

    // Partial fill characters: index 0=none, 1-8=eighths
    const partialBlocks = ["", "\u258F", "\u258E", "\u258D", "\u258C", "\u258B", "\u258A", "\u2589", "\u2588"];

    canvas.moveTo(x, y);
    fgBg(canvas, this.filledColor, this.filledColor, " ".repeat(fullBlocks));
    if (remainder > 0) {
      fgBg(canvas, this.filledColor, this.emptyColor, partialBlocks[remainder]);
    }
    fgBg(canvas, this.emptyColor, this.emptyColor, " ".repeat(empty));
  }
}
