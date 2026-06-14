# UI Framework

A lightweight, imperative terminal UI framework built on top of `terminal-kit`. Provides a Control-based component tree with flex layout, focus management, and dirty-flag incremental rendering.

## Core Concepts

### Control Tree

Every UI element inherits from `Control`. Controls form a tree via `add()`, `remove()`, and `clear()`. The framework manages:
- **Lifecycle**: `attach()` → `onAttach()`, `detach()` → `onDetach()`
- **Layout**: `measure()` (child reports desired size) → `layout()` (parent assigns rect) → `onLayout()` (child positions its own children)
- **Rendering**: `render()` recurses the tree, skipping invisible or clean (`needsRender === false`) controls
- **Input**: `handleKey()` and `handleChar()` propagate to the focused descendant
- **Events**: Simple `on()`/`off()`/`emit()` - single handler per event, stored as `_on_<event>` properties

### Render Context

Each control accesses the terminal via `this.term` (shorthand for `this.renderContext.term`). The `RenderContext` interface also provides `scheduleRender()`, `showMessage()`, and `getConfig()`. Attach the root control with `root.attach(ctx)` to propagate context to all descendants.

### Dirty Flags

Set `needsRender = true` via `markDirty()` to request a redraw. `markDirty()` propagates to the parent. The base `render()` skips children that are invisible or already clean. Resize events auto-mark the root dirty.

### Two-Pass Layout

1. **Measure**: Parent calls `child.measure(parentSize)` to learn desired dimensions.
2. **Layout**: Parent calls `child.layout(rect)` to assign position and size, triggering `child.onLayout()`.

Controls use `flex > 0` to claim proportional space in their axis. Fixed-size children report their intrinsic size from `measure()`.

---

## Core Classes

### `Control` - Base class

| Property | Type | Default | Description |
|---|---|---|---|
| `rect` | `Rect` | `{0,0,0,0}` | Assigned position and size |
| `enabled` | `bool` | `true` | Whether the control accepts input |
| `visible` | `bool` | `true` | Whether the control renders |
| `focused` | `bool` | `false` | Whether this control currently has focus |
| `focusable` | `bool` | `true` | Whether this control can receive focus |
| `tabIndex` | `number` | `0` | Reserved for ordering (not currently used) |
| `needsRender` | `bool` | `true` | Dirty flag for incremental rendering |
| `flex` | `number` | `0` | Flex factor - `>0` claims proportional space |
| `minWidth` | `number` | `0` | Minimum width constraint |
| `minHeight` | `number` | `0` | Minimum height constraint |

**Methods:**
- `add(child)`, `remove(child)`, `clear()` - child management
- `attach(ctx)`, `detach()` - lifecycle
- `measure(parentSize?)` → `Size` - report desired size
- `layout(rect)` - assign rect, call `onLayout()`
- `render()` - recurse tree, skip invisible/clean
- `handleKey(key)`, `handleChar(char)` → `bool` - input forwarding to focused descendant
- `focus()`, `blur()` - focus state with hooks
- `markDirty()` - set `needsRender`, propagate to parent
- `getAllFocusable()` → `Control[]` - recursive list of enabled, visible, focusable descendants
- `on(event, callback)`, `off(event, callback)`, `emit(event, ...args)` - event system

**Lifecycle hooks** (override in subclasses):
- `onAttach()` - control attached to render context
- `onDetach()` - control detached
- `onFocus()` - control gained focus
- `onBlur()` - control lost focus
- `onLayout()` - rect assigned; default implementation lays out all visible children

### `Column` - Vertical flex layout

Stacks children top-to-bottom. Applies 1-cell horizontal padding. Fixed-height children take intrinsic space; remaining height distributed among `flex > 0` children proportionally.

Set `child.flex = 1` (or higher) to fill remaining space.

### `Row` - Horizontal flex layout

Arranges children left-to-right with 1-cell gaps. Fixed-width children take intrinsic space; remaining width distributed among `flex > 0` children proportionally.

### `Group` - Overlapping container

All children share the same rect (overlaid). Measures to the max child size. Useful for layered rendering.

---

## Focus Management

`FocusManager` is a singleton (`focusManager`) that tracks the single focus point across the entire control tree.

**Setup:** Call `focusManager.setRoot(rootControl)` once at app startup.

**Navigation:**
- `Tab` / `Shift+Tab` - `nextFocus()` / `previousFocus()` - cycle through all focusable controls in the tree
- `Up` / `k` and `Down` / `j` - `focusPrev()` / `focusNext()` - move within current scope (no wrap)
- `setFocus(control)` - programmatically set focus

**Text input mode:** Call `focusManager.activateTextInput(true)` when a `TextInput` is focused. This changes key handling so that character input goes to the focused control's `handleChar()` instead of navigation.

**Key handling:** Call `focusManager.handleKey(key)` in your main input loop. It manages Tab navigation, vim-style movement, and text input delegation.

---

## Widgets

### `Label`

Static text display. Non-focusable.

| Property | Type | Default |
|---|---|---|
| `text` | `string` | `""` |
| `color` | `string` | `themeColors.text` |
| `bold` | `bool` | `false` |
| `padding` | `number` | `0` |
| `align` | `"left" \| "center"` | `"left"` |

Measures to `text.length + padding * 2` × 1.

### `Button`

Clickable button with `[ label ]` styling. Focusable.

