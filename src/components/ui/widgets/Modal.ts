import { Control } from "../Control";
import type { Point, RenderContext, Size } from "../types";

const TL = "\u250c";
const TR = "\u2510";
const BL = "\u2514";
const BR = "\u2518";
const H = "\u2500";
const V = "\u2502";
const L = "\u251c";
const R = "\u2524";

export class Modal extends Control {
  focusable = true;
  protected _title = "";
  protected _buttons: { label: string; action: () => void }[] = [];
  protected _onClose: (() => void) | null = null;
  protected _selectedButtonIndex = 0;
  protected _buttonRects: { x: number; y: number; width: number; height: number }[] = [];

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

  setOnClose(callback: () => void): void {
    this._onClose = callback;
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

    // Normalize: terminal-kit sends uppercase, but handle both
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

  measure(_parentSize?: Size): Size {
    const titleLen = this._title.length;
    const btnWidth = this._buttons.reduce((max, b) => Math.max(max, b.label.length + 4), 0);
    const minWidth = Math.max(30, Math.max(titleLen, btnWidth) + 6);
    return { width: minWidth, height: 7 };
  }

  render(ctx: RenderContext): void {
    if (!this.visible) return;
    const { x, y, width, height } = this.rect;
    const { canvas } = ctx;

    canvas.setBackgroundColor("canvasSubtle");
    canvas.clearRect(x, y, width, height);

    this.draw(ctx);
    canvas.styleReset();

    for (const child of this.children) {
      child.render(ctx);
    }
    this.needsRender = false;
  }

  draw(ctx: RenderContext): void {
    const { canvas } = ctx;
    const { x, y, width, height } = this.rect;

    if (width < 4 || height < 3) return;

    const innerW = width - 2;

    // Top border
    canvas.moveTo(x, y);
    canvas.setForegroundColor("border");
    canvas.write(TL);
    if (this._title) {
      const titleContent = ` ${this._title} `;
      const padLeft = Math.floor((innerW - titleContent.length) / 2);
      const padRight = innerW - titleContent.length - padLeft;
      if (padLeft > 0) canvas.write(H.repeat(padLeft));
      canvas.setForegroundColor("accentColor");
      canvas.write(titleContent);
      canvas.setForegroundColor("border");
      if (padRight > 0) canvas.write(H.repeat(padRight));
    } else {
      canvas.write(H.repeat(innerW));
    }
    canvas.write(TR);

    // Left/right borders for all middle rows
    for (let row = 1; row < height - 1; row++) {
      canvas.moveTo(x, y + row);
      canvas.setForegroundColor("border");
      canvas.write(V);
      canvas.moveTo(x + width - 1, y + row);
      canvas.write(V);
    }

    // Bottom border
    canvas.moveTo(x, y + height - 1);
    canvas.setForegroundColor("border");
    canvas.write(BL);
    canvas.write(H.repeat(innerW));
    canvas.write(BR);

    // Content divider
    if (height >= 3) {
      canvas.moveTo(x, y + 1);
      canvas.setForegroundColor("border");
      canvas.write(L);
      canvas.write(H.repeat(innerW));
      canvas.write(R);
    }

    // Button bar (2 rows: divider + buttons, placed above bottom border)
    const btnDividerY = y + height - 3;
    const btnRowY = y + height - 2;
    this._buttonRects = [];

    if (height >= 5 && this._buttons.length > 0) {
      // Button bar divider
      canvas.moveTo(x, btnDividerY);
      canvas.setForegroundColor("border");
      canvas.write(L);
      canvas.write(H.repeat(innerW));
      canvas.write(R);

      let totalBtnWidth = 0;
      const btnWidths: number[] = [];
      for (const btn of this._buttons) {
        const w = btn.label.length + 4;
        btnWidths.push(w);
        totalBtnWidth += w;
      }
      totalBtnWidth += Math.max(0, this._buttons.length - 1) * 2;

      let btnX = x + 1 + Math.floor((innerW - totalBtnWidth) / 2);

      for (let i = 0; i < this._buttons.length; i++) {
        const btn = this._buttons[i]!;
        const bw = btnWidths[i]!;
        const selected = i === this._selectedButtonIndex;
        const padded = ` ${btn.label} `;

        this._buttonRects.push({ x: btnX, y: btnRowY, width: bw, height: 1 });

        if (selected) {
          canvas.moveTo(btnX, btnRowY);
          canvas.bold();
          canvas.setBackgroundColor("accent");
          canvas.setForegroundColor("canvas");
          canvas.write(padded);
          canvas.bold(false);
        } else {
          canvas.moveTo(btnX, btnRowY);
          canvas.setBackgroundColor("canvasSubtle");
          canvas.setForegroundColor("textMuted");
          canvas.write(padded);
        }
        canvas.setBackgroundColor("canvasSubtle");
        btnX += bw + 2;
      }
    }

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
