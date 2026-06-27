# Braille XY Point Chart Spec

## Overview

A terminal-based scatter plot component that renders (x, y) data points using Braille Unicode characters (`U+2800`–`U+28FF`). Each Braille character encodes up to 8 dots in a 2×4 grid, providing 8× the resolution of standard character-cell plots.

Primary use: visualizing speed curves from `task_speed_samples` data (position vs speed_tps) in the task details panel.

---

## Braille Dot Mapping

### Dot Grid

Each Braille character represents a 2-column × 4-row dot grid:

```
Dot indices (row-major):
  0  1
  2  3
  4  5
  6  7
```

### Unicode Encoding

Braille pattern `U+2800` is the empty cell. Each dot is a bit:

| Dot | Bit | Unicode offset | Character |
|-----|-----|----------------|-----------|
| 0   | 1   | 0x01           | ⠁ |
| 1   | 2   | 0x02           | ⠂ |
| 2   | 4   | 0x04           | ⠃ |
| 3   | 8   | 0x08           | ⠄ |
| 4   | 16  | 0x10           | ⠅ |
| 5   | 32  | 0x20           | ⠆ |
| 6   | 64  | 0x40           | ⠇ |
| 7   | 128 | 0x80           | ⠐ |

Composite: `char = String.fromCodePoint(0x2800 | dot0*1 | dot1*2 | dot2*4 | dot3*8 | dot4*16 | dot5*32 | dot6*64 | dot7*128)`

### Data-to-Dot Mapping

- **X axis** → horizontal dot column (0 or 1), determined by `floor(xInCell) % 2`
- **Y axis** → vertical dot row (0–3), determined by `3 - floor(yInCell) % 4` (inverted: row 0 = top)
- Multiple points falling in the same dot cell → OR their bits together

---

## Chart Layout

```
┌─────────────────────────────────────────┐
│ Legend: P ●  G ●  Avg ─                 │  ← row 0: legend
│ 500 ┤                                    │
│ 400 ┤          ⠁⠁                        │  ← data rows
│ 300 ┤      ⠁⠁⠁⠁⠁⠁⠁⠁                     │
│ 200 ┤  ⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁           │
│ 100 ┤⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁⠁│
│   0 ┤                                    │
│     └────────────────────────────────────│  ← bottom: X axis labels
│     0        5000       10000            │
└─────────────────────────────────────────┘
```

### Regions

| Region | Rows | Purpose |
|--------|------|---------|
| Legend | 1 | Series labels, avg speed indicators |
| Y axis labels | data rows | Speed values (right-aligned) |
| Braille grid | data rows | Main plot area |
| X axis labels | 1 | Position values |

### Sizing

- **Minimum**: 20 wide × 8 tall (yields ~10 Braille columns × 4 dot rows)
- **Typical**: 38 wide × 12 tall (details panel)
- **Responsive**: fills available container width/height
- Y label column: 5 chars wide
- X label row: auto-spaced

---

## Data Mapping

### Input

Array of points with series assignment:

```typescript
interface ChartPoint {
  x: number;    // position (tokens)
  y: number;    // speed (t/s)
  series: string; // "P" or "G"
}
```

### Scaling

- **X**: `0` → `maxX` (auto from data), linear
- **Y**: `0` → `niceRound(maxY)` (auto from data), linear
- **Nice round**: 10, 20, 50, 100, 200, 500, 1000 (pick smallest ≥ maxY)
- **Log scale toggle**: Y uses `log10(y + 1)` mapping, ticks at 1, 10, 100, 1000

### Coordinate Conversion

```
brailleCol = floor((point.x / maxX) * (gridWidth - 1))
brailleRow = floor((1 - point.y / maxY) * (gridHeight - 1))
dotCol = brailleCol % 2
dotRow = brailleRow % 4
dotIndex = dotRow * 2 + dotCol
```

### Y-Axis Ticks

5 tick labels, evenly spaced. Values computed from `maxY / 4 * i`, formatted compact:

| Value | Format |
|-------|--------|
| < 1000 | `NNN` |
| ≥ 1000 | `N.Nk` or `NNk` |

---

## Multi-Series Rendering

### Per-Cell Color Resolution

