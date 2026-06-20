import { Control } from "../Control";
import { fgBg } from "../../../lib/theme";
import type { RenderContext, Size } from "../types";

export class HalfBar extends Control {
  focusable = false;
  public mode: 'top' | 'bottom' = 'top';

  measure(_parentSize?: Size): Size {
    return { width: this.rect.width || 80, height: 1 };
  }

  draw(ctx: RenderContext): void {
    const canvas = ctx.canvas;
    const { x, y, width } = this.rect;

    const topColor = this.mode === 'top' ? "canvasSubtle" : "canvas";
    const bottomColor = this.mode === 'top' ? "canvas" : "canvasSubtle";

    canvas.setForegroundColor(topColor);
    canvas.setBackgroundColor(bottomColor);
    canvas.moveTo(x, y);
    for (let i = 0; i < width; i++) {
      fgBg(canvas, topColor, bottomColor, "\u2584");
    }
  }
}
