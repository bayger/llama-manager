import { Control } from "../Control.js";
import { fg, themeColors } from "../../../lib/theme.js";
import type { Size, RenderContext } from "../types.js";

export class Divider extends Control {
  focusable = false;
  public char = "\u2500";
  public color = themeColors.border;

  measure(_parentSize?: Size): Size {
    return { width: this.rect.width || 40, height: 1 };
  }

  render(ctx: RenderContext): void {
    if (!this.visible || !this.needsRender) return;
    const { canvas } = ctx;
    canvas.moveTo(this.rect.x, this.rect.y);
    fg(canvas, this.color, this.char.repeat(this.rect.width));
    this.needsRender = false;
  }
}
