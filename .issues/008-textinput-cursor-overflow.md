# 008 - TextInput cursor overflow and missing viewport scrolling

**File:** `src/components/ui/widgets/TextInput.ts`

**Problem:** The TextInput renders the full value string and positions the terminal cursor absolutely at `x + 1 + prefix.length + cursorPos`. When the value exceeds the widget's allocated width, the cursor runs off-screen and text overflows into adjacent controls.

**Fix:** Add a `viewportOffset` (scroll position) to the TextInput. In `draw()`:
- Calculate visible width: `rect.width - prefix.length - 3` (borders + prefix)
- If `cursorPos < viewportOffset`, scroll left: `viewportOffset = cursorPos`
- If `cursorPos >= viewportOffset + visibleWidth`, scroll right: `viewportOffset = cursorPos - visibleWidth + 1`
- Render only the visible slice: `value.slice(viewportOffset, viewportOffset + visibleWidth)`
- Adjust cursor X to `x + 1 + prefix.length + (cursorPos - viewportOffset)`

Also need to handle `onMouseDown` to account for the viewport offset when positioning the cursor on click.
