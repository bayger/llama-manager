# 002 - Untyped event system

**File:** `src/components/ui/Control.ts:43-70`

**Problem:** `_listeners` is `Map<string, Array<(...args: any[]) => void>>`. The `on()`, `off()`, and `emit()` methods use `any` for both event names and arguments. No compile-time checking for typos or argument mismatches.

**Fix:** Introduce a typed event map. Could use a generic `EventEmitter<TEvents extends Record<string, any[]>>` or a simpler approach with a `TypedEventMap` interface that Control subclasses declare. At minimum, replace `any[]` with a more specific type and add JSDoc for known event names.
