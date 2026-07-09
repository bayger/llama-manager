import { Control } from "../Control";
import { focusManager } from "../FocusManager";
import { fg, fgBg } from "../../lib/theme";
import type { Point, RenderContext, Size } from "../types";

const V = "\u2502";

export class Modal extends Control {
  focusable = true;
  protected _title = "";
  protected _hint = "";
  protected _onClose: (() => void) | null = null;
  protected _minWidth = 30;
  protected _maxWidth = 120;
  protected _minHeight = 8;
  protected _maxHeight = 30;

  set title(v: string) {
    this._title = v;
    this.markDirty();
  }

  get title(): string {
    return this._title;
  }

  set hint(v: string) {
    this._hint = v;
    this.markDirty();
  }

  get hint(): string {
    return this._hint;
  }

  setOnClose(callback: () => void): void {
    this._onClose = callback;
  }

  setMinSize(minWidth: number, minHeight: number): void {
    this._minWidth = minWidth;
    this._minHeight = minHeight;
  }

  setMaxSize(maxWidth: number, maxHeight: number): void {
    this._maxWidth = maxWidth;
    this._maxHeight = maxHeight;
  }

  public close(): void {
    if (this._onClose) this._onClose();
  }

  protected isPointInside(point: Point): boolean {
    const { x, y, width, height } = this.rect;
    return point.x >= x && point.x < x + width && point.y >= y && point.y < y + height;
  }

  protected _clampSize(size: Size): Size {
    return {
      width: Math.max(this._minWidth, Math.min(size.width, this._maxWidth)),
      height: Math.max(this._minHeight, Math.min(size.height, this._maxHeight)),
    };
  }

  measure(parentSize?: Size): Size {
    const titleLen = this._title.length;
    let width = Math.max(this._minWidth, titleLen + 6);
    let height = this._minHeight;

    if (parentSize) {
      const innerWidth = Math.max(0, parentSize.width - 4);
      const innerHeight = Math.max(0, parentSize.height - 4);
      for (const child of this.children) {
        if (!child.visible) continue;
        const childSize = child.measure({ width: innerWidth, height: innerHeight });
        width = Math.max(width, childSize.width + 4);
        height = Math.max(height, childSize.height + 4);
      }
    }

    return this._clampSize({ width, height });
  }

  render(ctx: RenderContext): void {
    if (!this.visible) return;
    const { x, y, width, height } = this.rect;
    const { canvas } = ctx;

    canvas.setBackgroundColor("surface");
    canvas.setForegroundColor("text");
    canvas.clearRect(x, y, width, height);

    this.drawTitleBar(ctx);

    for (const child of this.children) {
      child.render(ctx);
    }

    canvas.setClipRect(null);
    canvas.styleReset();
    this.needsRender = false;
  }

  drawTitleBar(ctx: RenderContext): void {
    const { canvas } = ctx;
    const { x, y, width, height } = this.rect;

    if (width < 3 || height < 3) return;

    canvas.setClipRect({ x, y, width, height });

    // Row 0: Top padding
    canvas.moveTo(x, y);
    canvas.setForegroundColor("borderMuted");
    canvas.write(V);

    // Row 1: Title bar
    canvas.moveTo(x, y + 1);
    canvas.setForegroundColor("borderMuted");
    canvas.write(V);
    canvas.moveTo(x + 1, y + 1);
    canvas.bold();
    fg(canvas, "secondary", ` ${this._title}`);
    canvas.bold(false);
    if (this._hint) {
      const titleLen = 2 + this._title.length;
      const hintWithPad = `  ${this._hint} `;
      const startCol = width - 1 - hintWithPad.length;
      if (startCol > titleLen) {
        canvas.moveTo(x + titleLen, y + 1);
        fg(canvas, "secondary", " ".repeat(startCol - titleLen));
        fg(canvas, "textMuted", hintWithPad);
      }
    }

    // Rows 2..height-2: Left border
    for (let row = 2; row < height - 1; row++) {
      canvas.moveTo(x, y + row);
      canvas.setForegroundColor("borderMuted");
      canvas.write(V);
    }

    // Row height-1: Bottom padding
    canvas.moveTo(x, y + height - 1);
    canvas.setForegroundColor("borderMuted");
    canvas.write(V);

    canvas.styleReset();
  }

  onFocus(): void {
    super.onFocus();
    const focusable = this.getAllFocusable();
    if (focusable.length > 0) {
      focusManager.setFocus(focusable[0]!);
    }
  }

  onLayout(): void {
    const { x, y, width, height } = this.rect;
    const childRect = { x: x + 2, y: y + 3, width: width - 4, height: height - 4 };
    for (const child of this.children) {
      if (child.visible) {
        child.layout(childRect);
      }
    }
  }

  onMouseDown(point: Point): boolean {
    return this.isPointInside(point);
  }

  onMouseUp(point: Point): boolean {
    return this.isPointInside(point);
  }
}
