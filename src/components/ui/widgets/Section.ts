import { Control } from "../Control.js";
import { fg, themeColors } from "../../../lib/theme.js";
import type { Size, RenderContext } from "../types.js";

const V = "\u2502";

export class Section extends Control {
  focusable = false;
  public title = "";

  measure(parentSize?: Size): Size {
    const p = parentSize || { width: this.rect.width || 80, height: this.rect.height || 4 };

    let fixedHeight = 2;
    let flexTotal = 0;
    let hasFlex = false;

    for (const child of this.children) {
      if (!child.visible) continue;
      if (child.flex > 0) {
        hasFlex = true;
        flexTotal += child.flex;
      } else {
        const s = child.measure({ width: Math.max(0, p.width - 2), height: p.height });
        fixedHeight += s.height;
      }
    }

    return {
      width: p.width,
      height: hasFlex ? p.height : fixedHeight,
    };
  }

  onLayout(): void {
    const { x, y, width, height } = this.rect;
    const innerW = Math.max(0, width - 2);
    let curY = y + 2;

    let fixedTotal = 2;
    let flexTotal = 0;
    const visibleChildren = this.children.filter(c => c.visible);

    for (const child of visibleChildren) {
      if (child.flex > 0) {
        flexTotal += child.flex;
      } else {
        const s = child.measure({ width: innerW, height: height });
        fixedTotal += s.height;
      }
    }

    const flexSpace = Math.max(0, height - fixedTotal);

    for (const child of visibleChildren) {
      if (child.flex > 0) {
        const h = flexSpace > 0 ? Math.floor((child.flex / flexTotal) * flexSpace) : 0;
        child.layout({ x: x + 2, y: curY, width: innerW, height: h });
        curY += h;
      } else {
        const s = child.measure({ width: innerW, height: Math.max(0, height - (curY - y)) });
        child.layout({ x: x + 2, y: curY, width: innerW, height: s.height });
        curY += s.height;
      }
    }
  }

  render(ctx: RenderContext): void {
    if (!this.visible || !this.needsRender) return;

    const { canvas } = ctx;
    const { x, y, width, height } = this.rect;

    const prevClip = canvas.getClipRect();
    canvas.setClipRect(this.rect);
    canvas.colorRgbHex(themeColors.canvas);
    canvas.bgColorRgbHex(themeColors.canvasSubtle);
    canvas.clearRect(x, y, width, height);

    if (width < 3 || height < 2) {
      canvas.setClipRect(prevClip);
      this.needsRender = false;
      return;
    }

    // Caption row
    canvas.moveTo(x, y);
    canvas.bold();
    fg(canvas, themeColors.accent, V);
    fg(canvas, themeColors.accent, ` ${this.title}`);
    canvas.bold(false);

    // Left border
    for (let row = 1; row < height; row++) {
      canvas.moveTo(x, y + row);
      canvas.colorRgbHex(themeColors.borderMuted);
      canvas.write(V);
    }

    // Children
    for (const child of this.children) {
      child.render(ctx);
    }

    canvas.setClipRect(prevClip);
    this.needsRender = false;
  }
}
