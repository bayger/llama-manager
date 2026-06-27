# Braille XY Point Chart Spec

## Overview

A terminal-based scatter plot component that renders (x, y) data points using Braille Unicode characters (`U+2800`–`U+28FF`). Each Braille character encodes up to 8 dots in a 2×4 grid, providing 8× the resolution of standard character-cell plots. Dot encoding follows [ISO/TR 11548-1](https://en.wikipedia.org/wiki/Braille_Patterns) (Unicode Braille Patterns block).

Primary use: visualizing speed curves from `task_speed_samples` data (position vs speed_tps) in the task details panel.

---

## Braille Dot Mapping

Per [ISO/TR 11548-1](https://en.wikipedia.org/wiki/Braille_Patterns), Unicode uses standard dot numbering 1–8. The irregular numbering (1-2-3-**7** left, 4-5-6-**8** right) reflects the historical addition of dots 7 and 8 below the original 6-dot cell.

### Dot Grid

```
Standard dot numbering:
  1  4
  2  5
  3  6
  7  8
```

### Virtual Pixel Resolution

Each character cell acts as a 2×4 block of virtual pixels. A grid of `W` columns × `H` rows of characters yields `W*2` × `H*4` virtual pixels — 2× horizontal and 4× vertical resolution over standard character-cell plots.

| Char grid | Virtual pixels | Capacity |
|-----------|---------------|----------|
| 10 × 10   | 20 × 40       | up to 800 points per cell |
| 20 × 8    | 40 × 32       |                       |
| 38 × 12   | 76 × 48       |                       |

Multiple data points can map to different dots within the same character cell, all rendered in a single Braille character via bit OR.

### Unicode Encoding

Per [Braille Patterns](https://en.wikipedia.org/wiki/Braille_Patterns), each dot maps to a hex bit in little-endian order. The code point is `U+2800` + sum of hex values of raised dots:

| Dot | Hex value | Character (example) |
|-----|-----------|---------------------|
| 1   | 0x01      | ⠁ DOTS-1 |
| 2   | 0x02      | ⠂ DOTS-2 |
| 3   | 0x04      | ⠃ DOTS-3 |
| 4   | 0x08      | ⠄ DOTS-4 |
| 5   | 0x10      | ⠅ DOTS-5 |
| 6   | 0x20      | ⠆ DOTS-6 |
| 7   | 0x40      | ⠇ DOTS-7 |
| 8   | 0x80      | ⠐ DOTS-8 |

Composite: `U+2800 + sum of dot hex values`. E.g., dots 1+2+5 → 0x01 + 0x02 + 0x10 = 0x13 → `U+2813` ⠓ BRAILLE PATTERN DOTS-125.

### Virtual Pixel to Dot Mapping

For chart purposes, virtual pixel coordinates within a cell map to Braille dots as follows (Y inverted: row 0 = top):

| virtX % 2 | virtY % 4 | Dot | Hex |
|-----------|-----------|-----|-----|
| 0 | 0 | 1 | 0x01 |
| 1 | 0 | 4 | 0x08 |
| 0 | 1 | 2 | 0x02 |
| 1 | 1 | 5 | 0x10 |
| 0 | 2 | 3 | 0x04 |
| 1 | 2 | 6 | 0x20 |
| 0 | 3 | 7 | 0x40 |
| 1 | 3 | 8 | 0x80 |

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

Each series holds its own array of points — no per-point series field needed:

```typescript
interface ChartPoint {
  x: number;    // position (tokens)
  y: number;    // speed (t/s)
}

interface ChartSeries {
  label: string;
  color: ThemeColor;
  points: ChartPoint[];
}
```

### Scaling

- **X**: `0` → `maxX` (auto from data), linear
- **Y**: `0` → `niceRound(maxY)` (auto from data), linear
- **Nice round**: 10, 20, 50, 100, 200, 500, 1000 (pick smallest ≥ maxY)
- **Log scale toggle**: Y uses `log10(y + 1)` mapping, ticks at 1, 10, 100, 1000

### Coordinate Conversion

Data coordinates → virtual pixel coordinates → Braille cell + dot hex (via lookup table above):

```
virtX = floor((point.x / maxX) * (gridWidth * 2 - 1))   // 0..W*2-1
virtY = floor((1 - point.y / maxY) * (gridHeight * 4 - 1)) // 0..H*4-1

charCol = floor(virtX / 2)                              // which character column
charRow = floor(virtY / 4)                              // which character row
dotHex = (1 << (virtY % 4)) * ((virtX % 2) ? 8 : 1)    // hex offset from table
```

Accumulate dot hex values per `(charCol, charRow)` cell (OR together), then render:
`char = String.fromCodePoint(0x2800 | accumulatedHex)`

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
      x: s.position, y: s.speed_tps
    }))
  },
  {
    label: "G",
    color: "cyan",
    points: samples.filter(s => s.phase === "generation").map(s => ({
      x: s.position, y: s.speed_tps
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
