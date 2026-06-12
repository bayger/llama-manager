import { Control } from "../Control.js";
import { themeColors } from "../../../lib/theme.js";
import type { Size, RenderContext } from "../types.js";

export class Spacer extends Control {
  focusable = false;
  measure(_parentSize?: Size): Size {
    return { width: this.rect.width || 0, height: 1 };
  }

  render(ctx: RenderContext): void {
    if (!this.visible || !this.needsRender) return;
    const { canvas } = ctx;
    const { x, y, width, height } = this.rect;
    canvas.colorRgbHex(themeColors.canvas);
    canvas.bgColorRgbHex(themeColors.canvas);
    canvas.clearRect(x, y, width, height);
    this.needsRender = false;
  }
}
