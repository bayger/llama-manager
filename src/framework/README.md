# UI Framework

A lightweight, imperative terminal UI framework. Provides a Control-based component tree with flex layout, focus management, mouse handling, modal stacking, and dirty-flag incremental rendering. Rendering uses a double-buffered `FramebufferCanvas` — `terminal-kit` is only used for input handling.

## Quick Start

```typescript
import terminalKit from "terminal-kit";
import { Application, Control, Column, Row, focusManager } from "./framework";
import { Label, Button, TextInput, List, Spacer, StyledText, ProgressBar, Table, BarChart, Section, Modal } from "./framework/widgets";

class MyApp extends Application {
  // Override handleKey for app-level shortcuts, or use the options callback
}

const root = new Column();
root.add(/* ... */);

const app = new Application({
  term: terminalKit.terminal,
  root,
  handleAppKey: (key) => {
    if (key === "q") { /* quit */ return true; }
    return false;
  },
  onQuit: async () => { /* cleanup */ },
});

term.fullscreen(true);
term.grabInput({ mouse: "drag" });
term.hideCursor();
app.start();
```

## Core Concepts

### Control Tree

Every UI element inherits from `Control`. Controls form a tree via `add()`, `remove()`, and `clear()`. The framework manages:
- **Lifecycle**: `onInit()` (recurses children), `onDestroy()`/`destroy()` (teardown)
- **Layout**: `measure()` (child reports desired size) → `layout()` (parent assigns rect) → `onLayout()` (child positions its own children)
- **Rendering**: `render(ctx)` recurses the tree, clearing the control's rect with canvas bg, clipping to rect, skipping invisible or clean (`needsRender === false`) controls. Subclasses override `draw()` for custom content.
- **Input**: `handleKey()` and `handleChar()` propagate to the focused descendant via `findFocusedDescendant()`
- **Mouse**: `hitTest()` finds the top-most control under a point; `onMouseDown()`/`onMouseUp()` handle clicks; `onMouseWheel()` handles scroll
- **Events**: Multi-listener `on()`/`off()`/`emit()` — multiple handlers per event, stored in a `Map`. `on()` returns the bound handler for later removal via `off()`.

### Render Context

Each control receives rendering context via `render(ctx: RenderContext)`. The `RenderContext` provides a `FramebufferCanvas` for drawing, plus `scheduleRender()`, `showMessage()`, and `showCursor()`. There is no `this.term` — use `ctx.canvas` in render methods.

### Dirty Flags

Set `needsRender = true` via `markDirty()` to request a redraw. `markDirty()` propagates up to the parent. `markAllDirty()` marks every descendant. The base `render()` skips children that are invisible or already clean. The constructor auto-registers a `resize` event handler that calls `markDirty()`.

### Two-Pass Layout

1. **Measure**: Parent calls `child.measure(parentSize)` to learn desired dimensions.
2. **Layout**: Parent calls `child.layout(rect)` to assign position and size, triggering `child.onLayout()`.

Controls use `flex > 0` to claim proportional space in their axis. Fixed-size children report their intrinsic size from `measure()`.

### Mouse Handling

Call `hitTest(point)` on the root to find which control was clicked (checks children in reverse z-order). `onMouseDown(point)` and `onMouseUp(point)` hooks return `true` to consume the event. `onMouseWheel(point, direction)` propagates up the parent chain. `FocusManager` also provides `handleMouseDown()`, `handleMouseUp()`, and `handleMouseWheel()` for click-to-focus and scroll delegation.

---

## Core Classes

### `Application` - App lifecycle manager

Manages the render loop, input/mouse handling, resize, cursor visibility, and modal rendering. Subclass or use the options object to customize behavior.

| Option | Type | Description |
|---|---|---|
| `term` | `Terminal` | terminal-kit terminal instance (required) |
| `root` | `Control` | root control of the UI tree (required) |
| `handleAppKey` | `(key: string) => boolean` | app-level key handler; called before modal/focus routing |
| `renderOverlay` | `(canvas, w, h) => boolean` | optional overlay renderer; return `true` to block normal rendering |
| `onQuit` | `() => void \| Promise<void>` | called on app quit |

