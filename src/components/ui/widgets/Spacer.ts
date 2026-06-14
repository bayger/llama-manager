import { Control } from "../Control.js";

import type { Size, RenderContext } from "../types.js";

export class Spacer extends Control {
  focusable = false;
  measure(_parentSize?: Size): Size {
    return { width: this.rect.width || 0, height: 1 };
  }

  draw(_ctx: RenderContext): void {}
}
