import { Control } from "../Control";

import type { Size, RenderContext } from "../types";

export class Spacer extends Control {
  focusable = false;
  measure(_parentSize?: Size): Size {
    return { width: 1, height: 1 };
  }

  draw(_ctx: RenderContext): void {}
}
