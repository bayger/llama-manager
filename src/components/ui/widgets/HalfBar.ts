import { Control } from "../Control.js";
import { fgBg, themeColors } from "../../../lib/theme.js";
import type { RenderContext, Size } from "../types.js";

export class HalfBar extends Control {
  focusable = false;
  public mode: 'top' | 'bottom' = 'top';

  measure(_parentSize?: Size): Size {
    return { width: this.rect.width || 80, height: 1 };
  }

  render(ctx: RenderContext): void {
    if (!this.visible || !this.needsRender) return;
    const canvas = ctx.canvas;
    const { x, y, width } = this.rect;

    const topColor = this.mode === 'top' ? themeColors.canvasSubtle : themeColors.canvas;
    const bottomColor = this.mode === 'top' ? themeColors.canvas : themeColors.canvasSubtle;

    canvas.colorRgbHex(topColor);
    canvas.bgColorRgbHex(bottomColor);
    canvas.moveTo(x, y);
    for (let i = 0; i < width; i++) {
      fgBg(canvas, topColor, bottomColor, "\u2584");
    }

    this.needsRender = false;
  }
}
