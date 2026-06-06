import { Control } from "./Control.js";
import type { Rect } from "./types.js";

export class Group extends Control {
  measure(): { width: number; height: number } {
    let maxWidth = 0;
    let maxHeight = 0;
    for (const child of this.children) {
      if (!child.visible) continue;
      const childSize = child.measure(this.rect);
      maxWidth = Math.max(maxWidth, childSize.width);
      maxHeight = Math.max(maxHeight, childSize.height);
    }
    return { width: maxWidth, height: maxHeight };
  }

  onLayout(): void {
    for (const child of this.children) {
      child.layout(this.rect);
    }
  }
}
