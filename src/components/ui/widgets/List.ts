import { Control } from "../Control";
import { fg, fgBg } from "../../../lib/theme";
import type { Point, Size, RenderContext } from "../types";
import type { FramebufferCanvas } from "../../../lib/framebuffer-canvas";

export interface ListItem<ID = string, D = unknown> {
  id: ID;
  label: string;
  sublabel?: string;
  data?: D;
}

export type ItemRenderer<ID, D> = (canvas: FramebufferCanvas, item: ListItem<ID, D>, index: number, isHighlighted: boolean, x: number, y: number, width: number) => void;

export class List<ID = string, D = unknown> extends Control {
  focusable = true;
  public items: ListItem<ID, D>[] = [];
  protected _selectedIndex = -1;
  protected _selectedId: ID | null = null;
  public itemHeight = 1;
  public scrollOffset = 0;
  public contentHeight = 0;
  protected _viewportHeight = 0;
  protected _onSelect: ((item: ListItem<ID, D>) => void) | null = null;
  protected _onHighlight: ((item: ListItem<ID, D> | null) => void) | null = null;
  protected _customRenderer: ItemRenderer<ID, D> | null = null;

  get selectedIndex(): number { return this._selectedIndex; }
  set selectedIndex(v: number) { if (v !== this._selectedIndex) { this._selectedIndex = v; this.markDirty(); } }

  get selectedId(): ID | null { return this._selectedId; }
  set selectedId(v: ID | null) { if (v !== this._selectedId) { this._selectedId = v; this.markDirty(); } }

  measure(_parentSize?: Size): Size {
    return { width: this.rect.width || 40, height: this.rect.height || Math.max(1, this.items.length * this.itemHeight) };
  }

  onLayout(): void {
    this._viewportHeight = Math.max(0, Math.floor(this.rect.height / this.itemHeight));
    this.clampScroll();
  }

  protected clampScroll(): void {
    const maxScroll = Math.max(0, this.contentHeight - this._viewportHeight);
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll));

    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex;
    }
    if (this.selectedIndex >= this.scrollOffset + this._viewportHeight) {
      this.scrollOffset = this.selectedIndex - this._viewportHeight + 1;
    }
  }

  setOnSelect(callback: (item: ListItem<ID, D>) => void): void {
    this._onSelect = callback;
  }

  setOnHighlight(callback: (item: ListItem<ID, D> | null) => void): void {
    this._onHighlight = callback;
  }

  protected _fireHighlight(): void {
    if (this._onHighlight) {
      this._onHighlight(this.getSelectedItem());
    }
  }

  setRenderer(renderer: ItemRenderer<ID, D>): void {
    this._customRenderer = renderer;
  }

  updateItems(items: ListItem<ID, D>[]): void {
    this.items = items;
    this.contentHeight = items.length;
    if (this.selectedIndex >= items.length) {
      this.selectedIndex = items.length > 0 ? items.length - 1 : -1;
    }
    this.clampScroll();
    this.markDirty();
  }

  draw(ctx: RenderContext): void {
    const { canvas } = ctx;
    const { x, y, width } = this.rect;

    for (let i = 0; i < this._viewportHeight; i++) {
      const globalIndex = i + this.scrollOffset;
      if (globalIndex >= this.items.length) break;

      const item = this.items[globalIndex]!;
      const isHighlighted = globalIndex === this.selectedIndex;
      const isSelected = item.id === this._selectedId;
      const fgColor = isHighlighted ? (this.focused ? "canvas" : "text") : (isSelected ? "accent" : "text");
      const bgColor = this.focused ? (isHighlighted ? "selectedBg" : "canvasSubtle") : "canvasSubtle";
      canvas.moveTo(x, y + i);

      if (this._customRenderer) {
        this._customRenderer(canvas, item, globalIndex, isHighlighted, x, y + i, width);
      } else {
        const label = item.label;
        const display = `${label}${item.sublabel ? `  ${item.sublabel}` : ""}`;

        if (isHighlighted) {
          canvas.bold(true);
          fgBg(canvas, fgColor, bgColor, display);
          fgBg(canvas, fgColor, bgColor, " ".repeat(Math.max(0, width - display.length)));
          canvas.bold(false);
        } else {
          fgBg(canvas, fgColor, bgColor, display);
        }
      }
    }
  }

  handleKey(key: string): boolean {
    if (this.items.length === 0) return false;

    if (key === "UP" || key === "k") {
      if (this.selectedIndex > 0) {
        this.selectedIndex--;
        if (this.selectedIndex < this.scrollOffset) {
          this.scrollOffset = this.selectedIndex;
        }
        this._fireHighlight();
        this.markDirty();
        return true;
      }
      return false;
    }
    if (key === "DOWN" || key === "j") {
      if (this.selectedIndex < this.items.length - 1) {
        this.selectedIndex++;
        if (this.selectedIndex >= this.scrollOffset + this._viewportHeight) {
          this.scrollOffset = this.selectedIndex - this._viewportHeight + 1;
        }
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
    this.clampScroll();
  }

  getSelectedItem(): ListItem<ID, D> | null {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.items.length) {
      return this.items[this.selectedIndex]!;
    }
    return null;
  }

  onMouseDown(point: Point): boolean {
    if (this.items.length === 0) return false;
    const row = point.y - this.rect.y;
    if (row >= 0 && row < this._viewportHeight) {
      const itemIndex = row + this.scrollOffset;
      if (itemIndex >= 0 && itemIndex < this.items.length) {
        this.selectedIndex = itemIndex;
        this._fireHighlight();
        this.markDirty();
        return true;
      }
    }
    return false;
  }
}
