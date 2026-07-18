import { Scrollable } from "./Scrollable";
import { fgBg, rowColors } from "../../lib/theme";
import type { Point, Size, RenderContext } from "../types";

export interface ListItem<ID = string, D = unknown> {
  id: ID;
  label: string;
  sublabel?: string;
  data?: D;
}

export class List<ID = string, D = unknown> extends Scrollable {
  focusable = true;
  protected _items: ListItem<ID, D>[] = [];
  protected _selectedIndex = -1;
  protected _selectedId: ID | null = null;
  public itemHeight = 1;
  protected _truncate: "tail" | "head" | false = false;

  get truncate(): "tail" | "head" | false { return this._truncate; }
  set truncate(v: "tail" | "head" | false) { this._truncate = v; }

  get items(): ListItem<ID, D>[] { return this._items; }
  set items(value: ListItem<ID, D>[]) {
    this._items = value;
    this.scrollOffset = 0;
    if (this.selectedIndex >= value.length) {
      this.selectedIndex = value.length > 0 ? value.length - 1 : -1;
    }
    this.clampScroll();
    this.markDirty();
  }

  public override get contentHeight(): number { return this._items.length; }

  get selectedIndex(): number { return this._selectedIndex; }
  set selectedIndex(v: number) { if (v !== this._selectedIndex) { this._selectedIndex = v; this.markDirty(); } }

  get selectedId(): ID | null { return this._selectedId; }
  set selectedId(v: ID | null) { if (v !== this._selectedId) { this._selectedId = v; this.markDirty(); } }

  protected _onSelect: ((item: ListItem<ID, D>) => void) | null = null;
  protected _onHighlight: ((item: ListItem<ID, D> | null) => void) | null = null;

  measure(parentSize?: Size): Size {
    const wantedHeight = Math.max(1, this.items.length * this.itemHeight);
    const height = parentSize?.height ? Math.min(wantedHeight, parentSize.height) : (this.rect.height || wantedHeight);
    return { width: this.rect.width || 40, height };
  }

  onLayout(): void {
    this._viewportHeight = Math.max(0, Math.floor(this.rect.height / this.itemHeight));
    this.clampScroll();
  }

  protected ensureSelectedVisible(): void {
    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex;
    }
    if (this.selectedIndex >= this.scrollOffset + this._viewportHeight) {
      this.scrollOffset = this.selectedIndex - this._viewportHeight + 1;
    }
    this.clampScroll();
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

  draw(ctx: RenderContext): void {
    const { canvas } = ctx;
    const { x, y, height } = this.rect;
    const cw = this.contentWidth;

    for (let i = 0; i < this._viewportHeight; i++) {
      const globalIndex = i + this.scrollOffset;
      if (globalIndex >= this.items.length) break;

      const item = this.items[globalIndex];
      if (!item) continue;
      const isHighlighted = globalIndex === this.selectedIndex;
      const isSelected = item.id === this._selectedId;
      const colors = rowColors(isHighlighted, isSelected, this.focused);
      canvas.moveTo(x, y + i);

      const label = item.label;
      let display = `${label}${item.sublabel ? `  ${item.sublabel}` : ""}`;

      if (this._truncate && display.length > cw) {
        const ellipsis = "\u2026";
        const sliceLen = Math.max(0, cw - ellipsis.length);
        if (this._truncate === "tail") {
          display = display.slice(0, sliceLen) + ellipsis;
        } else {
          display = ellipsis + display.slice(-sliceLen);
        }
      }

      if (colors.bold) {
        canvas.bold(true);
        fgBg(canvas, colors.fg, colors.bg, display);
        fgBg(canvas, colors.fg, colors.bg, " ".repeat(Math.max(0, cw - display.length)));
        canvas.bold(false);
      } else {
        fgBg(canvas, colors.fg, colors.bg, display);
      }
    }

    if (this.needsScrollbar) {
      this.drawScrollbar(canvas, x + cw, y, this._scrollbarWidth, height);
    }
  }

  handleKey(key: string): boolean {
    if (this.items.length === 0) return false;

    if (key === "UP" || key === "k") {
      if (this.selectedIndex > 0) {
        this.selectedIndex--;
        this.ensureSelectedVisible();
        this._fireHighlight();
        this.markDirty();
        return true;
      }
      return false;
    }
    if (key === "DOWN" || key === "j") {
      if (this.selectedIndex < this.items.length - 1) {
        this.selectedIndex++;
        this.ensureSelectedVisible();
        this._fireHighlight();
        this.markDirty();
        return true;
      }
      return false;
    }
    if (key === "PAGE_UP") {
      const viewport = this._viewportHeight;
      const newIdx = Math.max(0, this.selectedIndex - viewport);
      if (newIdx !== this.selectedIndex) {
        this.selectedIndex = newIdx;
        this.ensureSelectedVisible();
        this._fireHighlight();
        this.markDirty();
      }
      return true;
    }
    if (key === "PAGE_DOWN") {
      const viewport = this._viewportHeight;
      const newIdx = Math.min(this.items.length - 1, this.selectedIndex + viewport);
      if (newIdx !== this.selectedIndex) {
        this.selectedIndex = newIdx;
        this.ensureSelectedVisible();
        this._fireHighlight();
        this.markDirty();
      }
      return true;
    }
    if (key === "HOME") {
      if (this.selectedIndex !== 0) {
        this.selectedIndex = 0;
        this.scrollOffset = 0;
        this._fireHighlight();
        this.markDirty();
      }
      return true;
    }
    if (key === "END") {
      const last = this.items.length - 1;
      if (this.selectedIndex !== last) {
        this.selectedIndex = last;
        this.scrollOffset = Math.max(0, last - this._viewportHeight + 1);
        this._fireHighlight();
        this.markDirty();
      }
      return true;
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

  onMouseWheel(_point: Point, direction: 'up' | 'down'): boolean {
    if (this.items.length === 0) return false;
    return super.onMouseWheel(_point, direction);
  }

  onMouseDown(point: Point): boolean {
    if (this.items.length === 0) return false;

    if (this.needsScrollbar) {
      const sx = this.rect.x + this.contentWidth;
      const sw = this._scrollbarWidth;

      if (point.x >= sx && point.x < sx + sw) {
        const trackTop = this.rect.y;
        const trackHeight = this.rect.height;
        const clickY = point.y - trackTop;
        const thumbMinHeight = 2;
        const ratio = this._viewportHeight / this.contentHeight;
        const thumbHeight = Math.max(thumbMinHeight, Math.floor(ratio * trackHeight));
        const maxThumbPos = trackHeight - thumbHeight;

        if (maxThumbPos > 0) {
          const newOffset = Math.floor((clickY / maxThumbPos) * this.maxScrollOffset);
          this.scrollOffset = Math.max(0, Math.min(this.maxScrollOffset, newOffset));
          this.markDirty();
          return true;
        }
        return false;
      }
    }

    const row = point.y - this.rect.y;
    if (row >= 0 && row < this._viewportHeight) {
      const itemIndex = row + this.scrollOffset;
      if (itemIndex >= 0 && itemIndex < this.items.length) {
        this.selectedIndex = itemIndex;
        this._fireHighlight();
        this.ensureSelectedVisible();
        this.markDirty();
        return true;
      }
    }
    return false;
  }
}
