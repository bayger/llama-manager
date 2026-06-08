import { Control } from "../ui/Control.js";
import { themeColors, fg, fgBg } from "../../lib/theme.js";
import { focusManager } from "../ui/FocusManager.js";
import {
  PRESET_CATEGORIES,
  ConfigData,
  PresetFieldDef,
  PresetFieldType,
  ServerPresets,
  saveConfig,
} from "../../lib/config.js";
import type { TabContext } from "../../lib/tabcontext.js";
import type { Size } from "../ui/types.js";
import type { FramebufferCanvas } from "../../lib/framebuffer-canvas.js";

const KEY_COL_WIDTH = 18;

interface RowInfo {
  type: "header" | "field";
  catIdx: number;
  fieldIdx?: number;
  field?: PresetFieldDef;
}

interface EditState {
  row: number;
  catIdx: number;
  field: PresetFieldDef;
  originalValue: unknown;
  text: string;
  cursor: number;
}

function formatFieldValue(field: PresetFieldDef, value: unknown): string {
  if (value === null || value === undefined) return "(null)";
  return String(value);
}

function formatForEdit(field: PresetFieldDef, value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function parseValue(type: PresetFieldType, text: string): unknown {
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
      return trimmed;
    case "enum":
      return trimmed;
    default:
      return trimmed;
  }
}

function isNumericChar(char: string): boolean {
  return char >= "0" && char <= "9";
}

export class SettingsPanel extends Control {
  protected _config: ConfigData | null = null;
  protected _scrollOffset = 0;
  protected _selectedIndex = 0;
  protected _collapsed = new Set<number>();
  protected _rows: RowInfo[] = [];
  protected _onMessage: ((msg: string) => void) | null = null;
  protected _edit: EditState | null = null;

  setMessageCallback(cb: (msg: string) => void): void {
    this._onMessage = cb;
  }

  setConfig(config: ConfigData): void {
    this._config = config;
    this._edit = null;
    this.buildRows();
    this.clampSelection();
    this.markDirty();
  }

  buildRows(): void {
    this._rows = [];
    if (!this._config) return;
    const presets = this._config.server.profiles[this._config.server.activeProfile]?.presets;
    if (!presets) return;

    for (let catIdx = 0; catIdx < PRESET_CATEGORIES.length; catIdx++) {
      const cat = PRESET_CATEGORIES[catIdx]!;
      this._rows.push({ type: "header", catIdx });
      if (!this._collapsed.has(catIdx)) {
        for (let fIdx = 0; fIdx < cat.fields.length; fIdx++) {
          this._rows.push({ type: "field", catIdx, fieldIdx: fIdx, field: cat.fields[fIdx]! });
        }
      }
    }
  }

