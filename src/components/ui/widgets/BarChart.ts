import { Control } from "../Control";
import { fg, fgBg } from "../../../lib/theme";
import type { Color } from "../../../lib/theme";
import type { Size, RenderContext, Point } from "../types";

// Braille dot bit positions for chart bars (2 bars × 4 rows per cell):
//   Left bar:  dot 1 (bit 0, +1),  dot 2 (bit 1, +2),  dot 3 (bit 2, +4),  dot 7 (bit 6, +64)
//   Right bar: dot 4 (bit 3, +8),  dot 5 (bit 4, +16), dot 6 (bit 5, +32), dot 8 (bit 7, +128)
const LEFT_DOTS  = [64, 4, 2, 1];
const RIGHT_DOTS = [128, 32, 16, 8];

function barBit(row: number, isLeft: boolean): number {
  const dots = isLeft ? LEFT_DOTS : RIGHT_DOTS;
  return dots[Math.min(row, 3)] || 0;
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

  onMouseDown(_point: Point): boolean {
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
    const logicalHeight = chartRows * 4;

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
          const br = Math.floor(y / 4);
          const dotRow = y % 4;
          const isLeft = side === 0;
          grid[br]![bc]! |= barBit(dotRow, isLeft);
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
        const brRow = Math.min(chartRows - 1, Math.floor(logicalRow / 4));
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
      let line = "";
      for (let bc = 0; bc < visibleCols; bc++) {
        const bits = rowBits[bc]!;
        line += bits ? brailleChar(bits) : " ";
      }
      fg(canvas, this._color, line);

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

  private computeYAxisWidth(_yMin: number, _yMax: number): number {
    return 4;
  }

  private formatTick(value: number): string {
    let s: string;
    if (value >= 1_000_000) s = `${(value / 1_000_000).toFixed(0)}M`;
    else if (value >= 1_000) s = `${(value / 1_000).toFixed(0)}k`;
    else if (Number.isInteger(value)) s = String(value);
    else if (Math.abs(value) >= 100) s = value.toFixed(0);
    else if (Math.abs(value) >= 10) s = value.toFixed(1);
    else s = value.toFixed(2);
    return s.padStart(4);
  }
}