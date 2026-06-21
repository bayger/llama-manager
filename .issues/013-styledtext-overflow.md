# 013 - StyledText overflows rect width (no truncation)

**File:** `src/components/ui/widgets/StyledText.ts:62-68`

**Problem:** `StyledText.draw()` writes all segments without checking if their combined length exceeds `this.rect.width`. In DownloadDialog, the file name can be a long path that overflows the modal width.

**Fix:** Add a `truncate` property (`"tail" | "head" | false`, default `"tail"`) to StyledText. In `draw()`, if total segment length exceeds `rect.width`, truncate the last segment and append `…`.

**Fixed:** (pending)
