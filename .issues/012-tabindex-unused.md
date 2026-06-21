# 012 - Control.tabIndex property is unused

**File:** `src/components/ui/Control.ts:11`

**Problem:** `Control` has a `tabIndex` property (default 0) documented as "Reserved for ordering (not currently used)". The `getAllFocusable()` method returns focusable controls in tree-traversal order, ignoring `tabIndex`.

**Investigation needed:** Determine if `tabIndex` should:
- Sort results in `getAllFocusable()` by tabIndex before returning
- Be removed entirely as dead code
- Be implemented later with a clear spec