**Methods:**
- `start()` — set up focus, input, resize, and render loop
- `getCanvas()` → `FramebufferCanvas` — access the canvas for external drawing
- `markDirty()` — mark root dirty
- `markAllDirty()` — mark entire tree dirty
- `setTextInputFocused(focused)` — toggle text input mode on FocusManager
- `dispose()` — clean up intervals, handlers, focus, and call `onDestroy()` on root

**Render loop:** Runs at ~60fps via `setInterval`. Skips frames when neither root nor modal manager need rendering. Uses double-buffered framebuffer with diff-based terminal output. Automatically manages cursor visibility.

**Key routing:** `handleAppKey` → `modalManager.handleKey()` → `focusManager.handleKey()`.

**Mouse routing:** wheel → `focusManager.handleMouseWheel()`; if modal open → `modalManager`; otherwise → `focusManager`.

### `Control` - Base class

| Property | Type | Default | Description |
|---|---|---|---|
| `rect` | `Rect` | `{0,0,0,0}` | Assigned position and size |
| `enabled` | `boolean` | `true` | Whether the control accepts input |
| `focused` | `boolean` | `false` | Whether this control currently has focus |
| `focusable` | `boolean` | `false` | Whether this control can receive focus |
| `needsRender` | `boolean` | `true` | Dirty flag for incremental rendering |
| `flex` | `number` | `0` | Flex factor — `>0` claims proportional space |
| `foregroundColor` | `Color` | `"None"` | Foreground color for bg clear |
| `backgroundColor` | `Color` | `"None"` | Background color for bg clear |
| `visible` | `boolean` | `true` | Getter/setter; toggling calls `onShow()`/`onHide()` and marks dirty |
| `parent` | `Control \| null` | `null` | Readonly parent reference |

**Methods:**
- `add(child)`, `remove(child)`, `clear()` — child management (`remove`/`clear` auto-clear focus if focused control is removed)
- `measure(_parentSize?)` → `Size` — report desired size
- `layout(rect)` — assign rect, call `onLayout()`, mark dirty
- `render(ctx: RenderContext)` — recurse tree, clear bg, clip, call `draw()`, render children, skip invisible
- `draw(ctx: RenderContext)` — override for custom content (called by `render`, after bg clear)
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
- `on(event, callback)` → `handler` — add event listener (returns bound handler)
- `off(event, handler?)` — remove listener (or all if no handler)
- `emit(event, ...args)` — fire event

**Lifecycle hooks** (override in subclasses):
- `onInit()` — recurses children; override for initialization
- `onDestroy()` — recurses children; override for cleanup
- `onShow()` — called when `visible` changes to `true`
- `onHide()` — called when `visible` changes to `false`
- `onFocus()` — control gained focus
- `onBlur()` — control lost focus
- `onMouseDown(point)` → `boolean` — mouse click down
- `onMouseUp(point)` → `boolean` — mouse click up
- `onMouseWheel(point, direction)` → `boolean` — mouse wheel scroll
- `onLayout()` — rect assigned; default implementation lays out all visible children to the same rect
- `draw(ctx)` — custom rendering (called by `render` after bg clear, before children)

### `Column` - Vertical flex layout

Stacks children top-to-bottom. No padding. Fixed-height children take intrinsic space; remaining height distributed among `flex > 0` children proportionally.

Set `child.flex = 1` (or higher) to fill remaining space.

### `Row` - Horizontal flex layout

Arranges children left-to-right with 1-cell gaps. Fixed-width children take intrinsic space; remaining width distributed among `flex > 0` children proportionally.

### `ModalManager` - Modal stack

Singleton (`modalManager`) that manages a stack of `Modal` controls. Handles dimming, centering, shadow, focus routing, and key/mouse handling for the top modal.

