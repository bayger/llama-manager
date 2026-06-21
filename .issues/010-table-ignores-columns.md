# 010 - Table default renderer ignores column definitions

**File:** `src/components/ui/widgets/Table.ts:281-311`

**Problem:** The default `renderRow()` only outputs `item.label` and `item.sublabel` as plain text. The `columns` configuration (with `width`, `align`, `format` callbacks) is only used for the header rendering. The body rows ignore column structure entirely, producing a mismatch between headers and data.

**Fix:** Make the default `renderRow()` iterate `visibleCols`, extracting cell data from `item.data` (assuming it's a record with keys matching column labels, or using the `format` callback if provided). Each cell should be padded/truncated to its column width, respecting `align`. If `item.data` is not an object, fall back to the current `label`/`sublabel` behavior.
