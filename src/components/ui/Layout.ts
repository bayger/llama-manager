import { Control } from "./Control.js";
import type { Rect, Size } from "./types.js";

export class Column extends Control {
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
    let currentY = y;
    let remainingHeight = height;

    const visibleChildren = this.children.filter(c => c.visible);

    let fixedTotal = 0;
    let flexTotal = 0;
    for (const child of visibleChildren) {
      if (child.flex > 0) {
        flexTotal += child.flex;
      } else {
        const childSize = child.measure({ width, height: remainingHeight });
        fixedTotal += childSize.height;
      }
    }

    const flexSpace = Math.max(0, height - fixedTotal);

    for (const child of visibleChildren) {
      if (child.flex > 0) {
        const childHeight = flexSpace > 0 ? Math.floor((child.flex / flexTotal) * flexSpace) : 0;
        child.layout({ x, y: currentY, width, height: childHeight });
        currentY += childHeight;
      } else {
        const childSize = child.measure({ width, height: remainingHeight });
        child.layout({ x, y: currentY, width, height: childSize.height });
        currentY += childSize.height;
      }
    }
  }
}

export class Row extends Control {
  measure(parentSize: Size): Size {
    let totalWidth = 0;
    let fixedWidth = 0;
    let flexTotal = 0;
    let hasFlex = false;
    let maxHeight = 0;

    for (const child of this.children) {
      if (!child.visible) continue;
      const childSize = child.measure(parentSize);
      if (child.flex > 0) {
        hasFlex = true;
        flexTotal += child.flex;
      } else {
        fixedWidth += childSize.width;
      }
      maxHeight = Math.max(maxHeight, childSize.height);
    }

    return {
      width: hasFlex ? parentSize.width : fixedWidth,
      height: maxHeight,
    };
  }

  onLayout(): void {
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

    const flexSpace = Math.max(0, width - fixedTotal);

    for (const child of visibleChildren) {
      if (child.flex > 0) {
        const childWidth = flexSpace > 0 ? Math.floor((child.flex / flexTotal) * flexSpace) : 0;
        child.layout({ x: currentX, y, width: childWidth, height });
        currentX += childWidth;
      } else {
        const childSize = child.measure({ width, height });
        child.layout({ x: currentX, y, width: childSize.width, height });
        currentX += childSize.width;
      }
    }
  }
}
