import { Control } from "../Control.js";
import type { Size, RenderContext } from "../types.js";

export class Spacer extends Control {
  focusable = false;
  measure(_parentSize?: Size): Size {
    return { width: 0, height: 0 };
  }

  render(ctx: RenderContext): void {
    if (!this.visible || !this.needsRender) return;
    const { canvas } = ctx;
    const { x, y, height } = this.rect;
    for (let row = 0; row < height; row++) {
      canvas.moveTo(x, y + row);
      canvas.eraseLine();
    }
    this.needsRender = false;
  }
}
