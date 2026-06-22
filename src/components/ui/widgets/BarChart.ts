import { Control } from "../Control";
import { fg } from "../../../lib/theme";
import type { Color } from "../../../lib/theme";
import type { Size, RenderContext, Point } from "../types";

// Braille dot bit positions for chart bars (4 cols × 2 rows per cell):
//   col 0: top=dot1(bit0,+1)  bottom=dot2(bit1,+2)
//   col 1: top=dot4(bit3,+8)  bottom=dot5(bit4,+16)
const LEFT_TOP = 1;
const LEFT_BOTTOM = 2;
const RIGHT_TOP = 8;
const RIGHT_BOTTOM = 16;

function barBit(isLeft: boolean, isTop: boolean): number {
  if (isLeft) return isTop ? LEFT_TOP : LEFT_BOTTOM;
  return isTop ? RIGHT_TOP : RIGHT_BOTTOM;
}

function brailleChar(bits: number): string {
  return String.fromCharCode(0x2800 + bits);
}

export class BarChart extends Control {
  focusable = false;

  // ── Data ──
  protected _data: number[] = [];
  protected _labels: string[] = [];
  protected _title = "";

  // ── Options ──
  protected _mode: "bottom-up" | "top-down" = "bottom-up";
  protected _scale: "auto" | "auto-zero" | "fixed" = "auto-zero";
  protected _yMin = 0;
  protected _yMax = 100;
  protected _color: Color = "accent";
  protected _showYAxis = true;
  protected _showXAxis = true;
  protected _showBaseline = true;
  protected _yTickCount = 5;

  // ── Scroll ──
  protected _scrollOffset = 0;
  protected _viewportCols = 0;

  // ── Hover / click ──
  protected _hoverIndex = -1;

  // ── Getters / setters ──

  get data(): number[] { return this._data; }
  set data(v: number[]) {
    if (v !== this._data) { this._data = v; this._scrollOffset = 0; this.markDirty(); }
  }

  get labels(): string[] { return this._labels; }
  set labels(v: string[]) { if (v !== this._labels) { this._labels = v; this.markDirty(); } }

  get title(): string { return this._title; }
  set title(v: string) { if (v !== this._title) { this._title = v; this.markDirty(); } }

  get mode(): "bottom-up" | "top-down" { return this._mode; }
  set mode(v: "bottom-up" | "top-down") { if (v !== this._mode) { this._mode = v; this.markDirty(); } }

  get scale(): "auto" | "auto-zero" | "fixed" { return this._scale; }
  set scale(v: "auto" | "auto-zero" | "fixed") { if (v !== this._scale) { this._scale = v; this.markDirty(); } }

  get yMin(): number { return this._yMin; }
  set yMin(v: number) { if (v !== this._yMin) { this._yMin = v; this.markDirty(); } }

  get yMax(): number { return this._yMax; }
  set yMax(v: number) { if (v !== this._yMax) { this._yMax = v; this.markDirty(); } }

  get color(): Color { return this._color; }
  set color(v: Color) { if (v !== this._color) { this._color = v; this.markDirty(); } }

  get showYAxis(): boolean { return this._showYAxis; }
  set showYAxis(v: boolean) { if (v !== this._showYAxis) { this._showYAxis = v; this.markDirty(); } }

  get showXAxis(): boolean { return this._showXAxis; }
  set showXAxis(v: boolean) { if (v !== this._showXAxis) { this._showXAxis = v; this.markDirty(); } }

  get showBaseline(): boolean { return this._showBaseline; }
  set showBaseline(v: boolean) { if (v !== this._showBaseline) { this._showBaseline = v; this.markDirty(); } }

  get yTickCount(): number { return this._yTickCount; }
  set yTickCount(v: number) { if (v !== this._yTickCount) { this._yTickCount = v; this.markDirty(); } }

  // ── Convenience ──

  setData(data: number[], labels?: string[]): void {
    this._data = data;
    this._labels = labels || [];
    this._scrollOffset = 0;
    this.markDirty();
  }

  // ── Layout ──

  measure(_parentSize?: Size): Size {
    return { width: this.rect.width || 60, height: this.rect.height || 8 };
  }

  // ── Input ──

  handleKey(key: string): boolean {
    const maxScroll = Math.max(0, this._totalBrailleCols - this._viewportCols);
    if ((key === "LEFT" || key === "k") && this._scrollOffset > 0) {
      this._scrollOffset = Math.max(0, this._scrollOffset - 1);
      this.markDirty();
      return true;
    }
    if ((key === "RIGHT" || key === "j") && this._scrollOffset < maxScroll) {
      this._scrollOffset = Math.min(maxScroll, this._scrollOffset + 1);
      this.markDirty();
      return true;
    }
    if (key === "PAGE_UP") {
      this._scrollOffset = Math.max(0, this._scrollOffset - this._viewportCols);
      this.markDirty();
      return true;
    }
    if (key === "PAGE_DOWN") {
      this._scrollOffset = Math.min(maxScroll, this._scrollOffset + this._viewportCols);
      this.markDirty();
      return true;
    }
    if (key === "HOME") {
      this._scrollOffset = 0;
      this.markDirty();
      return true;
    }
    if (key === "END") {
      this._scrollOffset = maxScroll;
      this.markDirty();
      return true;
    }
    return false;
  }

