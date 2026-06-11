# Table Widget Specification

## Overview

A general-purpose, scrollable table widget built on the existing `Control` base class. It provides columnar display with configurable columns, selection, scrolling, and optional custom rendering — designed to replace the hardcoded table logic in `TasksTab.ts`.

---

## File Structure

```
src/components/ui/widgets/Table.ts       — Table widget class
src/components/ui/widgets/index.ts       — Add Table export
```

---

## Type Definitions

### TableColumn

Defines a single column in the table.

```typescript
interface TableColumn {
  label: string;           // Header text
  width: number;           // Fixed width in characters
  flex?: number;           // If set, column expands to fill remaining space
  align?: "left" | "right";
  format?: (cellData: any, row: any) => string;  // Optional cell formatter
}
```

**Flex columns** expand to consume unused horizontal space. If multiple columns have `flex`, remaining space is distributed proportionally by their flex factor. A flex column always has a minimum width equal to its `width` property.

### TableItem

Represents a single row in the table.

```typescript
interface TableItem<T = any> {
  id: string | number;
  label: string;           // Primary display text (default renderer)
  sublabel?: string;       // Secondary text shown after label
  data?: T;                // Arbitrary payload (for custom renderer)
}
```

### TableRenderer

Custom row rendering callback signature (matches `List`'s `ItemRenderer`).

```typescript
type TableRenderer<T> = (
  canvas: FramebufferCanvas,
  item: TableItem<T>,
  index: number,
  isSelected: boolean,
  x: number,
  y: number,
  width: number
) => void;
```

---

## Public API

```typescript
class Table<T = any> extends Control {
  // Data
  columns: TableColumn[];
  items: TableItem<T>[];

  // Selection
  selectedIndex: number;
  setOnSelect(callback: (item: TableItem<T>) => void): void;
  setOnHighlight(callback: (item: TableItem<T> | null) => void): void;

  // Scrolling
  scrollOffset: number;
  contentHeight: number;

  // Rendering
  showHeader: boolean;
  headerHeight: number;          // default 1
  setRenderer(renderer: TableRenderer<T>): void;

  // Data updates
  updateItems(items: TableItem<T>[]): void;
  getSelectedItem(): TableItem<T> | null;
}
```

### Property Details

| Property | Type | Default | Description |
|---|---|---|---|
| `columns` | `TableColumn[]` | `[]` | Column definitions |
| `items` | `TableItem<T>[]` | `[]` | Row data |
| `selectedIndex` | `number` | `-1` | Currently selected row index |
| `scrollOffset` | `number` | `0` | Vertical scroll position (body only) |
| `contentHeight` | `number` | `0` | Total number of rows |
| `showHeader` | `boolean` | `true` | Whether to render the header row |
| `headerHeight` | `number` | `1` | Height of header in rows |
| `focusable` | `boolean` | `true` | Table can receive focus |

---

## Column Visibility Logic (Built-in)

The table computes visible columns at render time based on available width:

1. Calculate minimum width: sum of all `column.width` values + inter-column gaps
2. Hide non-flex columns from the right while `runningWidth > availableWidth`
3. Hide remaining flex columns from the right if still over budget
4. Distribute excess space to visible flex columns proportionally

### Example 1 — Wide terminal (120 chars)

```
Columns: [TIMESTAMP(10), ID(6), SLOT(4), PROFILE(10,flex), PP(10), TG(10), PROMPT(8), OUTPUT(8), TIME(8)]

Min width: 10+6+4+10+10+10+8+8+8 + 8 gaps = 82
Flex space: 120 - 82 = 38
PROFILE width: 10 + 38 = 48

All columns visible. PROFILE gets 48 chars.
```

### Example 2 — Narrow terminal (70 chars)

```
Min width: 82 → exceeds 70

Hide TIME (8): running = 74
Hide OUTPUT (8): running = 66
Hide PROMPT (8): running = 58 → fits

Visible columns: TIMESTAMP, ID, SLOT, PROFILE(flex), PP, TG
Flex space: 70 - 58 = 12
PROFILE width: 10 + 12 = 22
```

### Example 3 — Very narrow terminal (40 chars)

```
Min width: 82 → exceeds 40

Hide columns one by one from right until:
TIMESTAMP(10) + ID(6) + SLOT(4) = 20 + 2 gaps = 22 → fits

Visible columns: TIMESTAMP, ID, SLOT only
No flex columns visible.
```

---

## Scrolling Behavior

- `scrollOffset` applies only to body rows (not header)
- Header stays pinned at the top
- `contentHeight` represents the total number of rows
- Consumer must set `contentHeight = items.length`
- Scroll bounds are automatically clamped: `0 ≤ scrollOffset ≤ contentHeight - viewportHeight`

---

## Keyboard Navigation

| Key | Action |
|---|---|
| UP / k | Decrement `selectedIndex`, fire `onHighlight` |
| DOWN / j | Increment `selectedIndex`, fire `onHighlight` |
| PAGE_UP | Jump up one viewport |
| PAGE_DOWN | Jump down one viewport |
| HOME | Jump to first row (index 0) |
| END | Jump to last row |
| RETURN / ENTER | Fire `onSelect` with selected item |

---

## Rendering

### Header Row

Rendered once at the top (if `showHeader = true`). Shows visible column headers. A sort indicator (`▲` / `▼`) is appended to the header of the sorted column — this is purely visual, the table does not sort data internally.

### Body Rows

Each body row is rendered with `scrollOffset` applied:

**Default renderer** (like `List`):
```
fg(canvas, text, " label  sublabel")
fg(canvas, textMuted, " ".repeat(width - display.length))
```

**Custom renderer** (if `setRenderer()` was called):
```
renderer(canvas, item, index, isSelected, x, y, width)
```

### Selection Highlight

When `index === selectedIndex && this.focused`:
```
fgBg(canvas, bgHex, themeColors.accent, row)
```

Otherwise:
```
fg(canvas, themeColors.text, row)
fg(canvas, themeColors.textMuted, " ".repeat(width - row.length))
```

---

## Refactoring TasksTab

### What Moves to Table Widget

| From TasksTab | To Table |
|---|---|
| `renderHeaderRow()` | Table's internal header rendering |
| `clampSelection()` | Table's scroll bounds logic |
| `_scrollOffset`, `_selectedIndex` state | Table's `scrollOffset`, `selectedIndex` |
| UP/DOWN/PAGE_UP/PAGE_DOWN/HOME/END keys | Table's `handleKey()` |
| Row selection highlight logic | Table's render loop |
| Auto-select first row on focus | Table's `onFocus()` |

### What Stays in TasksTab

| Stays in TasksTab | Reason |
|---|---|
| Column definitions | Data-specific (field names, widths, flex) |
| `renderTaskRow()` | TaskMetrics-specific formatting |
| Filter logic (`_searchValue`, `_slotValue`) | Domain logic |
| Sort state (`_sortField`, `_sortDir`) | Consumer manages sort |
| Details panel rendering | Separate UI concern |
| Data mapping (TaskMetrics → TableItem) | Domain mapping |
| Stats bar rendering | Domain-specific |

### Example Usage (TasksTab after refactor)

```typescript
// In TasksControl constructor:
this._table = new Table();
this._table.showHeader = true;
this._table.headerHeight = 1;
this._table.setOnHighlight(() => this.markDirty());

// In onAttach / onTaskUpdate:
const columns = [
  { label: "TIMESTAMP", width: 10, align: "left" },
  { label: "ID", width: 6, align: "right" },
  { label: "SLOT", width: 4, align: "left" },
  { label: "PROFILE", width: 10, flex: 1, align: "left" },
  { label: "PP", width: 10, align: "right" },
  { label: "TG", width: 10, align: "right" },
  { label: "PROMPT", width: 8, align: "right" },
  { label: "OUTPUT", width: 8, align: "right" },
  { label: "TIME", width: 8, align: "right" },
];

this._table.columns = columns;
this._table.items = tasks.map(t => ({
  id: t.taskId,
  label: timeStr,
  sublabel: `#${t.taskId}`,
  data: t,
}));
this._table.selectedIndex = this._selectedIndex;
this._table.scrollOffset = this._scrollOffset;
this._table.contentHeight = tasks.length;
this._table.setRenderer(renderTaskRow);
```

---

## Tradeoffs

| Aspect | Decision | Rationale |
|---|---|---|
| Flex columns | `flex?: number` | PROFILE expands naturally; other tables can use it too |
| Column visibility | Built-in, hide right | Matches current behavior; no consumer boilerplate |
| Sorting | Consumer-controlled | Table stays presentational; sort state is domain-specific |
| Data model | Generic `TableItem<T>` | Follows `List` pattern; `data` field for any payload |
| Custom renderer | Optional callback | Default renderer works for simple lists; custom for complex tables |
| Scrolling | Built-in | Self-contained; no need to wrap in `Scrollable` |
| Details panel | NOT in table | Keeps table focused; compose in consumer with `Column` |
| Selection highlight | Visual only (no toggle) | Consistent with `List` — selection is navigational, not toggle-based |
