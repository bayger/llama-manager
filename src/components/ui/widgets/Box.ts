import { Control } from "../Control.js";
import { fg, themeColors } from "../../../lib/theme.js";
import type { Size } from "../types.js";

const TL = "\u250c";
const TR = "\u2510";
const BL = "\u2514";
const BR = "\u2518";
const H = "\u2500";
const V = "\u2502";

export class Box extends Control {
  public borderColor = themeColors.border;
  public title = "";

  onLayout(): void {
    const { x, y, width, height } = this.rect;
    if (this.children.length > 0) {
      this.children[0].layout({
        x: x + 1,
        y: y + 1,
        width: Math.max(0, width - 2),
        height: Math.max(0, height - 2),
      });
    }
  }

  measure(_parentSize?: Size): Size {
    if (this.children.length > 0) {
      const childSize = this.children[0].measure({
        width: Math.max(0, this.rect.width - 2),
        height: Math.max(0, this.rect.height - 2),
      });
      return {
        width: childSize.width + 2,
        height: childSize.height + 2,
      };
    }
    return { width: this.rect.width || 20, height: this.rect.height || 4 };
  }

  render(): void {
    if (!this.visible || !this.needsRender) return;
    const { term, rect } = this;
    const { x, y, width, height } = rect;

    if (width < 4 || height < 3) {
      this.needsRender = false;
      return;
    }

    const innerW = width - 2;

    // Top border
    term.moveTo(x, y);
    fg(term, this.borderColor, TL);
    if (this.title) {
      const titlePadded = ` ${this.title} `.padEnd(innerW);
      fg(term, this.borderColor, titlePadded);
    } else {
      fg(term, this.borderColor, H.repeat(innerW));
    }
    fg(term, this.borderColor, TR);

    // Middle rows
    for (let row = 1; row < height - 1; row++) {
      term.moveTo(x, y + row);
      fg(term, this.borderColor, V);
    }

    // Render child
    if (this.children.length > 0) {
      this.children[0].render();
    }

    // Right border
    for (let row = 1; row < height - 1; row++) {
      term.moveTo(x + width - 1, y + row);
      fg(term, this.borderColor, V);
    }

    // Bottom border
    term.moveTo(x, y + height - 1);
    fg(term, this.borderColor, BL);
    fg(term, this.borderColor, H.repeat(innerW));
    fg(term, this.borderColor, BR);

    this.needsRender = false;
  }
}