| Property | Type | Default |
|---|---|---|
| `label` | `string` | `""` |
| `disabled` | `bool` | `false` |

Constructor accepts `{ label, disabled?, action? }`. Or call `setAction(fn)` after creation.

Activates on `Enter`, `Return`, or `Space`. Supports `Up`/`k` and `Down`/`j` for navigating sibling buttons. When disabled while focused, automatically shifts focus to the next enabled sibling.

Styling: muted text normally, bold success color when focused, border-muted when disabled.

### `TextInput`

Single-line text input with full editing support. Focusable.

| Property | Type | Default |
|---|---|---|
| `value` | `string` | `""` |
| `placeholder` | `string` | `""` |
| `cursorPos` | `number` | `0` |
| `prefix` | `string` | `""` |

**Callbacks:**
- `setOnSubmit(fn)` - called on `Enter`/`Return` with current value
- `setOnCancel(fn)` - called on `Esc`/`Ctrl+C`
- `setOnChange(fn)` - called on each edit

**Key bindings:** `Left`/`Right` (cursor), `Backspace`/`Del` (delete), `Ctrl+A`/`Home` (start), `Ctrl+E`/`End` (end), `Ctrl+W` (delete word), `Esc`/`Ctrl+C` (cancel).

Shows/hides cursor on focus/blur via ANSI escapes.

### `List<T>`

Selectable item list. Focusable.

| Property | Type | Default |
|---|---|---|
| `items` | `ListItem<T>[]` | `[]` |
| `selectedIndex` | `number` | `-1` |
| `itemHeight` | `number` | `1` |

`ListItem<T>`: `{ id: T, label: string, sublabel?: string, data?: any }`

**Callbacks:**
- `setOnSelect(fn)` - called on `Enter`/`Return`/`Space` with selected item
- `setOnHighlight(fn)` - called on arrow navigation with highlighted item (or `null`)
- `setRenderer(renderer)` - custom `ItemRenderer<T>` for full control over item rendering

**Navigation:** `Up`/`k`, `Down`/`j` to move selection. Auto-selects first item on focus.

Default renderer: ` label` with optional `  sublabel`. Selected items get bold, inverted colors.

### `Scrollable`

Scroll container with managed `scrollOffset`. Focusable. Subclass or add children and manage their `rect.y` offset based on `this.scrollOffset`.

| Property | Type | Default |
|---|---|---|
| `scrollOffset` | `number` | `0` |
| `contentHeight` | `number` | `0` |

**Methods:**
- `setScrollOffset(offset)` - clamped set
- `setContentHeight(h)` - update total scrollable height
- `canScrollUp()`, `canScrollDown()` → `bool`

**Key bindings:** `Up`/`Down` (line scroll), `PageUp`/`PageDown` (page scroll), `Home`/`End` (jump).

### `Box`

Draws a single-cell border (Unicode box-drawing chars) around its first child. Non-focusable. Offsets child by 1 cell on all sides.

| Property | Type | Default |
|---|---|---|
| `borderColor` | `string` | `themeColors.border` |
| `title` | `string` | `""` |

Only supports one child. Measures to child size + 2 on each axis.

### `Divider`

Horizontal rule. Non-focusable.

| Property | Type | Default |
|---|---|---|
| `char` | `string` | `─` (`\u2500`) |
| `color` | `string` | `themeColors.border` |

### `Spacer`

Fills remaining space with erased lines. Non-focusable. Use with `flex > 0` in a `Column` or `Row` to push subsequent children to the edge.

### `ProgressBar`

Animated progress bar with spinner. Non-focusable.

| Property | Type | Default |
|---|---|---|
| `progress` | `number` | `0` (0–100) |
| `label` | `string` | `""` |
| `extraLabel` | `string` | `""` |
| `filledColor` | `string` | `themeColors.accent` |
| `emptyColor` | `string` | `themeColors.border` |
| `labelColor` | `string` | `themeColors.warning` |

Renders a 2-row widget: label + spinner on row 1, filled (`▓`) and empty (`░`) bar on row 2.

### `HelpBar`

Bottom status/help bar. Non-focusable.

| Property | Type | Default |
|---|---|---|
| `text` | `string` | `""` |
| `prefix` | `string` | `""` |
| `prefixColor` | `string` | `themeColors.success` |

Renders 2 rows, centering the text on row 2.

---

## Types

```typescript
interface Rect { x: number; y: number; width: number; height: number; }
interface Size { width: number; height: number; }

interface RenderContext {
  term: Terminal;
  scheduleRender(): void;
  showMessage(msg: string): void;
  getConfig(): any | null;
}
```

---

## Creating a Custom Control

```typescript
import { Control } from "./ui/Control.js";
import type { Size } from "./ui/types.js";

class MyWidget extends Control {
  public text = "hello";

  measure(_parentSize?: Size): Size {
    return { width: this.text.length, height: 1 };
  }

  render(): void {
    if (!this.visible || !this.needsRender) return;
    const { term, rect } = this;
    term.moveTo(rect.x, rect.y);
    term(this.text);
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
1. Always call `super.render()`-equivalent logic: guard with `!this.visible || !this.needsRender`, clear `needsRender` at the end
2. Implement `measure()` to return intrinsic size
3. Use `this.term` and `this.rect` for rendering - never hardcode positions
4. Return `true` from `handleKey`/`handleChar` when the key was consumed

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

Set `focusManager.setRoot(rootColumn)` and route all key events through `focusManager.handleKey(key)`.
