import { Control } from "../Control";
import { fg, fgBg } from "../../lib/theme";
import type { Color } from "../../lib/theme";
import type { Point, Size, RenderContext } from "../types";
import type { FramebufferCanvas } from "../../lib/framebuffer-canvas";

export interface TableColumn {
  label: string;
  width: number;
  flex?: number;
  align?: "left" | "right";
  headerSuffix?: string;
  format?: (cellData: any, row: any) => string;
  color?: Color | ((cellData: any, row: any) => Color);
}

export interface TableItem<T = any> {
  id: string | number;
  label: string;
  sublabel?: string;
  data?: T;
}

export type VirtualLoader<T> = (start: number, end: number) => TableItem<T>[];

interface VisibleColumn {
  col: TableColumn;
  width: number;
}

export class Table<T = any> extends Control {
  focusable = true;

  public columns: TableColumn[] = [];
  public items: TableItem<T>[] = [];
  protected _selectedIndex = -1;
  protected _selectedId: string | number | null = null;
  public scrollOffset = 0;
  public contentHeight = 0;
  public showHeader = true;
  public headerHeight = 2;

  protected _onSelect: ((item: TableItem<T>) => void) | null = null;
  protected _onHighlight: ((item: TableItem<T> | null) => void) | null = null;
  protected _viewportHeight = 0;
  protected _virtualTotal = 0;
  protected _virtualLoader: VirtualLoader<T> | null = null;
  protected _virtualCacheStart = -1;
  protected _virtualCache: TableItem<T>[] = [];

  get selectedIndex(): number { return this._selectedIndex; }
  set selectedIndex(v: number) { if (v !== this._selectedIndex) { this._selectedIndex = v; this.markDirty(); } }

  get selectedId(): string | number | null { return this._selectedId; }
  set selectedId(v: string | number | null) { if (v !== this._selectedId) { this._selectedId = v; this.markDirty(); } }

  measure(_parentSize?: Size): Size {
    return { width: this.rect.width || 40, height: this.rect.height || 10 };
  }

  onLayout(): void {
    const bodyHeight = this.rect.height - (this.showHeader ? this.headerHeight : 0);
    this._viewportHeight = Math.max(0, bodyHeight);
    this.clampScrollBounds();
  }

  setOnSelect(callback: (item: TableItem<T>) => void): void {
    this._onSelect = callback;
  }

  setOnHighlight(callback: (item: TableItem<T> | null) => void): void {
    this._onHighlight = callback;
  }

  setVirtualLoader(total: number, loader: VirtualLoader<T>): void {
    this._virtualTotal = total;
    this._virtualLoader = loader;
    this._virtualCacheStart = -1;
    this.contentHeight = total;
    this.clampScroll();
    this.markDirty();
  }

  protected _loadVirtualRange(): void {
    if (!this._virtualLoader) return;
    const end = Math.min(this._virtualTotal, this.scrollOffset + this._viewportHeight);
    const visibleCount = Math.min(this._viewportHeight, Math.max(0, this._virtualTotal - this.scrollOffset));
    if (this._virtualCacheStart === this.scrollOffset &&
        this._virtualCache.length >= visibleCount) {
      return;
    }
    this._virtualCacheStart = this.scrollOffset;
    this._virtualCache = this._virtualLoader(this.scrollOffset, end);
    this.items = this._virtualCache;
  }

  updateItems(items: TableItem<T>[]): void {
    this._virtualLoader = null;
    this._virtualTotal = 0;
    this._virtualCacheStart = -1;
    this._virtualCache = [];
    this.items = items;
    this.contentHeight = items.length;
    if (this.selectedIndex >= items.length) {
      this.selectedIndex = items.length > 0 ? items.length - 1 : -1;
    }
    this.clampScroll();
    this.markDirty();
  }

  getSelectedItem(): TableItem<T> | null {
    if (this._virtualLoader) {
      const cacheIndex = this.selectedIndex - this.scrollOffset;
      if (cacheIndex >= 0 && cacheIndex < this.items.length) {
        return this.items[cacheIndex]!;
      }
    } else {
      if (this.selectedIndex >= 0 && this.selectedIndex < this.items.length) {
        return this.items[this.selectedIndex]!;
      }
    }
    return null;
  }

  protected _fireHighlight(): void {
    if (this._onHighlight) {
      this._onHighlight(this.getSelectedItem());
    }
  }

