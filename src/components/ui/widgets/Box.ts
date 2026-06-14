import { Control } from "../Control.js";
import { fg } from "../../../lib/theme.js";
import type { Color } from "../../../lib/theme.js";
import type { Size, RenderContext } from "../types.js";

const TL = "\u250c";
const TR = "\u2510";
const BL = "\u2514";
const BR = "\u2518";
const H = "\u2500";
const V = "\u2502";

export class Box extends Control {
  focusable = false;
  public borderColor: Color = "border";
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

  render(ctx: RenderContext): void {
    if (!this.visible || !this.needsRender) return;
    const { canvas } = ctx;
    const { x, y, width, height } = this.rect;

    const prevClip = canvas.getClipRect();
    canvas.setClipRect(this.rect);
    canvas.setForegroundColor("canvas");
    canvas.setBackgroundColor("canvas");
    canvas.clearRect(x, y, width, height);

    if (width < 4 || height < 3) {
      canvas.setClipRect(prevClip);
      this.needsRender = false;
      return;
    }

    const innerW = width - 2;

    // Top border
    canvas.moveTo(x, y);
    fg(canvas, this.borderColor, TL);
    if (this.title) {
      fg(canvas, this.borderColor, H);
      fg(canvas, "accentColor", ` ${this.title} `);
      fg(canvas, this.borderColor, H.repeat(Math.max(0, innerW - this.title.length - 2)));
      fg(canvas, this.borderColor, H);
    } else {
      fg(canvas, this.borderColor, H.repeat(innerW));
    }
    fg(canvas, this.borderColor, TR);

    // Middle rows
    for (let row = 1; row < height - 1; row++) {
      canvas.moveTo(x, y + row);
      fg(canvas, this.borderColor, V);
    }

    // Render child
    if (this.children.length > 0) {
      this.children[0].render(ctx);
    }

    // Right border
    for (let row = 1; row < height - 1; row++) {
      canvas.moveTo(x + width - 1, y + row);
      fg(canvas, this.borderColor, V);
    }

    // Bottom border
    canvas.moveTo(x, y + height - 1);
    fg(canvas, this.borderColor, BL);
    fg(canvas, this.borderColor, H.repeat(innerW));
    fg(canvas, this.borderColor, BR);

    canvas.setClipRect(prevClip);
    this.needsRender = false;
  }
}
