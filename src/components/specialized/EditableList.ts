import { Control } from "../ui/Control";
import type { PresetFieldType } from "../../lib/config";
import { focusManager } from "../ui/FocusManager";
import type { Point, Size, RenderContext } from "../ui/types";

export interface EditableFieldDef {
  key: string;
  type: PresetFieldType | "string" | "number" | "boolean";
  options?: string[];
  description?: string;
}

export interface EditableRowInfo {
  type: "header" | "field";
  catIdx: number;
  fieldIdx?: number;
  field?: EditableFieldDef;
}

export interface EditableEditState {
  row: number;
  catIdx: number;
  field: EditableFieldDef;
  originalValue: unknown;
  text: string;
  cursor: number;
}

export function formatFieldValue(field: EditableFieldDef, value: unknown): string {
  if (value === null || value === undefined) return "(null)";
  return String(value);
}

export function formatForEdit(field: EditableFieldDef, value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function parseEditableValue(type: PresetFieldType | "string" | "number" | "boolean", text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === "" || trimmed === "(null)") return null;

  switch (type) {
    case "number":
      const n = Number(trimmed);
      if (isNaN(n)) return null;
      return n;
    case "boolean":
      return trimmed === "true";
    case "string":
    case "enum":
      return trimmed;
    default:
      return trimmed;
  }
}

export function isNumericChar(char: string): boolean {
  return char >= "0" && char <= "9";
}

export abstract class EditableList extends Control {
  focusable = true;
  protected _scrollOffset = 0;
  protected _selectedIndex = 0;
  protected _collapsed = new Set<number>();
  protected _rows: EditableRowInfo[] = [];
  protected _edit: EditableEditState | null = null;

  // --- Abstract hooks ---

  protected abstract buildRows(): void;
  protected abstract getRowValue(row: EditableRowInfo): unknown;
  protected abstract setRowValue(row: EditableRowInfo, value: unknown): void;
  protected abstract drawHeader(canvas: NonNullable<RenderContext["canvas"]>, row: EditableRowInfo, isSelected: boolean, width: number): void;
  protected abstract drawField(canvas: NonNullable<RenderContext["canvas"]>, row: EditableRowInfo, isSelected: boolean, isEditing: boolean, width: number): void;
  protected abstract saveAndMessage(): void;

  /** Override to return false to disable enum cycling. */
  protected supportsEnumCycling(): boolean { return true; }

  /** Override to filter rows (e.g. advanced mode). Called after base buildRows. */
  protected filterRows(_rows: EditableRowInfo[]): EditableRowInfo[] { return _rows; }

  // --- Public API ---

  setEditState(edit: EditableEditState | null): void {
    this._edit = edit;
  }

  // --- Shared logic ---

  protected clampSelection(): void {
    const len = this._rows.length;
    if (len === 0) {
      this._selectedIndex = 0;
      this._scrollOffset = 0;
      return;
    }
    this._selectedIndex = Math.max(0, Math.min(this._selectedIndex, len - 1));
    const maxScroll = Math.max(0, len - this.rect.height);
    this._scrollOffset = Math.max(0, Math.min(this._scrollOffset, maxScroll));
    if (this._selectedIndex < this._scrollOffset) {
      this._scrollOffset = this._selectedIndex;
    }
    if (this._selectedIndex >= this._scrollOffset + this.rect.height) {
      this._scrollOffset = this._selectedIndex - this.rect.height + 1;
    }
  }

  measure(parentSize?: Size): Size {
    return parentSize ? { width: parentSize.width, height: parentSize.height } : super.measure(parentSize);
  }

  onLayout(): void {
    this.clampSelection();
  }

  /** Override to return a different effective width (e.g. when a sidebar is visible). */
  protected getDrawWidth(): number {
    return this.rect.width;
  }

  draw(ctx: RenderContext): void {
    const canvas = ctx.canvas;
    const { x, y: startY, height } = this.rect;
    const width = this.getDrawWidth();

    if (this._rows.length === 0) return;

    canvas.moveTo(x, startY);

    for (let i = 0; i < height; i++) {
      const visualRow = i + this._scrollOffset;
      if (visualRow >= this._rows.length) break;

      canvas.moveTo(x, startY + i);
      canvas.styleReset();
      const row = this._rows[visualRow]!;
      const isSelected = visualRow === this._selectedIndex && this.focused;
      const isEditing = !!(this._edit && visualRow === this._edit.row);

      if (row.type === "header") {
        this.drawHeader(canvas, row, isSelected, width);
      } else if (row.type === "field" && row.field) {
        this.drawField(canvas, row, isSelected, isEditing, width);
      }
    }

    if (this._edit) {
      this.drawCursor(canvas);
    } else {
      canvas.hideTerminalCursor();
    }
  }

