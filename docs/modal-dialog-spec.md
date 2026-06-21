# Modal Dialog System — Specification

## Overview

A global, stackable modal dialog system for the llama-dashboard TUI. Modals hijack keyboard and mouse input, disable underlying controls, and render on top of the existing control tree with a dimmed backdrop.

---

## Design Decisions

| Decision | Choice |
|---|---|
| Scope | App-wide (stacked above all tabs) |
| Nesting | Stackable (multiple modals, each isolates input) |
| Backdrop | Dimmed overlay (solid darkened rect over TabContent area) |

---

## New Files

| File | Purpose |
|---|---|
| `src/components/ui/ModalManager.ts` | Singleton managing the modal stack |
| `src/components/ui/widgets/Modal.ts` | Base Modal Control (border, title, content area, button bar) |
| `src/components/ui/widgets/AlertDialog.ts` | Title + message + OK button |
| `src/components/ui/widgets/ConfirmDialog.ts` | Title + message + Yes/No, returns `Promise<boolean>` |
| `src/components/ui/widgets/ProgressDialog.ts` | Title + message + ProgressBar, cancellable, progress updates |

---

## Architecture

### ModalManager (singleton)

Similar pattern to `FocusManager`. Manages a stack of `Modal` instances.

```typescript
class ModalManager {
  private stack: Modal[] = [];
  private _disabledControl: Control | null = null; // TabContent ref for backdrop

  open(modal: Modal): void
  close(modal?: Modal): void
  isOpen(): boolean
  getTop(): Modal | null
  get stackSize(): number
}
```

**`open(modal)`**:
1. Push modal to stack
2. Save current FocusManager root via `saveRoot()`, set root to the modal
3. Disable underlying content area (set `_disabledControl.enabled = false`)
4. Mark root dirty

**`close(modal)`**:
1. Pop from stack (top if no argument, or specific modal)
2. Restore previous FocusManager root via `restoreRoot()`
3. If stack empty, re-enable underlying content area
4. Mark root dirty
5. Resolve any associated Promise (for ConfirmDialog)

### Input Hijacking

Two mechanisms work together:

**A. FocusManager root swap** — `saveRoot()` / `restoreRoot()`:
- `saveRoot()` pushes current root to an internal stack, sets root to `null`
- `restoreRoot()` pops the previous root
- This scopes Tab navigation, `hitTest`, and focus tracking to the modal only

**B. App.ts key/mouse interception** (defense in depth):
- In `App.keyHandler`, before `focusManager.handleKey()`, check `modalManager.isOpen()`
- If true, route to `modalManager.getTop()?.handleKey(key)`, return consumed
- Same for mouse: intercept before `focusManager.handleMouseDown/Up`

### Rendering Integration

In `App.render()`, after `main.layout()` + `main.render()`:

1. If `modalManager.isOpen()`, render a dimmed backdrop over the TabContent area
2. For each modal in the stack, compute a centered rect, call `modal.layout(rect)` then `modal.render()`
3. Backdrop + modals draw on the framebuffer after the normal control tree, so they appear on top

The modal rect is computed each frame from terminal dimensions, so resize is handled naturally.

### Modal Control

Extends `Control`. Internal structure:

```
┌─ Box (border) ───────────────┐
│  Row: title + optional close  │
│  Divider                       │
│  Column (flex=1, content)     │
│  Row: button bar (bottom)     │
└───────────────────────────────┘
```

- Centered within its assigned rect
- `Escape` closes the modal
- Tab/Shift+Tab scoped to modal's own buttons
- Minimum width, auto-height based on content

### Backdrop

Solid filled rect over the TabContent region with a darkened background color. No true terminal transparency, so use a darker shade of the current theme background.

---

## Integration Points

### `src/components/App.ts`

| Change | Detail |
|---|---|
| Initialize ModalManager | Create singleton, pass TabContent ref for backdrop |
| Key handler | Before `focusManager.handleKey()`, intercept if `modalManager.isOpen()` |
| Mouse handler | Before `focusManager.handleMouseDown/Up()`, intercept if `modalManager.isOpen()` |
| Render loop | After `main.render()`, render backdrop + modal stack |
| Tab switching | Block F1-F6 when modal stack is non-empty |

### `src/components/ui/FocusManager.ts`

| Change | Detail |
|---|---|
| `saveRoot()` | Push current `_root` to a private stack, set `_root = null`, clear focus |
| `restoreRoot()` | Pop from stack, restore `_root`, attempt to restore focus |

### `src/lib/tabcontext.ts`

| Addition | Signature |
|---|---|
| `openModal` | `<T>(modal: Modal): Promise<T>` |
| `closeModal` | `(result?: any, modal?: Modal): void` |

Added to `RenderContext` so any control can spawn dialogs without importing ModalManager directly.

---

## API Usage

```typescript
// Simple alert (fire-and-forget):
ctx.openModal(createAlertDialog('Error', 'Something went wrong'));

// Confirmation with async:
const confirmed = await ctx.openModal(createConfirmDialog('Delete', 'Are you sure?'));
if (confirmed) { /* proceed */ }

// Progress:
const progress = ctx.openModal(createProgressDialog('Downloading', '', { cancellable: true }));
progress.update(0.5, '50% complete');
progress.close();
```

---

## Implementation Order

1. **ModalManager.ts** — stack, open/close lifecycle
2. **FocusManager.ts** — `saveRoot()` / `restoreRoot()` 
3. **Modal.ts** — base Modal Control (border, layout, Escape handler)
4. **App.ts** — wire ModalManager into key/mouse handlers and render loop
5. **tabcontext.ts** — expose `openModal` / `closeModal` on context
6. **AlertDialog.ts** — OK-only dialog
7. **ConfirmDialog.ts** — Yes/No dialog with Promise
8. **ProgressDialog.ts** — progress bar dialog, cancellable
9. **Smoke test** — temporary button in Options tab to open each dialog type

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| Tab switch during modal | F1-F6 blocked while modal is open |
| Resize during modal | Modal rect recomputed each frame |
| Modal opens modal | Stack handles nesting; each modal gets its own FocusManager root scope |
| ServerTab inline edit + modal | Inline edit cancelled when modal opens (input taken over) |
| Modal closed programmatically vs Escape | Both call `modalManager.close()`, same cleanup |
| ConfirmDialog cancelled | Promise resolves to `false` |
| ProgressDialog cancelled | Promise resolves to `null` (distinguishes from Yes/No) |