  clampSelection(): void {
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

  render(): void {
    if (!this.visible || !this.needsRender) return;
    const canvas = this.canvas;
    const { x, y: startY, width, height } = this.rect;
    const presets = this._config?.server.profiles[this._config?.server.activeProfile]?.presets;

    if (!presets || !this._config || this._rows.length === 0) {
      this.needsRender = false;
      return;
    }

    for (let i = 0; i < height; i++) {
      const visualRow = i + this._scrollOffset;
      if (visualRow >= this._rows.length) break;

      canvas.moveTo(x, startY + i);
      canvas.styleReset();
      const row = this._rows[visualRow]!;
      const isSelected = visualRow === this._selectedIndex;
      const isEditing = !!(this._edit && visualRow === this._edit.row);

      if (row.type === "header") {
        this.renderHeader(canvas, row, isSelected, width);
      } else if (row.type === "field" && row.field) {
        this.renderField(canvas, row, isSelected, isEditing, width, presets);
      }
    }

    const lastVisualRow = Math.min(this._scrollOffset + height, this._rows.length);
    for (let i = lastVisualRow - this._scrollOffset; i < height; i++) {
      canvas.moveTo(x, startY + i);
      canvas.styleReset();
      fg(canvas, themeColors.canvas, " ".repeat(width));
    }

    if (this._edit) {
      this.renderCursor(canvas);
    }

    this.needsRender = false;
  }

  renderCursor(canvas: FramebufferCanvas): void {
    if (!this._edit || !this._config) return;
    const row = this._edit.row;
    const screenY = this.rect.y + row - this._scrollOffset;
    const valueStartX = this.rect.x + KEY_COL_WIDTH;
    const cursorX = valueStartX + this._edit.cursor;
    canvas.moveTo(cursorX, screenY);
  }

  renderHeader(canvas: FramebufferCanvas, row: RowInfo, isSelected: boolean, width: number): void {
    const cat = PRESET_CATEGORIES[row.catIdx]!;
    const arrow = this._collapsed.has(row.catIdx) ? "▶" : "▼";
    const headerText = ` ${arrow} ${cat.name}`;

    if (isSelected) {
      const padded = headerText.padEnd(width);
      fgBg(canvas, themeColors.canvas, themeColors.accent, padded);
    } else {
      fg(canvas, themeColors.accent, headerText);
      fg(canvas, themeColors.textMuted, " ".repeat(Math.max(0, width - headerText.length)));
    }
    canvas.styleReset();
  }

  renderField(canvas: FramebufferCanvas, row: RowInfo, isSelected: boolean, isEditing: boolean, width: number, presets: ServerPresets): void {
    const field = row.field!;
    const cat = PRESET_CATEGORIES[row.catIdx]!;
    const presetData = presets[cat.presetKey];
    const keyStr = ` ${field.key}`.padEnd(KEY_COL_WIDTH);

    if (isEditing && this._edit) {
      const value = this._edit.text;
      fg(canvas, themeColors.warning, keyStr);
      fg(canvas, themeColors.selected, value);
      fg(canvas, themeColors.textMuted, " ".repeat(Math.max(0, width - KEY_COL_WIDTH - value.length)));
    } else {
      const value = formatFieldValue(field, presetData?.[field.key]);

      let extra = "";
      if (isSelected && field.type === "boolean") {
        extra = " (toggle)";
      } else if (isSelected && field.type === "enum" && field.options) {
        extra = ` [${field.options.join(" | ")}]`;
      }

      const descSpace = Math.max(0, width - KEY_COL_WIDTH - value.length - extra.length - 2);
      const desc = descSpace > 0 ? field.description.substring(0, descSpace) : "";

      if (isSelected) {
        canvas.bold();
        fg(canvas, themeColors.accent, keyStr);
        canvas.styleReset();
        fg(canvas, themeColors.text, value);
        fg(canvas, themeColors.textMuted, extra + (desc ? "  " + desc : ""));
      } else {
        fg(canvas, themeColors.textMuted, keyStr);
        fg(canvas, themeColors.text, value);
        fg(canvas, themeColors.textMuted, desc ? "  " + desc : "");
      }

      const drawn = KEY_COL_WIDTH + value.length + extra.length + (desc ? 2 + desc.length : 0);
      fg(canvas, themeColors.textMuted, " ".repeat(Math.max(0, width - drawn)));
    }
    canvas.styleReset();
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
        if (row.field.type === "enum" && row.field.options) {
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

  handleEditKey(key: string): boolean {
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

  toggleBoolean(row: RowInfo): void {
    if (row.type !== "field" || !row.field || !this._config) return;
    const presets = this._config.server.profiles[this._config.server.activeProfile]?.presets;
    const presetData = presets?.[PRESET_CATEGORIES[row.catIdx]!.presetKey];
    if (!presetData) return;
    const current = presetData[row.field.key];
    presetData[row.field.key] = current === true ? false : true;
    try {
      saveConfig(this._config);
    } catch (e) {
      this._onMessage?.(`Error saving: ${e}`);
    }
    this.markDirty();
  }

  cycleEnum(row: RowInfo): void {
    if (row.type !== "field" || !row.field || !row.field.options || !this._config) return;
    const presets = this._config.server.profiles[this._config.server.activeProfile]?.presets;
    const presetData = presets?.[PRESET_CATEGORIES[row.catIdx]!.presetKey];
    if (!presetData) return;
    const current = presetData[row.field.key];
    const idx = row.field.options.indexOf(String(current));
    const next = idx < row.field.options.length - 1 ? idx + 1 : 0;
    presetData[row.field.key] = row.field.options[next]!;
    try {
      saveConfig(this._config);
    } catch (e) {
      this._onMessage?.(`Error saving: ${e}`);
    }
    this.markDirty();
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

  startEdit(row: RowInfo): void {
    if (row.type !== "field" || !row.field || !this._config) return;
    const presets = this._config.server.profiles[this._config.server.activeProfile]?.presets;
    const presetData = presets?.[PRESET_CATEGORIES[row.catIdx]!.presetKey];
    const editValue = formatForEdit(row.field, presetData?.[row.field.key]);
    this._edit = {
      row: this._selectedIndex,
      catIdx: row.catIdx,
      field: row.field,
      originalValue: presetData?.[row.field.key],
      text: editValue,
      cursor: editValue.length,
    };
    focusManager.activateTextInput(true);
    this.canvas.showCursor();
    this.markDirty();
  }

  commitEdit(): void {
    if (!this._edit || !this._config) return;
    const { catIdx, field, text } = this._edit;
    const presets = this._config.server.profiles[this._config.server.activeProfile]?.presets;
    if (!presets) return;

    const presetData = presets[PRESET_CATEGORIES[catIdx]!.presetKey];
    if (!presetData) return;

    const parsed = parseValue(field.type, text);
    const changed = presetData[field.key] !== parsed;
    presetData[field.key] = parsed;

    this._edit = null;
    focusManager.activateTextInput(false);
    this.canvas.hideCursor();

    if (changed) {
      try {
        saveConfig(this._config);
        this._onMessage?.(`Saved ${field.key} = ${text}`);
      } catch (e) {
        this._onMessage?.(`Error saving: ${e}`);
      }
    }

    this.markDirty();
  }

  cancelEdit(): void {
    if (!this._edit || !this._config) return;
    const { catIdx, field, originalValue } = this._edit;
    const presets = this._config.server.profiles[this._config.server.activeProfile]?.presets;
    const presetData = presets?.[PRESET_CATEGORIES[catIdx]!.presetKey];
    if (presetData) {
      presetData[field.key] = originalValue;
    }
    this._edit = null;
    focusManager.activateTextInput(false);
    this.canvas.hideCursor();
    this.markDirty();
  }

  toggleCategory(catIdx: number): void {
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
      const { catIdx, field, originalValue } = this._edit;
      const presets = this._config?.server.profiles[this._config?.server.activeProfile]?.presets;
      const presetData = presets?.[PRESET_CATEGORIES[catIdx]!.presetKey];
      if (presetData) {
        presetData[field.key] = originalValue;
      }
      this._edit = null;
      focusManager.activateTextInput(false);
      this.canvas.hideCursor();
      this.markDirty();
    }
  }
}
