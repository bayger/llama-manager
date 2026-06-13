import { Control } from "../Control.js";
import { fg, fgBg, themeColors } from "../../../lib/theme.js";
import type { Point, Size, RenderContext } from "../types.js";
import type { FramebufferCanvas } from "../../../lib/framebuffer-canvas.js";

export interface ListItem<T = any> {
  id: T;
  label: string;
  sublabel?: string;
  data?: any;
}

export type ItemRenderer<T> = (canvas: FramebufferCanvas, item: ListItem<T>, index: number, isSelected: boolean, x: number, y: number, width: number) => void;

export class List<T = any> extends Control {
  focusable = true;
  public items: ListItem<T>[] = [];
  protected _selectedIndex = -1;
  public itemHeight = 1;
  protected _onSelect: ((item: ListItem<T>) => void) | null = null;
  protected _onHighlight: ((item: ListItem<T> | null) => void) | null = null;
  protected _customRenderer: ItemRenderer<T> | null = null;

  get selectedIndex(): number { return this._selectedIndex; }
  set selectedIndex(v: number) { if (v !== this._selectedIndex) { this._selectedIndex = v; this.markDirty(); } }

  measure(_parentSize?: Size): Size {
    const h = Math.max(1, this.items.length * this.itemHeight);
    return { width: this.rect.width || 40, height: h };
  }

  setOnSelect(callback: (item: ListItem<T>) => void): void {
    this._onSelect = callback;
  }

  setOnHighlight(callback: (item: ListItem<T> | null) => void): void {
    this._onHighlight = callback;
  }

  protected _fireHighlight(): void {
    if (this._onHighlight) {
      this._onHighlight(this.getSelectedItem());
    }
  }

  setRenderer(renderer: ItemRenderer<T>): void {
    this._customRenderer = renderer;
  }

  updateItems(items: ListItem<T>[]): void {
    this.items = items;
    if (this.selectedIndex >= items.length) {
      this.selectedIndex = items.length - 1;
    }
    this.markDirty();
  }

  render(ctx: RenderContext): void {
    if (!this.visible || !this.needsRender) return;
    const { canvas } = ctx;
    const { x, y, width, height } = this.rect;

    canvas.colorRgbHex(themeColors.canvas);
    canvas.bgColorRgbHex(themeColors.canvas);
    canvas.clearRect(x, y, width, height);
    canvas.moveTo(x, y);

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i]!;
      const isSelected = i === this.selectedIndex && this.focused;
      canvas.moveTo(x, y + i);

      if (this._customRenderer) {
        this._customRenderer(canvas, item, i, isSelected, x, y + i, width);
      } else {
        const label = item.label;
        const display = `${label}${item.sublabel ? `  ${item.sublabel}` : ""}`;

        if (isSelected) {
          fgBg(canvas, themeColors.text, themeColors.canvasSubtle, display);
          fgBg(canvas, themeColors.canvas, themeColors.canvasSubtle, " ".repeat(Math.max(0, width - display.length)));
          canvas.styleReset();
        } else {
          fg(canvas, themeColors.text, display);
        }
      }
    }

    this.needsRender = false;
  }

  handleKey(key: string): boolean {
    if (this.items.length === 0) return false;

    if (key === "UP" || key === "k") {
      if (this.selectedIndex > 0) {
        this.selectedIndex--;
        this._fireHighlight();
        this.markDirty();
        return true;
      }
      return false;
    }
    if (key === "DOWN" || key === "j") {
      if (this.selectedIndex < this.items.length - 1) {
        this.selectedIndex++;
        this._fireHighlight();
        this.markDirty();
        return true;
      }
      return false;
    }
    if (key === "RETURN" || key === "ENTER" || key === "SPACE") {
      if (this.selectedIndex >= 0 && this._onSelect) {
        this._onSelect(this.items[this.selectedIndex]!);
      }
      return true;
    }
    return false;
  }

  onFocus(): void {
    super.onFocus();
    if (this.selectedIndex < 0 && this.items.length > 0) {
      this.selectedIndex = 0;
      this._fireHighlight();
      this.markDirty();
    }
  }

  getSelectedItem(): ListItem<T> | null {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.items.length) {
      return this.items[this.selectedIndex]!;
    }
    return null;
  }

  onMouseDown(point: Point): boolean {
    if (this.items.length === 0) return false;
    const row = point.y - this.rect.y;
    if (row >= 0 && row < this.items.length) {
      this.selectedIndex = row;
      this._fireHighlight();
      this.markDirty();
      return true;
    }
    return false;
  }
}