  onMouseDown(point: Point): boolean {
    const idx = this.dataIndexAtPoint(point);
    if (idx >= 0 && idx < this._data.length) {
      this._hoverIndex = idx;
      this.markDirty();
      return true;
    }
    return false;
  }

  // ── Rendering ──

  private _totalBrailleCols = 0;

  draw(ctx: RenderContext): void {
    const { canvas } = ctx;
    const { x: ox, y: oy, width, height } = this.rect;

    if (width < 4 || height < 2 || this._data.length === 0) return;

    // Compute scale
    const { yMin, yMax } = this.computeScale();
    const range = yMax - yMin || 1;

    // Layout
    const titleRows = this._title ? 1 : 0;
    const xAxisRows = this._showXAxis ? 1 : 0;
    const chartRows = Math.max(1, height - titleRows - xAxisRows);
    const yAxisWidth = this._showYAxis ? this.computeYAxisWidth(yMin, yMax) : 0;
    const chartWidth = Math.max(1, width - yAxisWidth - 1);
    const logicalHeight = chartRows * 2;

    // Braille columns
    this._totalBrailleCols = Math.ceil(this._data.length / 2);
    this._viewportCols = chartWidth;
    const maxScroll = Math.max(0, this._totalBrailleCols - this._viewportCols);
    this._scrollOffset = Math.max(0, Math.min(maxScroll, this._scrollOffset));

    const visibleStartCol = this._scrollOffset;
    const visibleEndCol = Math.min(this._totalBrailleCols, visibleStartCol + chartWidth);
    const visibleCols = visibleEndCol - visibleStartCol;

    // Build Braille grid: grid[brRow][brCol] = { bits, color }
    // brRow 0 = bottom, brCol 0 = left (within visible range)
    const grid: number[][] = [];
    for (let br = 0; br < chartRows; br++) {
      const row: number[] = [];
      for (let bc = 0; bc < visibleCols; bc++) {
        row.push(0);
      }
      grid.push(row);
    }

    // Plot bars
    for (let bc = 0; bc < visibleCols; bc++) {
      const globalCol = visibleStartCol + bc;
      for (let side = 0; side < 2; side++) {
        const dataIdx = globalCol * 2 + side;
        if (dataIdx >= this._data.length) break;

        const val = this._data[dataIdx]!;
        const normalized = Math.max(0, Math.min(1, (val - yMin) / range));
        const barHeight = Math.round(normalized * logicalHeight);

        for (let y = 0; y < barHeight; y++) {
          const br = Math.floor(y / 2);
          const withinPair = y % 2;
          const isTop = withinPair === 1;
          const isLeft = side === 0;
          grid[br]![bc]! |= barBit(isLeft, isTop);
        }
      }
    }

    // Compute y-axis ticks
    const ticks: { row: number; label: string }[] = [];
    if (this._showYAxis && this._yTickCount > 0) {
      for (let i = 0; i < this._yTickCount; i++) {
        const fraction = this._yTickCount === 1 ? 0.5 : i / (this._yTickCount - 1);
        const value = yMin + fraction * range;
        const logicalRow = Math.round(fraction * (logicalHeight - 1));
        const brRow = Math.min(chartRows - 1, Math.floor(logicalRow / 2));
        ticks.push({ row: brRow, label: this.formatTick(value) });
      }
    }
    const tickSet = new Map(ticks.map(t => [t.row, t.label]));

    let cursorY = oy;

    // Title
    if (this._title) {
      canvas.moveTo(ox, cursorY);
      fg(canvas, "text", this._title);
      cursorY++;
    }

    // Chart area (render from top Braille row to bottom)
    for (let br = chartRows - 1; br >= 0; br--) {
      canvas.moveTo(ox, cursorY);

      // Y-axis label
      if (this._showYAxis) {
        const label = tickSet.get(br) || "";
        const padLen = Math.max(0, yAxisWidth - label.length);
        if (label) {
          canvas.write(" ".repeat(padLen));
          fg(canvas, "textMuted", label);
        } else {
          canvas.write(" ".repeat(yAxisWidth));
        }
      }

      // Baseline separator
      canvas.setForegroundColor("textMuted");
      if (br === 0 && this._showBaseline) {
        canvas.write("\u2524");
      } else if (tickSet.has(br)) {
        canvas.write("\u251c");
      } else {
        canvas.write("\u2502");
      }

      // Braille bars
      const rowBits = grid[br]!;
      if (this._hoverIndex >= 0) {
        // Render with per-cell coloring for hover highlight
        const hoverCol = Math.floor(this._hoverIndex / 2) - visibleStartCol;

        for (let bc = 0; bc < visibleCols; bc++) {
          const bits = rowBits[bc]!;
          if (!bits) {
            canvas.write(" ");
            continue;
          }

          if (bc === hoverCol) {
            fg(canvas, "accentColor", brailleChar(bits));
          } else {
            fg(canvas, this._color, brailleChar(bits));
          }
        }
      } else {
        // Single-color render: build string and write once
        let line = "";
        for (let bc = 0; bc < visibleCols; bc++) {
          const bits = rowBits[bc]!;
          line += bits ? brailleChar(bits) : " ";
        }
        fg(canvas, this._color, line);
      }

      cursorY++;
    }

    // Baseline
    if (this._showBaseline) {
      canvas.moveTo(ox, cursorY);
      if (this._showYAxis) {
        fg(canvas, "border", "\u2514" + "\u2500".repeat(yAxisWidth));
      }
      fg(canvas, "border", "\u2500".repeat(visibleCols));
      cursorY++;
    }

    // X-axis labels
    if (this._showXAxis && this._labels.length > 0) {
      canvas.moveTo(ox, cursorY);
      if (this._showYAxis) {
        canvas.write(" ".repeat(yAxisWidth + 1));
      }

      let labelStr = "";
      for (let bc = 0; bc < visibleCols; bc++) {
        const globalCol = visibleStartCol + bc;
        const dataIdx = globalCol * 2;
        const label = this._labels[dataIdx] || "";
        const truncated = label.length > 1 ? label[0]! : label || " ";
        labelStr += truncated;
      }
      fg(canvas, "textMuted", labelStr);
      cursorY++;
    }

    // Hover tooltip
    if (this._hoverIndex >= 0 && this._hoverIndex < this._data.length) {
      const val = this._data[this._hoverIndex]!;
      const lbl = this._labels[this._hoverIndex] ?? `#${this._hoverIndex}`;
      ctx.showMessage(`${lbl}: ${val}`);
    }
  }

