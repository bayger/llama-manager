# UI Framework

A lightweight, imperative terminal UI framework built on top of `terminal-kit`. Provides a Control-based component tree with flex layout, focus management, mouse handling, and dirty-flag incremental rendering.

## Core Concepts

### Control Tree

Every UI element inherits from `Control`. Controls form a tree via `add()`, `remove()`, and `clear()`. The framework manages:
- **Lifecycle**: `onInit()` (recurses children), `onDestroy()`/`destroy()` (teardown)
- **Layout**: `measure()` (child reports desired size) → `layout()` (parent assigns rect) → `onLayout()` (child positions its own children)
- **Rendering**: `render(ctx)` recurses the tree, clearing the control's rect with canvas bg, clipping to rect, skipping invisible or clean (`needsRender === false`) controls
- **Input**: `handleKey()` and `handleChar()` propagate to the focused descendant via `findFocusedDescendant()`
- **Mouse**: `hitTest()` finds the top-most control under a point; `onMouseDown()`/`onMouseUp()` handle clicks
- **Events**: Simple `on()`/`off()`/`emit()` — single handler per event, stored as `_on_<event>` properties. Calling `on(event)` auto-fires the handler immediately after registration

### Render Context

Each control receives rendering context via `render(ctx: RenderContext)`. The `RenderContext` provides a `FramebufferCanvas` for drawing, plus `scheduleRender()`, `showMessage()`, `getConfig()`, and `showCursor()`. There is no `this.term` — use `ctx.canvas` in render methods.

### Dirty Flags

Set `needsRender = true` via `markDirty()` to request a redraw. `markDirty()` propagates up to the parent. `markAllDirty()` marks every descendant. The base `render()` skips children that are invisible or already clean. The constructor auto-registers a `resize` event handler that calls `markDirty()`.

### Two-Pass Layout

1. **Measure**: Parent calls `child.measure(parentSize)` to learn desired dimensions.
2. **Layout**: Parent calls `child.layout(rect)` to assign position and size, triggering `child.onLayout()`.

Controls use `flex > 0` to claim proportional space in their axis. Fixed-size children report their intrinsic size from `measure()`.

### Mouse Handling

Call `hitTest(point)` on the root to find which control was clicked (checks children in reverse z-order). `onMouseDown(point)` and `onMouseUp(point)` hooks return `true` to consume the event. `FocusManager` also provides `handleMouseDown()` and `handleMouseUp()` for click-to-focus.

---

## Core Classes

### `Control` - Base class

| Property | Type | Default | Description |
|---|---|---|---|
| `rect` | `Rect` | `{0,0,0,0}` | Assigned position and size |
| `enabled` | `boolean` | `true` | Whether the control accepts input |
| `focused` | `boolean` | `false` | Whether this control currently has focus |
| `focusable` | `boolean` | `false` | Whether this control can receive focus |
| `tabIndex` | `number` | `0` | Reserved for ordering (not currently used) |
| `needsRender` | `boolean` | `true` | Dirty flag for incremental rendering |
| `flex` | `number` | `0` | Flex factor — `>0` claims proportional space |
| `visible` | `boolean` | `true` | Getter/setter; toggling calls `onShow()`/`onHide()` and marks dirty |
| `parent` | `Control \| null` | `null` | Readonly parent reference |

**Methods:**
- `add(child)`, `remove(child)`, `clear()` — child management (`remove`/`clear` auto-clear focus if focused control is removed)
- `measure(_parentSize?)` → `Size` — report desired size
- `layout(rect)` — assign rect, call `onLayout()`, mark dirty
- `render(ctx: RenderContext)` — recurse tree, clear bg, clip, skip invisible/clean
- `handleKey(key)`, `handleChar(char)` → `boolean` — input forwarding to focused descendant
- `findFocusedDescendant()` → `Control \| null` — find first enabled/visible/focused child recursively
- `focus()`, `blur()` — focus state with hooks
- `markDirty()` — set `needsRender`, propagate to parent
- `markAllDirty()` — recursively mark all descendants dirty
- `hitTest(point)` → `Control \| null` — find top-most control under point
- `getAllFocusable()` → `Control[]` — recursive list of enabled, visible, focusable descendants
- `fitContent(width, height)` → `Size` — clamp to terminal columns
- `isAncestorOf(control)` → `boolean` — check if control is a descendant
- `destroy()` — call `onDestroy()` on all descendants
- `on(event, callback)`, `off(event, callback)`, `emit(event, ...args)` — event system (single handler per event, `on()` auto-fires)

