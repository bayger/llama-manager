# 002 - Untyped event system

**File:** `src/components/ui/Control.ts:43-70`

**Problem:** `_listeners` is `Map<string, Array<(...args: any[]) => void>>`. The `on()`, `off()`, and `emit()` methods use `any` for both event names and arguments. No compile-time checking for typos or argument mismatches.

**Investigation (2026-06-21):**
- The Control event system is used for exactly **one event**: `"resize"` in the Control constructor (`this.on("resize", () => this.markDirty())`).
- No subclass emits or listens to Control events.
- Other modules (`server.ts`, `tasks.ts`, `logparser.ts`, etc.) use Node's built-in `EventEmitter`, not the Control system.
- 34 subclasses of Control exist, none override or extend the event system.

**Options considered:**
1. **Minimal — typed event map on Control**: `interface ControlEventMap { resize: []; }`. Update `on`/`off`/`emit` to use `keyof ControlEventMap`. Subclasses could extend the map. Low effort, modest gain.
2. **Generic — `Control<TEvents>`**: Strong typing, but requires touching all 34 subclasses to add event map type args (most would be `{}`).
3. **Extract to EventEmitter utility**: Pull `on`/`off`/`emit` into a standalone generic `EventEmitter<T>` class, compose into Control.
4. **Leave it**: One event, works fine. Low ROI for typing.

**Decision:** Defer. Low priority given single-event usage. Revisit if the event system expands.