  protected drawCursor(canvas: NonNullable<RenderContext["canvas"]>): void {
    if (!this._edit) return;
    const screenY = this.rect.y + this._edit.row - this._scrollOffset;
    const cursorX = this.rect.x + this.getKeyColWidth() + this._edit.cursor;
    canvas.moveTo(cursorX, screenY);
    canvas.showTerminalCursor();
  }

  protected getKeyColWidth(): number {
    return 18; // default, override in subclass
  }

  handleKey(key: string): boolean {
    if (this._edit) {
      return this.handleEditKey(key);
    }

    const len = this._rows.length;
    if (len === 0) return false;

    if (key === "UP" || key === "k") {
      if (this._selectedIndex > 0) {
        this._selectedIndex--;
        if (this._selectedIndex < this._scrollOffset) {
          this._scrollOffset = this._selectedIndex;
        }
        this.markDirty();
        return true;
      }
      return false;
    }
    if (key === "DOWN" || key === "j") {
      if (this._selectedIndex < len - 1) {
        this._selectedIndex++;
        const viewportBottom = this._scrollOffset + this.rect.height;
        if (this._selectedIndex >= viewportBottom) {
          this._scrollOffset = this._selectedIndex - this.rect.height + 1;
        }
        this.markDirty();
        return true;
      }
      return false;
    }
    if (key === "PAGE_UP") {
      this._selectedIndex = Math.max(0, this._selectedIndex - this.rect.height);
      this._scrollOffset = Math.max(0, this._scrollOffset - this.rect.height);
      this.markDirty();
      return true;
    }
    if (key === "PAGE_DOWN") {
      this._selectedIndex = Math.min(len - 1, this._selectedIndex + this.rect.height);
      this._scrollOffset = Math.min(len - this.rect.height, this._scrollOffset + this.rect.height);
      this.markDirty();
      return true;
    }
    if (key === "HOME") {
      this._selectedIndex = 0;
      this._scrollOffset = 0;
      this.markDirty();
      return true;
    }
    if (key === "END") {
      this._selectedIndex = len - 1;
      this._scrollOffset = Math.max(0, len - this.rect.height);
      this.markDirty();
      return true;
    }

    const row = this._rows[this._selectedIndex];
    if (!row) return false;

    if (key === "RETURN" || key === "ENTER") {
      if (row.type === "header") {
        this.toggleCategory(row.catIdx);
        return true;
      }
      if (row.type === "field" && row.field) {
        if (row.field.type === "boolean") {
          this.toggleBoolean(row);
          return true;
        }
        if (this.supportsEnumCycling() && row.field.type === "enum" && row.field.options) {
          this.cycleEnum(row);
          return true;
        }
        this.startEdit(row);
        return true;
      }
      return false;
    }

    if (key === "SPACE") {
      if (row.type === "header") {
        this.toggleCategory(row.catIdx);
        return true;
      }
      return false;
    }

    return false;
  }

  protected handleEditKey(key: string): boolean {
    if (!this._edit) return false;

    if (key === "ESCAPE") {
      this.cancelEdit();
      return true;
    }
    if (key === "RETURN" || key === "ENTER") {
      this.commitEdit();
      return true;
    }
    if (key === "UP" || key === "DOWN" || key === "PAGE_UP" || key === "PAGE_DOWN") {
      this.cancelEdit();
      return this.handleKey(key);
    }
    if (key === "LEFT" || key === "CTRL_A" || key === "HOME") {
      if (key === "LEFT") {
        this._edit.cursor = Math.max(0, this._edit.cursor - 1);
      } else {
        this._edit.cursor = 0;
      }
      this.markDirty();
      return true;
    }
    if (key === "RIGHT" || key === "CTRL_E" || key === "END") {
      if (key === "RIGHT") {
        this._edit.cursor = Math.min(this._edit.text.length, this._edit.cursor);
      } else {
        this._edit.cursor = this._edit.text.length;
      }
      this.markDirty();
      return true;
    }
    if (key === "BACKSPACE" || key === "CTRL_H" || key === "\u007f" || key === "CTRL_W") {
      if (key === "CTRL_W") {
        const before = this._edit.text.slice(0, this._edit.cursor);
        const match = before.match(/\S+\s*$/);
        const newCursor = match ? this._edit.cursor - match[0].length : 0;
        this._edit.text = this._edit.text.slice(0, newCursor) + this._edit.text.slice(this._edit.cursor);
        this._edit.cursor = newCursor;
      } else if (this._edit.cursor > 0) {
        this._edit.text = this._edit.text.slice(0, this._edit.cursor - 1) + this._edit.text.slice(this._edit.cursor);
        this._edit.cursor--;
      }
      if (this._edit.field.type === "number" && this._edit.text === "-") {
        this._edit.text = "";
      }
      this.markDirty();
      return true;
    }
    if (key === "DELETE" || key === "CTRL_D") {
      if (this._edit.cursor < this._edit.text.length) {
        this._edit.text = this._edit.text.slice(0, this._edit.cursor) + this._edit.text.slice(this._edit.cursor + 1);
        if (this._edit.field.type === "number" && this._edit.text === "-") {
          this._edit.text = "";
        }
        this.markDirty();
        return true;
      }
      return false;
    }
    return false;
  }