**Lifecycle hooks** (override in subclasses):
- `onInit()` — recurses children; override for initialization
- `onDestroy()` — recurses children; override for cleanup
- `onShow()` — called when `visible` changes to `true`
- `onHide()` — called when `visible` changes to `false`
- `onFocus()` — control gained focus
- `onBlur()` — control lost focus
- `onMouseDown(point)` → `boolean` — mouse click down
- `onMouseUp(point)` → `boolean` — mouse click up
- `onLayout()` — rect assigned; default implementation lays out all visible children to the same rect

### `Column` - Vertical flex layout

Stacks children top-to-bottom. No padding. Fixed-height children take intrinsic space; remaining height distributed among `flex > 0` children proportionally. Overrides `render()` to skip background clearing and clip to rect.

Set `child.flex = 1` (or higher) to fill remaining space.

### `Row` - Horizontal flex layout

Arranges children left-to-right with 1-cell gaps. Fixed-width children take intrinsic space; remaining width distributed among `flex > 0` children proportionally. Overrides `render()` to skip background clearing and clip to rect.

### `Group` - Overlapping container

All children share the same rect (overlaid). Measures to the max child size. Useful for layered rendering.

---

## Focus Management

`FocusManager` is a singleton (`focusManager`) that tracks the single focus point across the entire control tree.

**Setup:** Call `focusManager.setRoot(rootControl)` once at app startup.

**Navigation:**
- `Tab` / `Shift+Tab` — `nextFocus()` / `previousFocus()` — cycle through all focusable controls (wraps)
- `Up` / `k` and `Down` / `j` — `focusPrev()` / `focusNext()` — move within current scope (wraps, handled by individual widgets)
- `focusFirst()` — focuses the root control
- `focusLast()` — focuses last focusable or root if none
- `setFocus(control)` — programmatically set focus (auto-finds first focusable if control is not focusable)
- `clear()` — clear focus

**Text input mode:** Call `focusManager.activateTextInput(true)` when a `TextInput` is focused. Changes key handling so character input goes to the focused control's `handleChar()` instead of navigation.

**Mouse:** `handleMouseDown(point)` and `handleMouseUp(point)` focus the control under the cursor.

**Key handling:** Call `focusManager.handleKey(key)` in your main input loop. Manages Tab navigation, vim-style movement (`k`/`j`), and text input delegation.

---

## Widgets

### `Label`

Static text display. Non-focusable. Shows `> ` prefix when focused.

| Property | Type | Default |
|---|---|---|
| `text` | `string` | `""` |
| `color` | `string` | `themeColors.text` |
| `bold` | `boolean` | `false` |
| `padding` | `number` | `0` |
| `align` | `"left" \| "center"` | `"left"` |

All properties are getters/setters that call `markDirty()` on change.

Measures to `text.length + padding * 2` × 1. Calls `super.render()` for bg clear.

### `Button`

Clickable button with `[ label ]` styling. Focusable. Supports keyboard and mouse activation.

| Property | Type | Default |
|---|---|---|
| `label` | `string` | `""` |
| `disabled` | `boolean` | getter/setter aliasing `enabled` (getter returns `!this.enabled`) |

Constructor accepts `ButtonConfig`: `{ label, disabled?, action? }`. Or call `setAction(fn)` after creation.

Activates on `Enter`, `Return`, or `Space`. Supports `Up`/`k` and `Down`/`j` for navigating sibling buttons. Mouse: `onMouseDown` sets pressed state, `onMouseUp` fires action if still pressed. When disabled while focused, automatically shifts focus to the next enabled sibling.

Styling: muted text normally, bold inverted colors when focused, border-muted when disabled.

### `TextInput`

Single-line text input with full editing support. Focusable. Renders with `│` border characters. Supports mouse click to position cursor.

