import { Control } from "../Control.js";
import { fg, themeColors } from "../../../lib/theme.js";
import type { Size } from "../types.js";

export class Divider extends Control {
  focusable = false;
  public char = "\u2500";
  public color = themeColors.border;

  measure(_parentSize?: Size): Size {
    return { width: this.rect.width || 40, height: 1 };
  }

  render(): void {
    if (!this.visible || !this.needsRender) return;
    const { canvas, rect } = this;
    canvas.moveTo(rect.x, rect.y);
    fg(canvas, this.color, this.char.repeat(rect.width));
    this.needsRender = false;
  }
}