**Methods:**
- `open(modal)` — push modal onto stack, transfer focus root
- `close()` — pop modal, restore previous focus root
- `isOpen()` → `boolean`
- `getTop()` → `Modal \| null`
- `stackSize` → `number`
- `markDirty()` — mark modals for redraw
- `needsRender` → `boolean` — dirty flag (checks both manager and top modal)
- `handleKey(key)` → `boolean` — route key to top modal (handles Tab/Shift+Tab, text input, and key forwarding)
- `handleMouseDown(point)`, `handleMouseUp(point)` → `boolean` — route mouse to top modal
- `render(canvas)` — dim background, render stacked modals with shadows
- `setOnDirty(callback)` — callback fired on close

### `FocusManager` - Focus singleton

Singleton (`focusManager`) that tracks the single focus point across the entire control tree.

**Setup:** Call `focusManager.setRoot(rootControl)` once at app startup (or via `Application`).

**Navigation:**
- `Tab` / `Shift+Tab` — `nextFocus()` / `previousFocus()` — cycle through all focusable controls (wraps)
- `Up` / `k` and `Down` / `j` — `focusPrev()` / `focusNext()` — move within current scope (wraps, handled by individual widgets)
- `focusFirst()` — focuses the root control
- `focusLast()` — focuses last focusable or root if none
- `setFocus(control)` — programmatically set focus (auto-finds first focusable if control is not focusable)
- `clear()` — clear focus
- `getRoot()` → `Control \| null`
- `getFocused()` → `Control \| null`
- `isTextInputActive()` → `boolean`

**Text input mode:** Call `focusManager.activateTextInput(true)` when a `TextInput` is focused. Changes key handling so character input goes to the focused control's `handleChar()` instead of navigation.

**Mouse:** `handleMouseDown(point)`, `handleMouseUp(point)`, `handleMouseWheel(point, direction)` — focus and dispatch to control under cursor. Wheel propagates up parent chain.

**Key handling:** Call `focusManager.handleKey(key)` in your main input loop. Manages Tab navigation, text input delegation.

---

## Widgets

### `Label`

Static text display. Non-focusable.

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

Clickable button with ` label ` styling. Focusable. Supports keyboard and mouse activation.

| Property | Type | Default |
|---|---|---|
| `label` | `string` | `""` |
| `disabled` | `boolean` | getter/setter aliasing `enabled` (getter returns `!this.enabled`) |

Constructor accepts `ButtonConfig`: `{ label, disabled?, action? }`. Or call `setAction(fn)` after creation.

Activates on `Enter`, `Return`, or `Space`. Supports `Up`/`k` and `Down`/`j` for navigating sibling buttons. Mouse: `onMouseDown` sets pressed state, `onMouseUp` fires action if still pressed. When disabled while focused, automatically shifts focus to the next enabled sibling.

Styling: muted text on subtle bg normally, bold inverted colors when focused, border-muted when disabled.

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

### `Checkbox`

Toggle checkbox with `☐ label` / `☑ label` styling. Focusable. Supports keyboard and mouse activation.

| Property | Type | Default |
|---|---|---|
| `label` | `string` | `""` |
| `checked` | `boolean` | `false` |
| `disabled` | `boolean` | getter/setter aliasing `enabled` |

Constructor accepts `CheckboxConfig`: `{ label, checked?, disabled?, action? }`. Or call `setAction(fn)` after creation.

Toggles on `Enter`, `Return`, or `Space`. Supports `Up`/`k` and `Down`/`j` for navigation. Mouse: `onMouseDown`/`onMouseUp` toggles if released inside rect.

Styling: muted text normally, bold inverted when focused, border-muted when disabled.

### `StyledText`

Multi-color single-line text with a fluent builder API. Non-focusable. Supports truncation.

| Property | Type | Default |
|---|---|---|
| `segments` | `TextSegment[]` | `[]` |
| `truncate` | `"tail" \| "head" \| false` | `"tail"` |

`TextSegment`: `{ text: string, color: Color }`

**Builder API** (access via `widget.builder`):
- `.text(str)`, `.muted(str)`, `.accent(str)`, `.accentColor(str)`, `.success(str)`, `.warning(str)`, `.danger(str)`, `.info(str)` — each resets previous segments and commits a single colored segment
- Chainable: returns `this`

