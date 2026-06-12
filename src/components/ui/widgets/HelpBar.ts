import { Control } from "../Control.js";
import { fg, themeColors } from "../../../lib/theme.js";
import type { Size, RenderContext } from "../types.js";

export class HelpBar extends Control {
  focusable = false;
  public text = "";
  public prefix = "";
  public prefixColor = themeColors.success;

  measure(_parentSize?: Size): Size {
    return { width: this.rect.width || 40, height: 2 };
  }

  render(ctx: RenderContext): void {
    if (!this.visible || !this.needsRender) return;
    super.render(ctx);
    const { canvas } = ctx;
    const { x, y, width } = this.rect;

    const left = Math.floor((width - this.text.length) / 2);
    canvas.moveTo(x + left, y + 1);
    fg(canvas, themeColors.textMuted, this.text);
    if (this.prefix) {
      fg(canvas, this.prefixColor, this.prefix);
    }

    this.needsRender = false;
  }
}
