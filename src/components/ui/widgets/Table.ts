import { Control } from "../Control.js";
import { fg, fgBg, themeColors } from "../../../lib/theme.js";
import type { Point, Size, RenderContext } from "../types.js";
import type { FramebufferCanvas } from "../../../lib/framebuffer-canvas.js";

export interface TableColumn {
  label: string;
  width: number;
  flex?: number;
  align?: "left" | "right";
  headerSuffix?: string;
  format?: (cellData: any, row: any) => string;
}

export interface ComputedColumn {
  label: string;
  width: number;
  align?: "left" | "right";
}

export interface TableItem<T = any> {
  id: string | number;
  label: string;
  sublabel?: string;
  data?: T;
}

export type TableRenderer<T> = (
  canvas: FramebufferCanvas,
  item: TableItem<T>,
  index: number,
  isSelected: boolean,
  x: number,
  y: number,
  width: number,
  columns: ComputedColumn[]
) => void;

interface VisibleColumn {
  col: TableColumn;
  width: number;
}

export class Table<T = any> extends Control {
  focusable = true;

  public columns: TableColumn[] = [];
  public items: TableItem<T>[] = [];
  protected _selectedIndex = -1;
  public scrollOffset = 0;
  public contentHeight = 0;
  public showHeader = true;
  public headerHeight = 2;

  protected _onSelect: ((item: TableItem<T>) => void) | null = null;
  protected _onHighlight: ((item: TableItem<T> | null) => void) | null = null;
  protected _customRenderer: TableRenderer<T> | null = null;
  protected _viewportHeight = 0;

  get selectedIndex(): number { return this._selectedIndex; }
  set selectedIndex(v: number) { if (v !== this._selectedIndex) { this._selectedIndex = v; this.markDirty(); } }

  measure(_parentSize?: Size): Size {
    return { width: this.rect.width || 40, height: this.rect.height || 10 };
  }

  onLayout(): void {
    const bodyHeight = this.rect.height - (this.showHeader ? this.headerHeight : 0);
    this._viewportHeight = Math.max(0, bodyHeight);
    this.clampScroll();
  }

  setOnSelect(callback: (item: TableItem<T>) => void): void {
    this._onSelect = callback;
  }

  setOnHighlight(callback: (item: TableItem<T> | null) => void): void {
    this._onHighlight = callback;
  }

  setRenderer(renderer: TableRenderer<T>): void {
    this._customRenderer = renderer;
  }

  updateItems(items: TableItem<T>[]): void {
    this.items = items;
    this.contentHeight = items.length;
    if (this.selectedIndex >= items.length) {
      this.selectedIndex = items.length > 0 ? items.length - 1 : -1;
    }
    this.clampScroll();
    this.markDirty();
  }

  getSelectedItem(): TableItem<T> | null {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.items.length) {
      return this.items[this.selectedIndex]!;
    }
    return null;
  }

  protected _fireHighlight(): void {
    if (this._onHighlight) {
      this._onHighlight(this.getSelectedItem());
    }
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

  render(ctx: RenderContext): void {
    if (!this.visible || !this.needsRender) {
      if (this.needsRender) this.needsRender = false;
      return;
    }

    const { canvas } = ctx;
    const { x, y, width, height } = this.rect;
    const items = this.items;

    canvas.colorRgbHex(themeColors.canvas);
    canvas.bgColorRgbHex(themeColors.canvas);
    canvas.clearRect(x, y, width, height);
    canvas.moveTo(x, y);

    if (items.length === 0) {
      this.needsRender = false;
      return;
    }

    const visibleCols = this.computeVisibleColumns(width);
    const   hasHeader = this.showHeader && visibleCols.length > 0;

    if (hasHeader) {
      canvas.moveTo(x, y);
      canvas.styleReset();
      this.renderHeader(canvas, x, y, width, visibleCols);
      // Separator line below header
      canvas.moveTo(x, y + 1);
      fg(canvas, themeColors.borderActive, "\u2500".repeat(width));
    }

    const bodyStartY = y + (hasHeader ? this.headerHeight : 0);
    const bodyHeight = height - (hasHeader ? this.headerHeight : 0);

    for (let i = 0; i < bodyHeight; i++) {
      const itemIndex = i + this.scrollOffset;
      canvas.moveTo(x, bodyStartY + i);

      if (itemIndex < items.length && items[itemIndex] !== undefined) {
        const item = items[itemIndex]!;
        const isSelected = itemIndex === this.selectedIndex && this.focused;
        this.renderRow(canvas, x, bodyStartY + i, width, item, itemIndex, isSelected, visibleCols);
      }
    }

    this.needsRender = false;
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

    const row = " " + parts.join(" ");

    fg(canvas, themeColors.accent, row);
  }

  protected renderRow(
    canvas: FramebufferCanvas,
    x: number,
    y: number,
    width: number,
    item: TableItem<T> | undefined,
    index: number,
    isSelected: boolean,
    _visibleCols: VisibleColumn[]
  ): void {
    if (!item) {
      return;
    }

    if (this._customRenderer && item.data !== undefined) {
      const computedCols = _visibleCols.map((vc) => ({
        label: vc.col.label,
        width: vc.width,
        align: vc.col.align,
      }));
      this._customRenderer(canvas, item, index, isSelected, x, y, width, computedCols);
      return;
    }

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
        const viewportBottom = this.scrollOffset + this._viewportHeight;
        if (this.selectedIndex >= viewportBottom) {
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
      this.selectedIndex = Math.min(this.items.length - 1, this.selectedIndex + this._viewportHeight);
      const maxScroll = Math.max(0, this.items.length - this._viewportHeight);
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
      this.selectedIndex = this.items.length - 1;
      this.scrollOffset = Math.max(0, this.items.length - this._viewportHeight);
      this._fireHighlight();
      this.markDirty();
      return true;
    }

    if (key === "RETURN" || key === "ENTER") {
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

  onMouseDown(point: Point): boolean {
    if (this.items.length === 0) return false;
    const hasHeader = this.showHeader && this.columns.length > 0;
    const bodyStartY = this.rect.y + (hasHeader ? this.headerHeight : 0);
    const row = point.y - bodyStartY;
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
