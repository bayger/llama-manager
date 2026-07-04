import { Control } from "../Control";
import { Color, fg, fgBg } from "../../lib/theme";
import type { Size, RenderContext } from "../types";

const V = "\u2502";
const HALF_BLOCK = "\u2584";

export class Section extends Control {
  focusable = false;
  backgroundColor = "canvasSubtle" as Color;
  public title = "";

  measure(parentSize?: Size): Size {
    const p = parentSize || { width: this.rect.width || 80, height: this.rect.height || 4 };

    let fixedHeight = 4;
    let flexTotal = 0;
    let hasFlex = false;

    for (const child of this.children) {
      if (!child.visible) continue;
      if (child.flex > 0) {
        hasFlex = true;
        flexTotal += child.flex;
      } else {
        const s = child.measure({ width: Math.max(0, p.width - 3), height: p.height });
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
    const innerW = Math.max(0, width - 3);
    let curY = y + 3;

    let fixedTotal = 4;
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

  draw(ctx: RenderContext): void {
    const { canvas } = ctx;
    const { x, y, width, height } = this.rect;

    if (width < 3 || height < 4) return;

    // Half bar row
    canvas.moveTo(x, y);
    //fg(canvas, "accent", V);
    canvas.setForegroundColor("canvasSubtle");
    canvas.setBackgroundColor("canvas");
    for (let col = 0; col < width; col++) {
      fgBg(canvas, "canvasSubtle", "canvas", HALF_BLOCK);
    }

    // Caption row
    canvas.moveTo(x, y + 1);
    canvas.bold();
    fgBg(canvas, "accentSubtle", "canvasSubtle", V);
    fgBg(canvas, "accentSubtle", "canvasSubtle", ` ${this.title}`);
    canvas.bold(false);

    // Left border
    for (let row = 2; row < height - 1; row++) {
      canvas.moveTo(x, y + row);
      canvas.setForegroundColor("borderMuted");
      canvas.write(V);
    }

    // Bottom padding row
    canvas.moveTo(x, y + height - 1);
    canvas.setForegroundColor("borderMuted");
    canvas.write(V);
  }
}
