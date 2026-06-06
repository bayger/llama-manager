import { Control } from "../Control.js";
import { fg, themeColors } from "../../../lib/theme.js";
import type { Size } from "../types.js";

export class Label extends Control {
  focusable = false;
  public text = "";
  public color = themeColors.text;
  public bold = false;
  public padding = 0;
  public align: "left" | "center" = "left";

  measure(_parentSize?: Size): Size {
    const len = this.text.length + this.padding * 2;
    return { width: len, height: 1 };
  }

  render(): void {
    if (!this.visible || !this.needsRender) return;
    const { term, rect } = this;
    term.moveTo(rect.x, rect.y);
    if (this.bold) term.bold();
    if (this.align === "center") {
      const pad = Math.max(0, (rect.width - this.text.length) / 2);
      term(" ".repeat(pad));
    } else if (this.padding > 0) {
      term(" ".repeat(this.padding));
    }
    fg(term, this.color, this.text);
    term.styleReset();
    this.needsRender = false;
  }
}
