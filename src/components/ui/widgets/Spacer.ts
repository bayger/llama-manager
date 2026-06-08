import { Control } from "../Control.js";
import type { Size } from "../types.js";

export class Spacer extends Control {
  focusable = false;
  measure(_parentSize?: Size): Size {
    return { width: 0, height: 0 };
  }

  render(): void {
    if (!this.visible || !this.needsRender) return;
    const { canvas, rect } = this;
    for (let row = 0; row < rect.height; row++) {
      canvas.moveTo(rect.x, rect.y + row);
      canvas.eraseLine();
    }
    this.needsRender = false;
  }
}