A single Braille character can contain dots from both series. Since terminal colors apply to the full character:

- **Single series in cell**: use that series color
- **Both series in cell**: use a neutral/accent color, or the series with more dots in the cell
- **Overlap marker**: when both series share a dot, use the same dot bit (no visual distinction at sub-cell level)

### Series Definitions

| Series | Label | Default Color | Data Source |
|--------|-------|---------------|-------------|
| P | Prompt | Green | `phase = 'prompt'` |
| G | Generation | Cyan | `phase = 'generation'` |

---

## Overlays

### Average Speed Lines

Horizontal reference lines rendered as a distinct character (`─` or `━`) at the Y position corresponding to each series' average speed. Color: muted version of series color.

```
│ 300 ┤───────────────────────────────────│  ← avg line for series P
```

### Min/Max Markers

The first and last point of each generation series rendered with a distinct Braille dot pattern or surrounding character (`▲` for max, `▼` for min).

### Degradation Label

Text overlay in legend: `Deg: 1.48x` (first speed / last speed for generation phase).

---

## Interactivity

| Input | Action |
|-------|--------|
| Mouse hover | Show tooltip: `pos=4200 speed=35.2 t/s` for nearest point |
| Scroll wheel (horiz) | Pan X when data range exceeds grid width |
| `L` key | Toggle log scale on Y axis |
| `1`/`2` keys | Toggle visibility of series P/G |

---

## Component API

```typescript
interface ChartSeries {
  label: string;
  color: ThemeColor;
  points: ChartPoint[];
}

class BrailleChart extends Control {
  focusable = false;
  series: ChartSeries[];
  logScale: boolean;
  visibleSeries: Set<string>;

  setSeries(series: ChartSeries[]): void;
  toggleLogScale(): void;
  toggleSeries(label: string): void;
}
```

---

## Integration: Task Details Panel

### Data Source

```typescript
// Query from task_speed_samples
const samples = db.prepare(`
  SELECT phase, position, speed_tps, ms_per_token, elapsed_s
  FROM task_speed_samples
  WHERE task_id = ?
  ORDER BY position
`).all(taskId);

const series: ChartSeries[] = [
  {
    label: "P",
    color: "green",
    points: samples.filter(s => s.phase === "prompt").map(s => ({
      x: s.position, y: s.speed_tps, series: "P"
    }))
  },
  {
    label: "G",
    color: "cyan",
    points: samples.filter(s => s.phase === "generation").map(s => ({
      x: s.position, y: s.speed_tps, series: "G"
    }))
  }
];
```

### Placement

Below the existing task details key-value list, inside the `TaskDetailsControl`. The details panel becomes scrollable with two sections:

1. Key-value metadata (existing)
2. Speed curve chart (new, below metadata)

### Empty State

When task has no speed samples (pre-migration tasks):
```
  ┌──────────────────────┐
  │  No speed data        │
  │  (task predates       │
  │   speed tracking)     │
  └──────────────────────┘
```

---

## Implementation Plan

### Phase 1: Core Chart Component
1. Create `src/components/ui/widgets/BrailleChart.ts`
2. Implement Braille dot encoding function
3. Implement data-to-grid coordinate mapping
4. Render Braille grid with axis labels
5. Handle multi-series color resolution

### Phase 2: Overlays & Legend
1. Average speed horizontal lines
2. Legend row with series colors
3. Degradation ratio label

### Phase 3: Integration
1. Add `getSpeedSamples(taskId)` to `tasks.ts`
2. Wire chart into `TaskDetailsControl`
3. Handle empty state and scrollable panel

### Phase 4: Interactivity
1. Mouse hover tooltip
2. Log scale toggle
3. Series visibility toggle

---

## Tradeoffs

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Braille over ASCII chars | Braille | 8× resolution, smooth curves from dense point clouds |
| Single color per cell | Dominant series | Terminal limitation; acceptable at 8-dot resolution |
| Y axis starts at 0 | Yes | Prevents misleading visual gaps; speed is always ≥ 0 |
| Log scale optional | Toggle | Prompt (~500 t/s) and gen (~30 t/s) differ 10×; log helps see both |
| Lines vs dots only | Dots only | Braille dots form natural curves; lines add complexity with low benefit |
