# 009 - List widget has no scrolling

**File:** `src/components/ui/widgets/List.ts`

**Problem:** `List` renders all items starting at `this.rect.y` with no scroll offset. If `items.length > rect.height`, items overflow into controls below. `Table` has scrolling, `List` does not.

**Fix:** Add scrolling to `List` similar to `Table`:
- Add `scrollOffset` and `contentHeight` properties
- In `onLayout()`, clamp `scrollOffset` to `[0, contentHeight - viewportHeight]`
- In `draw()`, render items from `scrollOffset` to `scrollOffset + viewportHeight`, offsetting Y by `-scrollOffset`
- In `handleKey()`, auto-scroll when `selectedIndex` moves outside the visible range
- In `onFocus()`, clamp scroll to keep `selectedIndex` visible
