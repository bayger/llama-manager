import { Control } from "../Control";
import { fg } from "../../../lib/theme";
import type { Color } from "../../../lib/theme";
import type { Size, RenderContext } from "../types";

export interface ChartPoint {
  x: number;
  y: number;
}

export interface ChartSeries {
  label: string;
  color: Color;
  points: ChartPoint[];
}

// virtX%2=0 (left) → dots 1,2,3,7 : hex 0x01, 0x02, 0x04, 0x40
// virtX%2=1 (right) → dots 4,5,6,8 : hex 0x08, 0x10, 0x20, 0x80
const DOT_HEX: number[][] = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
];

function brailleChar(bits: number): string {
  return String.fromCodePoint(0x2800 + bits);
}

function niceRound(val: number): number {
  const steps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
  for (const s of steps) {
    if (s >= val) return s;
  }
  return steps[steps.length - 1] * 10;
}

function formatTick(value: number): string {
  if (value >= 1000) {
    const k = value / 1000;
    return k % 1 === 0 ? `${k.toFixed(0)}k` : k.toFixed(1) + "k";
  }
  return String(Math.round(value));
}

export class BrailleChart extends Control {
  focusable = false;

  protected _series: ChartSeries[] = [];
  protected _logScale = false;
  protected _visibleSeries = new Set<string>();

  setSeries(series: ChartSeries[]): void {
    this._series = series;
    this._visibleSeries = new Set(series.map((s) => s.label));
    this.markDirty();
  }

  toggleLogScale(): void {
    this._logScale = !this._logScale;
    this.markDirty();
  }

  toggleSeries(label: string): void {
    if (this._visibleSeries.has(label)) {
      this._visibleSeries.delete(label);
    } else {
      this._visibleSeries.add(label);
    }
    this.markDirty();
  }

  measure(_parentSize?: Size): Size {
    return { width: this.rect.width || 40, height: this.rect.height || 10 };
  }

