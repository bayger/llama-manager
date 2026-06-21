# 007 - Label text overflows rect width (no truncation)

**File:** `src/components/ui/widgets/Label.ts:34-45`

**Problem:** `Label.draw()` writes `this.text` without checking if it exceeds `this.rect.width`. If the layout system assigns a smaller width than the text length, the label overflows into adjacent control space, corrupting the framebuffer.

**Fix:** In `draw()`, if `this.text.length > this.rect.width`, truncate the text and append an ellipsis character (`…`). Account for padding. Example: `display = text.slice(0, maxWidth - 1) + '\u2026'`.
