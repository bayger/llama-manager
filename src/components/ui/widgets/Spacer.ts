import { Control } from "../Control.js";

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
    canvas.setForegroundColor("canvas");
    canvas.setBackgroundColor("canvas");
    canvas.clearRect(x, y, width, height);
    this.needsRender = false;
  }
}