  // ── Helpers ──

  private computeScale(): { yMin: number; yMax: number } {
    if (this._scale === "fixed") {
      return { yMin: this._yMin, yMax: this._yMax };
    }

    let min = Infinity;
    let max = -Infinity;
    for (const v of this._data) {
      if (v < min) min = v;
      if (v > max) max = v;
    }

    if (!isFinite(min)) { min = 0; max = 1; }

    if (this._scale === "auto-zero") {
      min = Math.min(0, min);
    }

    // Add 5% padding at the top
    const range = max - min || 1;
    max = min + range * 1.05;

    return { yMin: min, yMax: max };
  }

  private computeYAxisWidth(yMin: number, yMax: number): number {
    let maxLen = 0;
    const range = yMax - yMin || 1;
    for (let i = 0; i < this._yTickCount; i++) {
      const fraction = this._yTickCount === 1 ? 0.5 : i / (this._yTickCount - 1);
      const value = yMin + fraction * range;
      const len = this.formatTick(value).length;
      if (len > maxLen) maxLen = len;
    }
    return Math.max(1, Math.min(maxLen + 1, 10));
  }

  private formatTick(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
    if (Number.isInteger(value)) return String(value);
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(2);
  }

  private dataIndexAtPoint(point: Point): number {
    const { x: px, y: py } = point;
    const { x: ox, y: oy } = this.rect;

    const titleRows = this._title ? 1 : 0;
    const xAxisRows = this._showXAxis ? 1 : 0;
    const chartRows = Math.max(1, this.rect.height - titleRows - xAxisRows);
    const yAxisWidth = this._showYAxis ? this.computeYAxisWidth(this._yMin, this._yMax) : 0;
    const chartWidth = Math.max(1, this.rect.width - yAxisWidth - 1);

    // Check if point is within chart area
    const relY = py - oy - titleRows;
    const relX = px - ox - yAxisWidth - 1;

    if (relY < 0 || relY >= chartRows) return -1;
    if (relX < 0 || relX >= chartWidth) return -1;

    const bc = relX + this._scrollOffset;
    const dataIdx = bc * 2;

    if (dataIdx >= this._data.length) return -1;

    // Check if the bar at this position actually has data at this height
    const { yMin, yMax } = this.computeScale();
    const range = yMax - yMin || 1;
    const logicalHeight = chartRows * 2;

    // Braille row (0 = bottom)
    const br = chartRows - 1 - relY;
    const logicalRowTop = br * 2 + 1;
    const logicalRowBot = br * 2;

    for (let side = 0; side < 2; side++) {
      const idx = dataIdx + side;
      if (idx >= this._data.length) break;
      const val = this._data[idx]!;
      const normalized = Math.max(0, Math.min(1, (val - yMin) / range));
      const barHeight = Math.round(normalized * logicalHeight);

      if (barHeight > logicalRowBot) {
        return idx;
      }
    }

    return -1;
  }
}
