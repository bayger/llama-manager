import { Control } from "../Control";
import { fg, fgBg } from "../../../lib/theme";
import type { Point, RenderContext, Size } from "../types";

const V = "\u2502";
const HALF_BLOCK = "\u2584";

export class Modal extends Control {
  focusable = true;
  protected _title = "";
  protected _buttons: { label: string; action: () => void }[] = [];
  protected _onClose: (() => void) | null = null;
  protected _selectedButtonIndex = 0;
  protected _buttonRects: { x: number; y: number; width: number; height: number }[] = [];
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

  setButtons(buttons: { label: string; action: () => void }[]): void {
    this._buttons = buttons;
    this._selectedButtonIndex = 0;
    this.markDirty();
  }

  setDefaultButton(index: number): void {
    this._selectedButtonIndex = index;
    this.markDirty();
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

  setFixedSize(width: number, height: number): void {
    this._minWidth = width;
    this._maxWidth = width;
    this._minHeight = height;
    this._maxHeight = height;
  }

  public close(): void {
    if (this._onClose) this._onClose();
  }

  protected isPointInside(point: Point): boolean {
    const { x, y, width, height } = this.rect;
    return point.x >= x && point.x < x + width && point.y >= y && point.y < y + height;
  }

  protected activateButton(index: number): void {
    if (index >= 0 && index < this._buttons.length) {
      this._buttons[index]!.action();
    }
  }

  handleKey(key: string): boolean {
    if (key === "Escape") {
      this.close();
      return true;
    }

    if (this._buttons.length === 0) return false;

    const upper = key.toUpperCase();
    if (upper === "ENTER" || upper === "RETURN" || upper === "SPACE") {
      this.activateButton(this._selectedButtonIndex);
      return true;
    }

    if (upper === "LEFT" || key === "h" || key === "H" || upper === "TAB") {
      this._selectedButtonIndex = (this._selectedButtonIndex - 1 + this._buttons.length) % this._buttons.length;
      this.markDirty();
      return true;
    }

    if (upper === "RIGHT" || key === "l" || key === "L" || upper === "SHIFT_TAB") {
      this._selectedButtonIndex = (this._selectedButtonIndex + 1) % this._buttons.length;
      this.markDirty();
      return true;
    }

    return false;
  }

  protected _clampSize(size: Size): Size {
    return {
      width: Math.max(this._minWidth, Math.min(size.width, this._maxWidth)),
      height: Math.max(this._minHeight, Math.min(size.height, this._maxHeight)),
    };
  }

  measure(_parentSize?: Size): Size {
    const titleLen = this._title.length;
    const btnWidth = this._buttons.reduce((max, b) => Math.max(max, b.label.length + 4), 0);
    let width = Math.max(this._minWidth, Math.max(titleLen, btnWidth) + 6);
    let height = this._minHeight;
    return this._clampSize({ width, height });
  }

  render(ctx: RenderContext): void {
    if (!this.visible) return;
    const { x, y, width, height } = this.rect;
    const { canvas } = ctx;

    canvas.setBackgroundColor("canvasSubtle");
    canvas.setForegroundColor("text");
    canvas.clearRect(x, y, width, height);

    this.draw(ctx);
    canvas.styleReset();

    for (const child of this.children) {
      child.render(ctx);
    }

    canvas.setClipRect(null);
    canvas.styleReset();
    this.needsRender = false;
  }

  draw(ctx: RenderContext): void {
    const { canvas } = ctx;
    const { x, y, width, height } = this.rect;

    if (width < 3 || height < 4) return;

    // Clip all drawing to modal bounds
    canvas.setClipRect({ x, y, width, height });

    const innerW = width - 2;

    // Row 0: Half-block top bar (Section style)
    canvas.moveTo(x, y);
    canvas.setForegroundColor("canvasSubtle");
    canvas.setBackgroundColor("canvas");
    for (let col = 0; col < width; col++) {
      fgBg(canvas, "canvasSubtle", "canvas", HALF_BLOCK);
    }

    // Row 1: Title bar — V (accent) + " Title" (accent)
    canvas.moveTo(x, y + 1);
    canvas.bold();
    fgBg(canvas, "accent", "canvasSubtle", V);
    fgBg(canvas, "accent", "canvasSubtle", ` ${this._title}`);
    canvas.bold(false);
    // Fill remaining space with canvasSubtle bg
    const titleLen = 1 + 1 + this._title.length;
    for (let col = titleLen; col < width; col++) {
      fgBg(canvas, "text", "canvasSubtle", " ");
    }

    // Row 2: Spacing row (just left border)
    canvas.moveTo(x, y + 2);
    canvas.setForegroundColor("borderMuted");
    canvas.write(V);

    // Rows 3..height-4: Content area with left border
    for (let row = 3; row < height - 3; row++) {
      canvas.moveTo(x, y + row);
      canvas.setForegroundColor("borderMuted");
      canvas.write(V);
    }

    // Row height-3: Padding row (just left border)
    canvas.moveTo(x, y + height - 3);
    canvas.setForegroundColor("borderMuted");
    canvas.write(V);

    // Row height-2: Button row — V (borderMuted) + buttons right-aligned
    this._buttonRects = [];
    if (this._buttons.length > 0 && height >= 4) {
      const btnRowY = y + height - 2;
      let totalBtnWidth = 0;
      const btnWidths: number[] = [];
      for (const btn of this._buttons) {
        const w = btn.label.length + 4;
        btnWidths.push(w);
        totalBtnWidth += w;
      }
      totalBtnWidth += Math.max(0, this._buttons.length - 1) * 2;

      const btnStartX = x + 2 + (innerW - totalBtnWidth);
      let btnX = btnStartX;

      canvas.moveTo(x, btnRowY);
      canvas.setForegroundColor("borderMuted");
      canvas.write(V);

      for (let i = 0; i < this._buttons.length; i++) {
        const btn = this._buttons[i]!;
        const bw = btnWidths[i]!;
        const selected = i === this._selectedButtonIndex;
        const padded = ` ${btn.label} `;

        this._buttonRects.push({ x: btnX, y: btnRowY, width: bw, height: 1 });

        canvas.moveTo(btnX, btnRowY);
        if (selected) {
          canvas.bold();
          fgBg(canvas, "canvas", "accent", padded);
          canvas.bold(false);
        } else {
          fgBg(canvas, "textMuted", "canvasSubtle", padded);
        }
        btnX += bw + 2;
      }
    } else {
      canvas.moveTo(x, y + height - 2);
      canvas.setForegroundColor("borderMuted");
      canvas.write(V);
    }

    // Row height-1: Bottom padding row (just left border)
    canvas.moveTo(x, y + height - 1);
    fgBg(canvas, "borderMuted", "canvasSubtle", V);

    canvas.styleReset();
  }

  onMouseDown(point: Point): boolean {
    if (!this.isPointInside(point)) return false;

    for (let i = 0; i < this._buttonRects.length; i++) {
      const r = this._buttonRects[i]!;
      if (point.x >= r.x && point.x < r.x + r.width && point.y >= r.y && point.y < r.y + r.height) {
        this._selectedButtonIndex = i;
        this.markDirty();
        return true;
      }
    }
    return true;
  }

  onMouseUp(point: Point): boolean {
    if (!this.isPointInside(point)) return false;

    for (let i = 0; i < this._buttonRects.length; i++) {
      const r = this._buttonRects[i]!;
      if (point.x >= r.x && point.x < r.x + r.width && point.y >= r.y && point.y < r.y + r.height) {
        this.activateButton(i);
        return true;
      }
    }
    return true;
  }
}
