# 003 - Column / Row ignore minWidth and minHeight

**File:** `src/components/ui/Layout.ts`

**Problem:** `Control` declares `minWidth` and `minHeight` properties (default 0), but neither `Column.onLayout()` nor `Row.onLayout()` checks them when assigning child rects. A child with `minWidth: 50` can be laid out in a 20px-wide slot.

**Fix:** In both `Column.onLayout()` and `Row.onLayout()`, after computing the child's allocated size, clamp it to `Math.max(childSize.width, child.minWidth)` and `Math.max(childSize.height, child.minHeight)`. Account for min constraints when computing flex distribution (subtract min sizes from available space before distributing).
