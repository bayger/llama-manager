import { Control } from "../Control.js";
import { fg, themeColors } from "../../../lib/theme.js";
import { focusManager } from "../FocusManager.js";
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

  onFocus(): void {
    super.onFocus();
    this.markDirty();
  }

  onBlur(): void {
    super.onBlur();
    this.markDirty();
  }

render(): void {
    if (!this.visible || !this.needsRender) return;
    const { canvas, rect } = this;
    canvas.moveTo(rect.x, rect.y);
    if (this.bold) canvas.bold();
    if (this.align === "center") {
      const pad = Math.max(0, (rect.width - this.text.length) / 2);
      canvas.write(" ".repeat(pad));
    } else if (this.padding > 0) {
      canvas.write(" ".repeat(this.padding));
    }
    const isFocused = focusManager.getFocused() === this;
    const prefix = isFocused ? "> " : "";
    fg(canvas, this.color, prefix + this.text);
    canvas.styleReset();
    this.needsRender = false;
  }
}
