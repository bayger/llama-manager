# 003 - Braille BarChart control

**Location:** `src/components/ui/widgets/BarChart.ts` (new file)

**Goal:** A terminal bar chart widget that uses Braille characters (`U+2800`–`U+28FF`) for high-density rendering. Each Braille cell encodes 2 bars (left/right half-cell), each bar has 2 levels of height (top/bottom dot), giving 4× the density of standard ASCII block characters.

## Braille encoding

Each Braille cell = 2 bars × 4 height levels:

```
  ┌─ left bar  ─┐┌─ right bar ─┐
  │ dot 1 (bit0)││ dot 4 (bit3)│
  │ dot 2 (bit1)││ dot 5 (bit4)│
  │ dot 3 (bit2)││ dot 6 (bit5)│
  │ dot 7 (bit6)││ dot 8 (bit7)│
```

- Bar height 0 → `⠀` (empty cell)
- Bar height 1 → `⠃` (dot 7) or `⠿` (dot 8)
- Bar height 4 (full) → all dots set

For a chart with `H` logical rows, output spans `ceil(H / 4)` Braille rows. For `N` data values, each row is `ceil(N / 2)` characters wide.

## API

```typescript
interface BarChartProps {
  data: number[];              // raw values
  labels?: string[];           // optional x-axis labels (1:1 with data)
  title?: string;              // optional chart title

  // Orientation
  mode: "bottom-up" | "top-down" | "center-out";

  // Scaling
  scale: "auto" | "auto-zero" | "fixed";
  yMin?: number;               // required when scale === "fixed"
  yMax?: number;               // required when scale === "fixed"

  // Color
  color: string;               // hex color for all bars
  gradient?: [string, string]; // [minColor, maxColor] for per-bar gradient
  thresholds?: Array<{ value: number; color: string }>; // color bands

  // Axes
  showYAxis: boolean;          // numeric labels on left (default: true)
  showXAxis: boolean;          // labels below (default: true)
  showBaseline: boolean;       // visible line at y=0 or y=min
  yTickCount: number;          // number of y-axis ticks (default: 5)
  showGridLines: boolean;      // horizontal guide lines (default: false)

  // Bar styling
  barGap: number;              // 0 = touching, 1 = half-char gap between bars
  style: "solid" | "outlined"; // fill mode (default: "solid")

  // Layout
  minHeight: number;           // minimum logical height (default: 4)
}
```

## Rendering

### Layout pass
1. Reserve rows: title (1 if present) + y ticks + x labels (1 if `showXAxis`)
2. Remaining rows → chart area, mapped to logical height
3. Each logical row pair → 1 Braille row

### Y-axis labels
- `yTickCount` evenly spaced labels from `yMin` to `yMax`
- Right-aligned, fixed-width column to the left of the chart
- Format via `utils.ts` `formatNum`

### X-axis labels
- If `labels.length <= available width`, render all
- If overflow, sample evenly to fit, mark with `…`
- Truncate individual labels to fit their slot

### Bar rasterization
For each bar at index `i` with normalized value `v` (0–1):
1. Logical height = `v * chartLogicalHeight`
2. For each logical row `y` from 0 to `H-1`:
   - Determine Braille cell `(col, row)` = `(floor(i/2), floor(y/4))`
   - Determine dot within cell: left/right bar, row within cell (`y % 4`)
   - Set corresponding bit if `y < logicalHeight` (bottom-up) or `y >= H - logicalHeight` (top-down)
3. Compose Braille character: `0x2800 | accumulated_bits`
4. Apply color (single, gradient, or threshold)

## v1 scope

- **Bottom-up mode only**
- **Solid bars, no gap**
- **Auto-zero scaling** (min always 0)
- **Single color**
- **Y-axis labels** (5 ticks)
- **X-axis labels** (truncated/sampled)
- **Hover tooltip** (show value under cursor)
- **Horizontal scroll** if data exceeds width

## Deferred to v2+

- Top-down, center-out modes
- Multi-series (stacked, grouped)
- Gradient and threshold coloring
- Outlined bar style
- Bar gaps
- Horizontal bar orientation
- Grid lines
- Log scale
- Line/area chart modes

## Use cases in llama-dashboard

- **Dashboard tab**: token speed over time, context usage
- **Tasks tab**: prompt/output token distribution
- **Models tab**: download progress history
- **Options tab**: poll interval tuning feedback