Measures to total segment text length × 1. Truncates with `…` when exceeding `rect.width`.

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

### `HalfBar`

Horizontal half-block bar. Non-focusable. Renders half-block characters (`▄`) with top/bottom color split.

| Property | Type | Default |
|---|---|---|
| `mode` | `'top' \| 'bottom'` | `'top'` |

Measures to `rect.width || 80` × 1.

### `BarChart`

High-density bar chart using Braille characters (2 bars × 4 rows per cell). Non-focusable. Supports horizontal scrolling, Y-axis labels, X-axis labels, and configurable scaling.

| Property | Type | Default |
|---|---|---|
| `data` | `number[]` | `[]` |
| `labels` | `string[]` | `[]` |
| `title` | `string` | `""` |
| `mode` | `"bottom-up" \| "top-down"` | `"bottom-up"` |
| `scale` | `"auto" \| "auto-zero" \| "fixed"` | `"auto-zero"` |
| `yMin` | `number` | `0` |
| `yMax` | `number` | `100` |
| `color` | `Color` | `"accent"` |
| `showYAxis` | `boolean` | `true` |
| `showXAxis` | `boolean` | `true` |
| `showBaseline` | `boolean` | `true` |
| `yTickCount` | `number` | `5` |

**Methods:**
- `setData(data, labels?)` — set data and optional labels, resets scroll

**Navigation:** `Left`/`Right` (scroll 1), `PageUp`/`PageDown` (scroll page), `Home`/`End` (jump).

Uses Braille dot positions for 8-level vertical resolution per row (4 rows × 2 bars per cell). Auto-computes Y-axis scale with 5% top padding. Y-axis tick labels use compact formatting (`1.5k`, `2M`).

### `Section`

Styled section header with half-block top bar, accent title, and left border. Non-focusable. Lays out children below the header with flex support.

| Property | Type | Default |
|---|---|---|
| `title` | `string` | `""` |
| `backgroundColor` | `Color` | `"canvasSubtle"` |

Reserves 4 rows for header (half-block, title, spacing, then content). Children are offset by 2 cells left, 3 rows down. Measures children with flex/fixed height distribution.

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

### `Modal`

Base modal dialog with title bar, half-block top bar, left border, and content area. Focusable. Auto-focuses first focusable child on focus.

| Property | Type | Default |
|---|---|---|
| `title` | `string` | `""` |

**Methods:**
- `setOnClose(callback)` — called on `close()`
- `setMinSize(minWidth, minHeight)` — clamp minimum dimensions
- `setMaxSize(maxWidth, maxHeight)` — clamp maximum dimensions
- `close()` — fire onClose callback

Reserves 4 rows for chrome (half-block, title, spacing row, content, bottom padding, bottom border). Children are offset by 2 cells left/right, 3 rows down. `onMouseDown`/`onMouseUp` consume clicks inside the modal rect.

### `ConfirmDialog`

Yes/No confirmation dialog. Extends `Modal`.

| Property | Type |
|---|---|
| `message` | `string` |

**Methods:**
- `setResolve(fn)` — set promise resolve callback
- `closeWithResult(boolean)` — resolve and close modal

Factory: `createConfirmDialog(title, message)`

### `DownloadDialog`

Download progress dialog with spinner, progress bar, and cancel button. Extends `Modal`.

| Property | Type |
|---|---|
| `fileName` | `string` |
| `status` | `string` |
| `progress` | `number` |

**Methods:**
- `setResolve(fn)` — set promise resolve callback
- `getHandle()` → `DownloadDialogHandle` — returns `{ update, close, cancel, promise }` for external control
- `closeWithResult(cancelled)` — resolve and close modal
- `updateStatus()` — refresh status label with spinner

Factory: `createDownloadDialog(fileName, status?)`

### `ExitDialog`

Three-option exit dialog: Cancel, Exit Now, Stop & Exit. Extends `Modal`.

