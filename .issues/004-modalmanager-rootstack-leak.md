# 004 - ModalManager.close() leaks _rootStack entries

**File:** `src/components/ui/ModalManager.ts:22-37`

**Problem:** When closing a modal and the stack is still non-empty, `close()` calls `focusManager.restoreRoot()` (which pops from `_rootStack`), then immediately calls `focusManager.setRoot(top)`. This discards a saved root from the stack. On the next close, the wrong root is restored.

**Fix:** Only call `focusManager.restoreRoot()` when the stack reaches zero after the pop. When stack > 0, call `focusManager.setRoot(this._stack[this._stack.length - 1])` directly without `restoreRoot()`.