| Property | Type | Default |
|---|---|---|
| `value` | `string` | `""` |
| `placeholder` | `string` | `""` |
| `cursorPos` | `number` | `0` |
| `prefix` | `string` | `""` |

All properties are protected with dirty-tracking getters/setters.

**Callbacks:**
- `setOnSubmit(fn)` — called on `Enter`/`Return` with current value
- `setOnCancel(fn)` — called on `Esc`/`Escape`/`Ctrl+C`
- `setOnChange(fn)` — called on each edit

**Key bindings:** `Left`/`Right` (cursor), `Backspace`/`Ctrl+H`/`Del` (delete), `Ctrl+A`/`Home` (start), `Ctrl+E`/`End` (end), `Ctrl+W` (delete word), `Tab` passes through.

On focus: activates text input mode, moves cursor to end. On blur: deactivates text input mode. `onMouseDown` positions cursor at click location.

### `List<T>`

Selectable item list. Focusable. Supports mouse click to select rows.

| Property | Type | Default |
|---|---|---|
| `items` | `ListItem<T>[]` | `[]` |
| `selectedIndex` | `number` | `-1` |
| `itemHeight` | `number` | `1` |

`ListItem<T>`: `{ id: T, label: string, sublabel?: string, data?: any }`

**Callbacks:**
- `setOnSelect(fn)` — called on `Enter`/`Return`/`Space` with selected item
- `setOnHighlight(fn)` — called on arrow navigation with highlighted item (or `null`)
- `setRenderer(renderer)` — custom `ItemRenderer<T>` for full control over item rendering

**Methods:**
- `updateItems(items)` — replace items, clamp selection index
- `getSelectedItem()` → `ListItem<T> \| null`

**Navigation:** `Up`/`k`, `Down`/`j` to move selection. Auto-selects first item on focus. `onMouseDown` selects row under cursor.

Default renderer: ` label` with optional `  sublabel`. Selected items get bold, inverted colors.

### `Scrollable`

Scroll container with managed `scrollOffset`. Non-focusable (inherits `false`). Subclass or add children and manage their `rect.y` offset based on `this.scrollOffset`. `onLayout` clamps `scrollOffset` and sets `_viewportHeight`.

| Property | Type | Default |
|---|---|---|
| `scrollOffset` | `number` | `0` |
| `contentHeight` | `number` | `0` |

**Methods:**
- `setScrollOffset(offset)` — clamped set, marks dirty
- `setContentHeight(h)` — update total scrollable height, clamps offset, marks dirty
- `canScrollUp()`, `canScrollDown()` → `boolean`

**Key bindings:** `Up`/`Down` (line scroll), `PageUp`/`PageDown` (page scroll), `Home`/`End` (jump).

### `Box`

Draws a single-cell border (Unicode box-drawing chars) around its first child. Non-focusable. Offsets child by 1 cell on all sides. Renders title in accent color. Early returns if width < 4 or height < 3.

| Property | Type | Default |
|---|---|---|
| `borderColor` | `string` | `themeColors.border` |
| `title` | `string` | `""` |

Only supports one child. Measures to child size + 2 on each axis, or falls back to `rect.width || 20` × `rect.height || 4`.

### `Spacer`

Fills remaining space with erased lines. Non-focusable. Use with `flex > 0` in a `Column` or `Row` to push subsequent children to the edge.

### `ProgressBar`

Animated progress bar with spinner. Non-focusable. Spinner uses `Date.now() / 100` frame timing.

| Property | Type | Default |
|---|---|---|
| `progress` | `number` | `0` (0–100) |
| `label` | `string` | `""` |
| `extraLabel` | `string` | `""` |
| `filledColor` | `string` | `themeColors.accent` |
| `emptyColor` | `string` | `themeColors.border` |
| `labelColor` | `string` | `themeColors.warning` |

All properties are protected with dirty-tracking getters/setters.

Renders a 2-row widget: row 1 has spinner + label + percentage + extraLabel; row 2 has filled (`▓`) and empty (`░`) bar.

### `HelpBar`

Bottom status/help bar. Non-focusable.

