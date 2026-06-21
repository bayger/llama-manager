# 005 - FocusManager focusNext() / focusPrev() don't wrap

**File:** `src/components/ui/FocusManager.ts:92-106`

**Problem:** `nextFocus()` (bound to Tab) wraps around at boundaries. `focusNext()` (bound to `j`/`Down`) silently stops. Inconsistent behavior: pressing Tab cycles through all focusables, pressing `j` gets stuck at the end.

**Fix:** Make `focusNext()` and `focusPrev()` wrap around like `nextFocus()` and `previousFocus()`. Alternatively, remove the non-wrapping methods entirely and have `j`/`k` call `nextFocus()`/`previousFocus()` directly.