  draw(ctx: RenderContext): void {
    const { canvas } = ctx;
    const { x: ox, y: oy, width, height } = this.rect;

    if (width < 8 || height < 3) return;

    const visible = this._series.filter((s) => this._visibleSeries.has(s.label));
    if (visible.length === 0) return;

    const allPoints = visible.flatMap((s) => s.points);
    if (allPoints.length === 0) return;

    // Compute data bounds
    let maxX = 0;
    let maxY = 0;
    for (const p of allPoints) {
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    if (maxX === 0 || maxY === 0) return;

    const yMax = niceRound(maxY);

    // Layout
    const legendRows = 1;
    const xLabelRows = 1;
    const gridHeight = Math.max(1, height - legendRows - xLabelRows);
    const yAxisWidth = 5;
    const gridWidth = Math.max(1, width - yAxisWidth - 1);

    // Virtual pixel dimensions
    const virtW = gridWidth * 2;
    const virtH = gridHeight * 4;

    // Build grid: bits[row][col] and series tracking
    const gridBits: number[][] = Array.from({ length: gridHeight }, () =>
      new Array(gridWidth).fill(0)
    );
    const gridSeries: number[][][] = visible.map(() =>
      Array.from({ length: gridHeight }, () => new Array(gridWidth).fill(0))
    );

    // Plot points per series
    for (let si = 0; si < visible.length; si++) {
      const series = visible[si]!;
      const countGrid = gridSeries[si]!;
      for (const pt of series.points) {
        const logY = this._logScale ? Math.log10(pt.y + 1) / Math.log10(yMax + 1) : pt.y / yMax;
        const virtX = Math.floor((pt.x / maxX) * (virtW - 1));
        const virtY = Math.floor((1 - logY) * (virtH - 1));

        const col = Math.floor(virtX / 2);
        const row = Math.floor(virtY / 4);

        if (col < 0 || col >= gridWidth || row < 0 || row >= gridHeight) continue;

        const dotCol = virtX % 2;
        const dotRow = virtY % 4;
        const hex = DOT_HEX[dotCol]![dotRow]!;

        gridBits[row]![col]! |= hex;
        countGrid[row]![col]!++;
      }
    }

    // Degradation ratio for last series (generation)
    let degLabel = "";
    if (visible.length > 1) {
      const gen = visible[1]!.points;
      if (gen.length >= 2) {
        const first = gen[0]!.y;
        const last = gen[gen.length - 1]!.y;
        if (last > 0) {
          const ratio = first / last;
          degLabel = `Deg: ${ratio.toFixed(2)}x`;
        }
      }
    }

    // Y-axis ticks
    const ticks: { row: number; label: string }[] = [];
    const tickCount = 5 as number;
    for (let i = 0; i < tickCount; i++) {
      const fraction = tickCount === 1 ? 0.5 : i / (tickCount - 1);
      const value = fraction * yMax;
      const logicalRow = Math.floor(fraction * (virtH - 1));
      const brRow = Math.min(gridHeight - 1, Math.floor(logicalRow / 4));
      ticks.push({ row: brRow, label: formatTick(value) });
    }
    const tickSet = new Map(ticks.map((t) => [t.row, t.label]));

    let cursorY = oy;

    // Legend row
    {
      canvas.moveTo(ox, cursorY);
      for (let si = 0; si < visible.length; si++) {
        if (si > 0) canvas.write("  ");
        fg(canvas, visible[si]!.color, `${visible[si]!.label} ${brailleChar(0xff)}`);
      }
      if (degLabel) {
        fg(canvas, "textMuted", `  ${degLabel}`);
      }
      cursorY++;
    }

    // Grid rows (top to bottom)
    for (let row = gridHeight - 1; row >= 0; row--) {
      canvas.moveTo(ox, cursorY);

      // Y-axis label
      const tickLabel = tickSet.get(row) || "";
      const padLen = Math.max(0, yAxisWidth - tickLabel.length);
      if (tickLabel) {
        canvas.write(" ".repeat(padLen));
        fg(canvas, "textMuted", tickLabel);
      } else {
        canvas.write(" ".repeat(yAxisWidth));
      }

      // Baseline separator
      canvas.setForegroundColor("textMuted");
      canvas.write(row === 0 ? "\u2524" : tickSet.has(row) ? "\u251c" : "\u2502");

      // Braille grid row
      let line = "";
      for (let col = 0; col < gridWidth; col++) {
        const bits = gridBits[row]![col]!;
        line += bits ? brailleChar(bits) : " ";
      }
      // Determine dominant series for this row
      let dominantSi = 0;
      let maxCount = 0;
      for (let si = 0; si < visible.length; si++) {
        let count = 0;
        for (let col = 0; col < gridWidth; col++) {
          count += gridSeries[si]![row]![col]!;
        }
        if (count > maxCount) {
          maxCount = count;
          dominantSi = si;
        }
      }
      fg(canvas, visible[dominantSi]!.color, line);

      cursorY++;
    }

    // X-axis baseline
    {
      canvas.moveTo(ox, cursorY);
      fg(canvas, "border", "\u2514" + "\u2500".repeat(yAxisWidth));
      fg(canvas, "border", "\u2500".repeat(gridWidth));
      cursorY++;
    }

    // X-axis labels
    {
      canvas.moveTo(ox, cursorY);
      canvas.write(" ".repeat(yAxisWidth + 1));

      const numLabels = 5 as number;
      const labelPositions: { col: number; label: string }[] = [];
      for (let i = 0; i < numLabels; i++) {
        const fraction = numLabels === 1 ? 0.5 : i / (numLabels - 1);
        const value = fraction * maxX;
        const virtX = Math.floor(fraction * (virtW - 1));
        const col = Math.floor(virtX / 2);
        labelPositions.push({ col: Math.min(gridWidth - 1, col), label: formatTick(value) });
      }

      let xLine = " ".repeat(gridWidth);
      for (const lp of labelPositions) {
        const chars = lp.label.split("");
        let start = lp.col - Math.floor(chars.length / 2);
        if (start < 0) start = 0;
        if (start + chars.length > gridWidth) start = gridWidth - chars.length;
        if (start < 0) continue;
        for (let ci = 0; ci < chars.length; ci++) {
          xLine = xLine.substring(0, start + ci) + chars[ci]! + xLine.substring(start + ci + 1);
        }
      }
      fg(canvas, "textMuted", xLine);
    }
  }
}
