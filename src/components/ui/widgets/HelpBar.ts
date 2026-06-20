import { Control } from "../Control";
import { fg } from "../../../lib/theme";
import type { Color } from "../../../lib/theme";
import type { Size, RenderContext } from "../types";

export class HelpBar extends Control {
  focusable = false;
  public text = "";
  public prefix = "";
  public prefixColor: Color = "success";

  measure(_parentSize?: Size): Size {
    return { width: this.rect.width || 40, height: 2 };
  }

  draw(ctx: RenderContext): void {
    const { canvas } = ctx;
    const { x, y, width } = this.rect;

    const left = Math.floor((width - this.text.length) / 2);
    canvas.moveTo(x + left, y + 1);
    fg(canvas, "textMuted", this.text);
    if (this.prefix) {
      fg(canvas, this.prefixColor, this.prefix);
    }
  }
}
