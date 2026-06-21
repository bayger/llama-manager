# 001 - Control.onInit() / onDestroy() double-recursion

**File:** `src/components/ui/Control.ts:198-206`

**Problem:** Both the base `onInit()` and `onDestroy()` hooks recurse into children. If a subclass calls `super.onInit()` or `super.onDestroy()`, every child's hook fires twice — once from the parent's recursion and once from `super`. The same double-call happens in `destroy()` which calls `onDestroy()` then iterates children again.

**Fix:** Remove the recursion from the default `onInit()` and `onDestroy()` hooks. Only `destroy()` should recurse (for teardown). Subclasses that need to initialize/destroy children explicitly should do so themselves, or we add a single recursive pass in one place.