| Property | Type |
|---|---|
| `message` | `string` |

**Methods:**
- `setResolve(fn)` — set promise resolve callback
- `closeWithResult(ExitResult)` — resolve and close modal

`ExitResult`: `"cancel" | "exit" | "stop_and_exit"`

Factory: `createExitDialog(message?)`

### `InputDialog`

Single-line text input dialog with OK/Cancel. Extends `Modal`.

| Property | Type |
|---|---|
| `value` | `string` |
| `placeholder` | `string` |

**Methods:**
- `setResolve(fn)` — set promise resolve callback
- `closeWithResult(string \| null)` — resolve and close modal

Factory: `createInputDialog(title, placeholder, initialValue?)`

### `DeviceSelectorModal`

GPU device scanner and selector. Extends `Modal`. Scans system devices, displays selectable list.

**Methods:**
- `setConfig(config)` — set ConfigData for device scanning
- `setResolve(fn)` — set promise resolve callback
- `scanDevices()` — async scan and populate list
- `closeWithResult(string \| null)` — resolve and close modal

Factory: `createDeviceSelectorModal(config)`

### `ThemeSelectorModal`

Theme picker with live preview. Extends `Modal`. Shows theme list alongside a rendered preview of all UI elements.

**Methods:**
- `setResolve(fn)` — set promise resolve callback
- `setInitialTheme(name)` — set currently active theme

Factory: `createThemeSelectorModal(currentTheme)` → `Promise<string | null>`

### `StoppingServerModal`

Simple blocking modal with animated spinner showing "Stopping server". Factory only.

Factory: `createStoppingServerModal()` → `Modal`

### `SelectorLabel`

Focusable, clickable label that opens a selector modal on activation. Combines a prefix label with a value, with focus highlighting and keyboard/mouse navigation.

| Property | Type | Default |
|---|---|---|
| `value` | `string` | `""` |
| `prefix` | `string` | `""` |

Constructor accepts `SelectorLabelConfig`: `{ prefix, value?, valueColor?, onActivate }`.

`onActivate` is `() => Promise<string \| null>` — called on `Enter`, `Return`, `Space`, or mouse click. The resolved value is automatically set as the widget's `value`.

Navigation: `Left`/`Right`/`Up`/`Down` (plus `h`/`j`/`k`/`l`) move focus via `FocusManager`.

Styling: muted prefix with colored value normally, bold inverted colors when focused.

### `SelectorModal`

Generic list picker modal. Extends `Modal`. Shows a scrollable list of items with OK/Cancel buttons.

| Property | Type |
|---|---|
| `items` | `SelectorItem[]` |
| `selectedId` | `string \| null` |

`SelectorItem`: `{ id: string, label: string, sublabel?: string }`

**Methods:**
- `setItems(items, selectedId)` — populate list, set selection
- `setResolve(fn)` — set promise resolve callback
- `closeWithResult(string \| null)` — resolve and close modal

Factory: `createSelectorModal(title, items, selectedId)` → `Promise<string \| null>`

Resolves with the selected item's `id`, or `null` on cancel. Enter confirms, Escape cancels.

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
import { Control } from "./framework/Control";
import type { Size, RenderContext } from "./framework/types";

class MyWidget extends Control {
  public text = "hello";

  measure(_parentSize?: Size): Size {
    return { width: this.text.length, height: 1 };
  }

  draw(ctx: RenderContext): void {
    const { canvas } = ctx;
    canvas.moveTo(this.rect.x, this.rect.y);
    canvas.write(this.text);
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
1. Override `draw()` for custom content — `render()` handles bg clear, clipping, child rendering, and `needsRender`
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
│   └── Section (flex=1, detail panel)
│       └── Scrollable
└── Row (bottom bar)
    ├── StyledText
    └── Spacer (flex=1)
```

Set `focusManager.setRoot(rootColumn)` (or use `Application`) and route all key events through `focusManager.handleKey(key)`. Route mouse events through `root.hitTest(point)` and `focusManager.handleMouseDown(point)`.