| Property | Type | Default |
|---|---|---|
| `text` | `string` | `""` |
| `prefix` | `string` | `""` |
| `prefixColor` | `string` | `themeColors.success` |

Renders 2 rows. Prefix on row 1. Centered text on row 2 with prefix appended.

### `HalfBar`

Horizontal half-block bar. Non-focusable. Renders half-block characters (`▄`) with top/bottom color split.

| Property | Type | Default |
|---|---|---|
| `mode` | `'top' \| 'bottom'` | `'top'` |

Measures to `rect.width || 80` × 1.

### `Table<T>`

Scrollable, selectable table with column headers. Focusable. Supports mouse click to select rows. Combines `List`-like selection with `Scrollable`-like scrolling.

| Property | Type | Default |
|---|---|---|
| `columns` | `TableColumn[]` | `[]` |
| `items` | `TableItem<T>[]` | `[]` |
| `selectedIndex` | `number` | `-1` |
| `scrollOffset` | `number` | `0` |
| `contentHeight` | `number` | `0` |
| `showHeader` | `boolean` | `true` |
| `headerHeight` | `number` | `2` |

`TableColumn`: `{ label, width, flex?, align?, headerSuffix?, format? }`
`TableItem<T>`: `{ id: string \| number, label: string, sublabel?: string, data?: T }`

**Callbacks:**
- `setOnSelect(fn)` — called on `Enter` with selected item
- `setOnHighlight(fn)` — called on navigation with highlighted item (or `null`)
- `setRenderer(renderer)` — custom `TableRenderer<T>` with column info

**Methods:**
- `updateItems(items)` — replace items, update content height, clamp selection/scroll
- `getSelectedItem()` → `TableItem<T> \| null`

**Navigation:** Full scroll support — `Up`/`Down`, `PageUp`/`PageDown`, `Home`/`End`, `Enter` to select. Auto-selects first item on focus. `onMouseDown` selects row accounting for header offset. `onLayout` clamps scroll.

Features responsive column hiding when width is insufficient.

---

## Types

```typescript
interface Rect { x: number; y: number; width: number; height: number; }
interface Size { width: number; height: number; }
interface Point { x: number; y: number; }

interface RenderContext {
  canvas: FramebufferCanvas;
  scheduleRender(): void;
  showMessage(msg: string): void;
  getConfig(): any | null;
  showCursor(): void;
}

type ControlCallback = (value: any) => void;

interface EventEmitter {
  on(event: string, callback: (...args: any[]) => void): void;
  off(event: string, callback: (...args: any[]) => void): void;
  emit(event: string, ...args: any[]): void;
}
```

---

## Creating a Custom Control

```typescript
import { Control } from "./ui/Control";
import type { Size, RenderContext } from "./ui/types";

class MyWidget extends Control {
  public text = "hello";

  measure(_parentSize?: Size): Size {
    return { width: this.text.length, height: 1 };
  }

  render(ctx: RenderContext): void {
    if (!this.visible || !this.needsRender) return;
    const { canvas } = ctx;
    canvas.moveTo(this.rect.x, this.rect.y);
    canvas.write(this.text);
    this.needsRender = false;
  }

  handleKey(key: string): boolean {
    if (key === "ENTER") {
      // do something
      return true;
    }
    return false;
  }
}
```

Key rules:
1. Always guard `render()` with `!this.visible || !this.needsRender`, clear `needsRender` at the end
2. Implement `measure()` to return intrinsic size
3. Use `ctx.canvas` and `this.rect` for rendering — never hardcode positions
4. Return `true` from `handleKey`/`handleChar`/`onMouseDown`/`onMouseUp` when the event was consumed
5. Call `markDirty()` whenever state changes that affects rendering

## Typical App Structure

```
Column (root, flex layout)
├── Row (status bar)
│   ├── Label
│   └── Spacer (flex=1)
├── Row (main content)
│   ├── Column (sidebar)
│   │   ├── List
│   │   └── Button
│   └── Box (flex=1, detail panel)
│       └── Scrollable
└── HelpBar
```

Set `focusManager.setRoot(rootColumn)` and route all key events through `focusManager.handleKey(key)`. Route mouse events through `root.hitTest(point)` and `focusManager.handleMouseDown(point)`.
