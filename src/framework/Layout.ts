import { Control } from "./Control";
import { Button } from "./widgets/Button";
import { Spacer } from "./widgets/Spacer";
import type { Rect, Size, RenderContext } from "./types";

export class Column extends Control {
  focusable = false;

  measure(parentSize: Size): Size {
    let maxHeight = 0;
    let maxWidth = 0;
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
      maxHeight = Math.max(maxHeight, childSize.height);
      maxWidth = Math.max(maxWidth, childSize.width);
    }

    return {
      width: maxWidth,
      height: fixedHeight,
    };
  }

  onLayout(): void {
    const { x, y, width, height } = this.rect;
    const padding = 0;
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
        const childHeight = Math.min(childSize.height, remainingHeight);
        child.layout({ x: x + padding, y: currentY, width: innerWidth, height: childHeight });
        currentY += childHeight;
        measuredHeight += childHeight;
      }
    }
  }

  draw(_ctx: RenderContext): void { }
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
      width: fixedWidth + totalGap,
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
    let measuredWidth = 0;

    for (let i = 0; i < visibleChildren.length; i++) {
      const child = visibleChildren[i]!;
      const remainingWidth = width - measuredWidth - (i < visibleChildren.length - 1 ? gap : 0);
      if (child.flex > 0) {
        const cw = flexSpace > 0 ? Math.floor((child.flex / flexTotal) * flexSpace) : 0;
        child.layout({ x: currentX, y, width: cw, height });
        currentX += cw;
        measuredWidth += cw;
      } else {
        const childSize = child.measure({ width: Math.max(0, remainingWidth), height });
        const childWidth = Math.min(childSize.width, remainingWidth);
        child.layout({ x: currentX, y, width: childWidth, height });
        currentX += childWidth;
        measuredWidth += childWidth;
      }
      if (i < visibleChildren.length - 1) {
        currentX += gap;
      }
    }
  }

  draw(_ctx: RenderContext): void { }
}

export function createButtonRow(...buttons: Button[]): Row {
  const row = new Row();
  const spacer = new Spacer();
  spacer.flex = 1;
  row.add(spacer);
  for (const btn of buttons) {
    row.add(btn);
  }
  return row;
}

export function createSplitButtonRow(left: Button | Button[], ...right: Button[]): Row {
  const row = new Row();
  const leftButtons = Array.isArray(left) ? left : [left];
  for (const btn of leftButtons) {
    row.add(btn);
  }
  const spacer = new Spacer();
  spacer.flex = 1;
  row.add(spacer);
  for (const btn of right) {
    row.add(btn);
  }
  return row;
}
