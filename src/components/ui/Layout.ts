import { Control } from "./Control.js";
import type { Rect, Size, RenderContext } from "./types.js";

export class Column extends Control {
  focusable = false;

  measure(parentSize: Size): Size {
    let totalHeight = 0;
    let fixedHeight = 0;
    let flexTotal = 0;
    let hasFlex = false;

    for (const child of this.children) {
      if (!child.visible) continue;
      const childSize = child.measure(parentSize);
      if (child.flex > 0) {
        hasFlex = true;
        flexTotal += child.flex;
      } else {
        fixedHeight += childSize.height;
      }
      totalHeight = Math.max(totalHeight, childSize.height);
    }

    return {
      width: parentSize.width,
      height: hasFlex ? parentSize.height : fixedHeight,
    };
  }

  onLayout(): void {
    const { x, y, width, height } = this.rect;
    const padding = 1;
    let currentY = y;
    let fixedTotal = 0;
    let flexTotal = 0;
    const innerWidth = width - padding * 2;

    const visibleChildren = this.children.filter(c => c.visible);

    for (const child of visibleChildren) {
      if (child.flex > 0) {
        flexTotal += child.flex;
      } else {
        const childSize = child.measure({ width: innerWidth, height: height });
        fixedTotal += childSize.height;
      }
    }

    const flexSpace = Math.max(0, height - fixedTotal);
    let measuredHeight = 0;

    for (const child of visibleChildren) {
      if (child.flex > 0) {
        const childHeight = flexSpace > 0 ? Math.floor((child.flex / flexTotal) * flexSpace) : 0;
        child.layout({ x: x + padding, y: currentY, width: innerWidth, height: childHeight });
        currentY += childHeight;
        measuredHeight += childHeight;
      } else {
        const remainingHeight = height - measuredHeight;
        const childSize = child.measure({ width: innerWidth, height: Math.max(0, remainingHeight) });
        child.layout({ x: x + padding, y: currentY, width: innerWidth, height: childSize.height });
        currentY += childSize.height;
        measuredHeight += childSize.height;
      }
    }
  }

  render(ctx: RenderContext): void {
    if (!this.visible || !this.needsRender) return;
    const prevClip = ctx.canvas.getClipRect();
    ctx.canvas.setClipRect(this.rect);
    for (const child of this.children) {
      child.render(ctx);
    }
    ctx.canvas.setClipRect(prevClip);
    this.needsRender = false;
  }
}

export class Row extends Control {
  focusable = false;

  measure(parentSize: Size): Size {
    const gap = 1;
    let totalWidth = 0;
    let fixedWidth = 0;
    let flexTotal = 0;
    let hasFlex = false;
    let maxHeight = 0;
    let visibleCount = 0;

    for (const child of this.children) {
      if (!child.visible) continue;
      visibleCount++;
      const childSize = child.measure(parentSize);
      if (child.flex > 0) {
        hasFlex = true;
        flexTotal += child.flex;
      } else {
        fixedWidth += childSize.width;
      }
      maxHeight = Math.max(maxHeight, childSize.height);
    }

    const totalGap = Math.max(0, visibleCount - 1) * gap;

    return {
      width: hasFlex ? parentSize.width : fixedWidth + totalGap,
      height: maxHeight,
    };
  }

  onLayout(): void {
    const gap = 1;
    const { x, y, width, height } = this.rect;
    let currentX = x;
    const visibleChildren = this.children.filter(c => c.visible);

    let fixedTotal = 0;
    let flexTotal = 0;
    for (const child of visibleChildren) {
      if (child.flex > 0) {
        flexTotal += child.flex;
      } else {
        const childSize = child.measure({ width, height });
        fixedTotal += childSize.width;
      }
    }

    const totalGap = Math.max(0, visibleChildren.length - 1) * gap;
    const flexSpace = Math.max(0, width - fixedTotal - totalGap);

    for (let i = 0; i < visibleChildren.length; i++) {
      const child = visibleChildren[i]!;
      if (child.flex > 0) {
        const cw = flexSpace > 0 ? Math.floor((child.flex / flexTotal) * flexSpace) : 0;
        child.layout({ x: currentX, y, width: cw, height });
        currentX += cw;
      } else {
        const childSize = child.measure({ width, height });
        child.layout({ x: currentX, y, width: childSize.width, height });
        currentX += childSize.width;
      }
      if (i < visibleChildren.length - 1) {
        currentX += gap;
      }
    }
  }

  render(ctx: RenderContext): void {
    if (!this.visible || !this.needsRender) return;
    const prevClip = ctx.canvas.getClipRect();
    ctx.canvas.setClipRect(this.rect);
    for (const child of this.children) {
      child.render(ctx);
    }
    ctx.canvas.setClipRect(prevClip);
    this.needsRender = false;
  }
}
