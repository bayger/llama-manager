# 006 - FocusManager j/k navigation conflicts with widget navigation

**File:** `src/components/ui/FocusManager.ts:167-174`

**Problem:** When a focused widget returns `false` from `handleKey()` for `j`/`k` (e.g., List at top or bottom boundary), the FocusManager intercepts the key and moves focus to the next/previous focusable control. This causes unexpected focus shifts when the user is trying to navigate within a list but hits a boundary.

**Decision needed:** Choose one approach:
- **A) Remove j/k from FocusManager entirely** — Tab/Shift+Tab handle focus switching. Widgets handle their own j/k navigation.
- **B) Only apply j/k focus navigation when no control has focus** — simple, avoids conflicts.
- **C) Add a `wantsVKNavigation` flag on Control** — widgets opt-in to receiving j/k at boundary.

Recommended: Option A (cleanest separation of concerns).
