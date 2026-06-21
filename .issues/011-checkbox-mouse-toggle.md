# 011 - Checkbox toggles on mouseDown instead of mouseUp

**File:** `src/components/ui/widgets/Checkbox.ts:99-110`

**Problem:** `Checkbox.onMouseDown()` toggles the checked state immediately. If the user clicks and drags the mouse outside the checkbox before releasing, the toggle still fires. `Button` uses a press-release pattern (`_pressed` flag) to avoid this.

**Fix:** Match `Button`'s pattern:
- In `onMouseDown()`, set `this._pressed = true` (don't toggle yet)
- In `onMouseUp()`, check `this._pressed && this.isPointInside(point)`, then toggle. Set `this._pressed = false`.
- Add `_pressed` property and `isPointInside()` helper (or reuse from base `hitTest`).