  handleChar(char: string): boolean {
    if (!this._edit) return false;
    if (char.length !== 1) return false;

    if (this._edit.field.type === "number") {
      if (!isNumericChar(char) && char !== "-") return false;
      if (char === "-" && this._edit.cursor !== 0) return false;
      if (this._edit.text === "-" && char === "-") return false;
    }

    this._edit.text = this._edit.text.slice(0, this._edit.cursor) + char + this._edit.text.slice(this._edit.cursor);
    this._edit.cursor++;
    this.markDirty();
    return true;
  }

  protected toggleBoolean(row: EditableRowInfo): void {
    if (row.type !== "field" || !row.field) return;
    const current = this.getRowValue(row);
    this.setRowValue(row, current === true ? false : true);
    this.saveAndMessage();
    this.markDirty();
  }

  protected cycleEnum(row: EditableRowInfo): void {
    if (row.type !== "field" || !row.field || !row.field.options) return;
    const current = this.getRowValue(row);
    const idx = row.field.options.indexOf(String(current));
    const next = idx < row.field.options.length - 1 ? idx + 1 : 0;
    this.setRowValue(row, row.field.options[next]!);
    this.saveAndMessage();
    this.markDirty();
  }

  protected startEdit(row: EditableRowInfo): void {
    if (row.type !== "field" || !row.field) return;
    const editValue = formatForEdit(row.field, this.getRowValue(row));
    this._edit = {
      row: this._selectedIndex,
      catIdx: row.catIdx,
      field: row.field,
      originalValue: this.getRowValue(row),
      text: editValue,
      cursor: editValue.length,
    };
    focusManager.activateTextInput(true);
    this.markDirty();
  }

  protected commitEdit(): void {
    if (!this._edit) return;
    const { catIdx, field, text } = this._edit;
    const row = { type: "field" as const, catIdx, fieldIdx: 0, field };
    const parsed = parseEditableValue(field.type, text);
    const changed = this.getRowValue(row) !== parsed;
    this.setRowValue(row, parsed);

    this._edit = null;
    focusManager.activateTextInput(false);

    if (changed) {
      this.saveAndMessage();
    }

    this.markDirty();
  }

  protected cancelEdit(): void {
    if (!this._edit) return;
    const { catIdx, field, originalValue } = this._edit;
    const row = { type: "field" as const, catIdx, fieldIdx: 0, field };
    this.setRowValue(row, originalValue);
    this._edit = null;
    focusManager.activateTextInput(false);
    this.markDirty();
  }

  protected toggleCategory(catIdx: number): void {
    if (this._collapsed.has(catIdx)) {
      this._collapsed.delete(catIdx);
    } else {
      this._collapsed.add(catIdx);
    }
    this.buildRows();
    this.clampSelection();
    this.markDirty();
  }

  onFocus(): void {
    super.onFocus();
    this.clampSelection();
    this.markDirty();
  }

  onBlur(): void {
    super.onBlur();
    if (this._edit) {
      this.cancelEdit();
    }
  }

  onMouseDown(point: Point): boolean {
    if (this._rows.length === 0) return false;
    const row = point.y - this.rect.y;
    if (row < 0) return false;
    const visualRow = row + this._scrollOffset;
    if (visualRow >= 0 && visualRow < this._rows.length) {
      this._selectedIndex = visualRow;
      this.clampSelection();
      this.markDirty();
      return true;
    }
    return false;
  }
}