  protected clampScrollBounds(): void {
    const maxScroll = Math.max(0, this.contentHeight - this._viewportHeight);
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll));
  }

  protected clampScroll(): void {
    this.clampScrollBounds();
  }

  protected computeVisibleColumns(availableWidth: number): VisibleColumn[] {
    if (this.columns.length === 0) return [];

    const gaps = this.columns.length - 1;
    const minTotalWidth = this.columns.reduce((sum, col) => sum + col.width, 0) + gaps;

    if (availableWidth <= 1) return [];

    const contentWidth = availableWidth - 1;

    let workingCols = this.columns.map((col, i) => ({ col, index: i }));

    if (minTotalWidth > contentWidth) {
      let runningWidth = 0;
      for (const wc of workingCols) {
        runningWidth += wc.col.width + (runningWidth > 0 ? 1 : 0);
      }

      while (runningWidth > contentWidth && workingCols.length > 0) {
        const removed = workingCols.pop()!;
        runningWidth -= removed.col.width + (workingCols.length > 0 ? 1 : 0);
      }

      if (workingCols.length === 0) return [];
    }

    const flexCols = workingCols.filter((wc) => wc.col.flex && wc.col.flex > 0);
    const fixedCols = workingCols.filter((wc) => !wc.col.flex || wc.col.flex === 0);

    const allBaseWidth = workingCols.reduce((sum, wc) => sum + wc.col.width, 0);
    const usedGaps = workingCols.length - 1;
    const usedByBase = allBaseWidth + usedGaps;
    const excessSpace = Math.max(0, contentWidth - usedByBase);

    const totalFlex = flexCols.reduce((sum, wc) => sum + (wc.col.flex || 0), 0);

    const result: VisibleColumn[] = [];

    for (const wc of workingCols) {
      let colWidth = wc.col.width;

      if (wc.col.flex && wc.col.flex > 0 && totalFlex > 0) {
        colWidth = wc.col.width + Math.floor((wc.col.flex / totalFlex) * excessSpace);
      }

      result.push({ col: wc.col, width: colWidth });
    }

    return result;
  }

  draw(ctx: RenderContext): void {
    if (this._virtualLoader) {
      this._loadVirtualRange();
    }

    const { canvas } = ctx;
    const { x, y, width, height } = this.rect;
    const items = this.items;

    if (items.length === 0) return;

    const visibleCols = this.computeVisibleColumns(width);
    const   hasHeader = this.showHeader && visibleCols.length > 0;

    if (hasHeader) {
      canvas.moveTo(x, y);
      canvas.setBackgroundColor("canvasSubtle");
      this.renderHeader(canvas, x, y, width, visibleCols);
      // Separator line below header
      canvas.moveTo(x, y + 1);
      fg(canvas, "borderActive", "\u2500".repeat(width));
    }

    const bodyStartY = y + (hasHeader ? this.headerHeight : 0);
    const bodyHeight = height - (hasHeader ? this.headerHeight : 0);

    for (let i = 0; i < bodyHeight; i++) {
      const globalIndex = i + this.scrollOffset;
      const itemIdx = this._virtualLoader ? i : globalIndex;
      canvas.moveTo(x, bodyStartY + i);

      if (itemIdx < items.length && items[itemIdx] !== undefined) {
        const item = items[itemIdx]!;
        const isHighlighted = globalIndex === this.selectedIndex;
        this.renderRow(canvas, x, bodyStartY + i, width, item, globalIndex, isHighlighted, visibleCols);
      }
    }
  }

  protected renderHeader(
    canvas: FramebufferCanvas,
    x: number,
    y: number,
    width: number,
    visibleCols: VisibleColumn[]
  ): void {
    if (visibleCols.length === 0) return;

    const parts = visibleCols.map((vc) => {
      const label = vc.col.headerSuffix ? vc.col.label + vc.col.headerSuffix : vc.col.label;
      return vc.col.align === "right" ? label.padStart(vc.width) : label.padEnd(vc.width);
    });

    const row = parts.join(" ");

    fg(canvas, "accent", row);
  }

  protected renderRow(
    canvas: FramebufferCanvas,
    x: number,
    y: number,
    width: number,
    item: TableItem<T> | undefined,
    index: number,
    isHighlighted: boolean,
    _visibleCols: VisibleColumn[]
  ): void {
    if (!item) {
      return;
    }

    const isSelected = item.id === this._selectedId;
    const fgColor = isHighlighted ? (this.focused ? "canvas" : "text") : (isSelected ? "accent" : "text");
    const bgColor = this.focused ? (isHighlighted ? "selectedBg" : "canvasSubtle") : "canvasSubtle";

    let display: string;

    if (_visibleCols.length > 0 && typeof item.data === "object" && item.data !== null && !Array.isArray(item.data)) {
      const parts: { text: string; color?: Color }[] = _visibleCols.map((vc) => {
        let cellValue = (item.data as Record<string, any>)[vc.col.label];
        let text: string;
        if (vc.col.format) {
          text = vc.col.format(cellValue, item.data);
        } else {
          text = cellValue !== undefined && cellValue !== null ? String(cellValue) : "-";
        }
        if (text.length > vc.width) {
          text = "…" + text.substring(text.length - (vc.width - 1));
        }
        text = vc.col.align === "right" ? text.padStart(vc.width) : text.padEnd(vc.width);
        let color: Color | undefined;
        if (vc.col.color) {
          color = (typeof vc.col.color === "function" ? vc.col.color(cellValue, item.data) : vc.col.color) as Color;
        }
        return { text, color };
      });

      if (isHighlighted) canvas.bold(true);
      let cx = x;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i]!;
        const cellColor = isHighlighted ? fgColor : (p.color || fgColor);
        fgBg(canvas, cellColor, bgColor, p.text);
        canvas.moveTo(cx + p.text.length, y);
        cx += p.text.length;
        if (i < parts.length - 1) {
          fgBg(canvas, fgColor, bgColor, " ");
          canvas.moveTo(cx + 1, y);
          cx += 1;
        }
      }
      fgBg(canvas, fgColor, bgColor, " ".repeat(Math.max(0, width - (cx - x))));
      if (isHighlighted) canvas.bold(false);
      return;
    } else {
      display = `${item.label}${item.sublabel ? `  ${item.sublabel}` : ""}`;
    }

    if (isHighlighted) {
      canvas.bold(true);
      fgBg(canvas, fgColor, bgColor, display);
      fgBg(canvas, fgColor, bgColor, " ".repeat(Math.max(0, width - display.length)));
      canvas.bold(false);
    } else {
      fgBg(canvas, fgColor, bgColor, display);
      fgBg(canvas, fgColor, bgColor, " ".repeat(Math.max(0, width - display.length)));
    }
  }

  handleKey(key: string): boolean {
    const total = this._virtualLoader ? this._virtualTotal : this.items.length;
    if (total === 0) return false;

    if (key === "UP" || key === "k") {
      if (this.selectedIndex > 0) {
        this.selectedIndex--;
        if (this.selectedIndex < this.scrollOffset) {
          this.scrollOffset = this.selectedIndex;
        } else if (this.selectedIndex >= this.scrollOffset + this._viewportHeight) {
          this.scrollOffset = this.selectedIndex - this._viewportHeight + 1;
        }
        this._fireHighlight();
        this.markDirty();
        return true;
      }
      return false;
    }

    if (key === "DOWN" || key === "j") {
      if (this.selectedIndex < total - 1) {
        this.selectedIndex++;
        if (this.selectedIndex < this.scrollOffset) {
          this.scrollOffset = this.selectedIndex;
        } else if (this.selectedIndex >= this.scrollOffset + this._viewportHeight) {
          this.scrollOffset = this.selectedIndex - this._viewportHeight + 1;
        }
        this._fireHighlight();
        this.markDirty();
        return true;
      }
      return false;
    }

    if (key === "PAGE_UP") {
      this.selectedIndex = Math.max(0, this.selectedIndex - this._viewportHeight);
      this.scrollOffset = Math.max(0, this.scrollOffset - this._viewportHeight);
      this._fireHighlight();
      this.markDirty();
      return true;
    }

    if (key === "PAGE_DOWN") {
      this.selectedIndex = Math.min(total - 1, this.selectedIndex + this._viewportHeight);
      const maxScroll = Math.max(0, total - this._viewportHeight);
      this.scrollOffset = Math.min(maxScroll, this.scrollOffset + this._viewportHeight);
      this._fireHighlight();
      this.markDirty();
      return true;
    }

    if (key === "HOME") {
      this.selectedIndex = 0;
      this.scrollOffset = 0;
      this._fireHighlight();
      this.markDirty();
      return true;
    }

    if (key === "END") {
      this.selectedIndex = total - 1;
      this.scrollOffset = Math.max(0, total - this._viewportHeight);
      this._fireHighlight();
      this.markDirty();
      return true;
    }

    if (key === "RETURN" || key === "ENTER" || key === "SPACE") {
      const selected = this.getSelectedItem();
      if (selected && this._onSelect) {
        this._onSelect(selected);
      }
      return true;
    }

    return false;
  }

  onFocus(): void {
    super.onFocus();
    const total = this._virtualLoader ? this._virtualTotal : this.items.length;
    if (this.selectedIndex < 0 && total > 0) {
      this.selectedIndex = 0;
      this._fireHighlight();
      this.markDirty();
    }
    this.clampScroll();
  }

  onMouseWheel(_point: Point, direction: 'up' | 'down'): boolean {
    const total = this._virtualLoader ? this._virtualTotal : this.items.length;
    const maxScroll = Math.max(0, total - this._viewportHeight);
    if (direction === 'up' && this.scrollOffset > 0) {
      this.scrollOffset--;
      this.markDirty();
      return true;
    }
    if (direction === 'down' && this.scrollOffset < maxScroll) {
      this.scrollOffset++;
      this.markDirty();
      return true;
    }
    return false;
  }

  onMouseDown(point: Point): boolean {
    const total = this._virtualLoader ? this._virtualTotal : this.items.length;
    if (total === 0) return false;
    const hasHeader = this.showHeader && this.columns.length > 0;
    const bodyStartY = this.rect.y + (hasHeader ? this.headerHeight : 0);
    const row = point.y - bodyStartY;
    if (row >= 0 && row < this._viewportHeight) {
      const itemIndex = row + this.scrollOffset;
      if (itemIndex >= 0 && itemIndex < total) {
        this.selectedIndex = itemIndex;
        this._fireHighlight();
        this.markDirty();
        return true;
      }
    }
    return false;
  }

 }
