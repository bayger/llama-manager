import { Control } from "../ui/Control.js";
import { themeColors, fg, fgBg } from "../../lib/theme.js";
import { focusManager } from "../ui/FocusManager.js";
import { ConfigData, saveConfig } from "../../lib/config.js";
import type { TabContext } from "../../lib/tabcontext.js";
import type { Size } from "../ui/types.js";
import type { Terminal } from "terminal-kit";

const KEY_COL_WIDTH = 22;
const CURSOR_SHOW = "\x1b[?25h";
const CURSOR_HIDE = "\x1b[?25l";

export interface OptionFieldDef {
  key: string;
  type: "string" | "number" | "boolean";
  default: unknown;
  description: string;
}

export interface OptionCategory {
  name: string;
  fields: OptionFieldDef[];
  getter: (config: ConfigData) => Record<string, unknown>;
  setter: (config: ConfigData, values: Record<string, unknown>) => void;
}

export const OPTION_CATEGORIES: OptionCategory[] = [
  {
    name: "Paths",
    fields: [
      { key: "versionsDir", type: "string", default: null, description: "Directory for server versions" },
      { key: "modelsDir", type: "string", default: null, description: "Directory for downloaded models" },
      { key: "tasksFile", type: "string", default: null, description: "Path to tasks JSONL file" },
    ],
    getter: (config) => ({
      versionsDir: config.versionsDir,
      modelsDir: config.modelsDir,
      tasksFile: config.tasksFile,
    }),
    setter: (config, values) => {
      if (values.versionsDir !== undefined) config.versionsDir = values.versionsDir as string | null;
      if (values.modelsDir !== undefined) config.modelsDir = values.modelsDir as string | null;
      if (values.tasksFile !== undefined) config.tasksFile = values.tasksFile as string | null;
    },
 },
  {
    name: "Credentials",
    fields: [
      { key: "hfToken", type: "string", default: null, description: "Hugging Face API token" },
    ],
    getter: (config) => ({
      hfToken: config.hfToken,
    }),
    setter: (config, values) => {
      if (values.hfToken !== undefined) config.hfToken = values.hfToken as string | null;
    },
  },
  {
    name: "Dashboard",
    fields: [
      { key: "pollIntervalMs", type: "number", default: 2000, description: "Dashboard poll interval (ms)" },
      { key: "killServerOnExit", type: "boolean", default: false, description: "Kill server on app exit" },
    ],
    getter: (config) => ({
      pollIntervalMs: config.dashboard.pollIntervalMs,
      killServerOnExit: config.dashboard.killServerOnExit,
    }),
    setter: (config, values) => {
      if (values.pollIntervalMs !== undefined) config.dashboard.pollIntervalMs = values.pollIntervalMs as number;
      if (values.killServerOnExit !== undefined) config.dashboard.killServerOnExit = values.killServerOnExit as boolean;
    },
  },
  {
    name: "Tasks",
    fields: [
      { key: "maxStored", type: "number", default: 10000, description: "Max stored tasks" },
      { key: "autoParse", type: "boolean", default: true, description: "Auto-parse task results" },
    ],
    getter: (config) => ({
      maxStored: config.tasks.maxStored,
      autoParse: config.tasks.autoParse,
    }),
    setter: (config, values) => {
      if (values.maxStored !== undefined) config.tasks.maxStored = values.maxStored as number;
      if (values.autoParse !== undefined) config.tasks.autoParse = values.autoParse as boolean;
    },
  },
];

interface RowInfo {
  type: "header" | "field";
  catIdx: number;
  fieldIdx?: number;
  field?: OptionFieldDef;
}

interface EditState {
  row: number;
  catIdx: number;
  field: OptionFieldDef;
  originalValue: unknown;
  text: string;
  cursor: number;
}

function formatFieldValue(field: OptionFieldDef, value: unknown): string {
  if (value === null || value === undefined) return "(null)";
  return String(value);
}

function formatForEdit(field: OptionFieldDef, value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function parseValue(type: "string" | "number" | "boolean", text: string): unknown {
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
    default:
      return trimmed;
  }
}

function isNumericChar(char: string): boolean {
  return char >= "0" && char <= "9";
}

export class OptionsPanel extends Control {
  protected _config: ConfigData | null = null;
  protected _ctx: TabContext | null = null;
  protected _scrollOffset = 0;
  protected _selectedIndex = 0;
  protected _collapsed = new Set<number>();
  protected _rows: RowInfo[] = [];
  protected _edit: EditState | null = null;

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;
  }

  buildRows(): void {
    this._rows = [];
    for (let catIdx = 0; catIdx < OPTION_CATEGORIES.length; catIdx++) {
      this._rows.push({ type: "header", catIdx });
      if (!this._collapsed.has(catIdx)) {
        const cat = OPTION_CATEGORIES[catIdx]!;
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

  onAttach(): void {
    this.buildRows();
    this.clampSelection();
  }

  onDetach(): void {
    this._config = null;
    this._ctx = null;
    if (this._edit) {
      this._edit = null;
      focusManager.activateTextInput(false);
      this.term(CURSOR_HIDE);
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
    const term = this.term;
    const { x, y: startY, width, height } = this.rect;
    const config = this._ctx?.getConfig();

    if (!config || this._rows.length === 0) {
      this.needsRender = false;
      return;
    }

    for (let i = 0; i < height; i++) {
      const visualRow = i + this._scrollOffset;
      if (visualRow >= this._rows.length) break;

      term.moveTo(x, startY + i);
      term.styleReset();
      const row = this._rows[visualRow]!;
      const isSelected = visualRow === this._selectedIndex;
      const isEditing = !!(this._edit && visualRow === this._edit.row);

      if (row.type === "header") {
        this.renderHeader(term, row, isSelected, width);
      } else if (row.type === "field" && row.field) {
        this.renderField(term, row, isSelected, isEditing, width, config);
      }
    }

    const lastVisualRow = Math.min(this._scrollOffset + height, this._rows.length);
    for (let i = lastVisualRow - this._scrollOffset; i < height; i++) {
      term.moveTo(x, startY + i);
      term.styleReset();
      fg(term, themeColors.canvas, " ".repeat(width));
    }

    if (this._edit) {
      this.renderCursor(term);
    }

    this.needsRender = false;
  }

  renderCursor(term: Terminal): void {
    if (!this._edit) return;
    const row = this._edit.row;
    const screenY = this.rect.y + row - this._scrollOffset;
    const valueStartX = this.rect.x + KEY_COL_WIDTH;
    const cursorX = valueStartX + this._edit.cursor;
    term.moveTo(cursorX, screenY);
  }

  renderHeader(term: Terminal, row: RowInfo, isSelected: boolean, width: number): void {
    const cat = OPTION_CATEGORIES[row.catIdx]!;
    const arrow = this._collapsed.has(row.catIdx) ? "▶" : "▼";
    const headerText = ` ${arrow} ${cat.name}`;

    if (isSelected) {
      const padded = headerText.padEnd(width);
      fgBg(term, themeColors.canvas, themeColors.accent, padded);
    } else {
      fg(term, themeColors.accent, headerText);
      fg(term, themeColors.textMuted, " ".repeat(Math.max(0, width - headerText.length)));
    }
    term.styleReset();
  }

  renderField(term: Terminal, row: RowInfo, isSelected: boolean, isEditing: boolean, width: number, config: ConfigData): void {
    const field = row.field!;
    const cat = OPTION_CATEGORIES[row.catIdx]!;
    const data = cat.getter(config);
    const keyStr = ` ${field.key}`.padEnd(KEY_COL_WIDTH);

    if (isEditing && this._edit) {
      const value = this._edit.text;
      fg(term, themeColors.warning, keyStr);
      fg(term, themeColors.selected, value);
      fg(term, themeColors.textMuted, " ".repeat(Math.max(0, width - KEY_COL_WIDTH - value.length)));
    } else {
      const value = formatFieldValue(field, data?.[field.key]);

      let extra = "";
      if (isSelected && field.type === "boolean") {
        extra = " (toggle)";
      }

      const descSpace = Math.max(0, width - KEY_COL_WIDTH - value.length - extra.length - 2);
      const desc = descSpace > 0 ? field.description.substring(0, descSpace) : "";

      if (isSelected) {
        term.bold();
        fg(term, themeColors.accent, keyStr);
        term.styleReset();
        fg(term, themeColors.text, value);
        fg(term, themeColors.textMuted, extra + (desc ? "  " + desc : ""));
      } else {
        fg(term, themeColors.textMuted, keyStr);
        fg(term, themeColors.text, value);
        fg(term, themeColors.textMuted, desc ? "  " + desc : "");
      }

      const drawn = KEY_COL_WIDTH + value.length + extra.length + (desc ? 2 + desc.length : 0);
      fg(term, themeColors.textMuted, " ".repeat(Math.max(0, width - drawn)));
    }
    term.styleReset();
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

  toggleBoolean(row: RowInfo): void {
    if (row.type !== "field" || !row.field || !this._ctx) return;
    const config = this._ctx.getConfig();
    const cat = OPTION_CATEGORIES[row.catIdx]!;
    const data = cat.getter(config);
    const current = data[row.field.key];
    const values = { [row.field.key]: current === true ? false : true };
    cat.setter(config, values);
    this.saveAndMessage(config, row.field);
  }

  startEdit(row: RowInfo): void {
    if (row.type !== "field" || !row.field || !this._ctx) return;
    const config = this._ctx.getConfig();
    const cat = OPTION_CATEGORIES[row.catIdx]!;
    const data = cat.getter(config);
    const editValue = formatForEdit(row.field, data?.[row.field.key]);
    this._edit = {
      row: this._selectedIndex,
      catIdx: row.catIdx,
      field: row.field,
      originalValue: data?.[row.field.key],
      text: editValue,
      cursor: editValue.length,
    };
    focusManager.activateTextInput(true);
    this.term(CURSOR_SHOW);
    this.markDirty();
  }

  commitEdit(): void {
    if (!this._edit || !this._ctx) return;
    const { catIdx, field, text } = this._edit;
    const config = this._ctx.getConfig();
    const cat = OPTION_CATEGORIES[catIdx]!;
    const data = cat.getter(config);

    const parsed = parseValue(field.type, text);
    const changed = data[field.key] !== parsed;
    cat.setter(config, { [field.key]: parsed });

    this._edit = null;
    focusManager.activateTextInput(false);
    this.term(CURSOR_HIDE);

    if (changed) {
      this.saveAndMessage(config, field);
    }

    this.markDirty();
  }

  cancelEdit(): void {
    if (!this._edit || !this._ctx) return;
    const { catIdx, field, originalValue } = this._edit;
    const config = this._ctx.getConfig();
    const cat = OPTION_CATEGORIES[catIdx]!;
    cat.setter(config, { [field.key]: originalValue });
    this._edit = null;
    focusManager.activateTextInput(false);
    this.term(CURSOR_HIDE);
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

  saveAndMessage(config: ConfigData, field: OptionFieldDef): void {
    try {
      saveConfig(config);
      this._ctx?.setConfig(config);
      this._ctx?.showMessage(`Saved ${field.key}`);
    } catch (e) {
      this._ctx?.showMessage(`Error saving: ${e}`);
    }
  }

  markDirty(): void {
    super.markDirty();
    this._ctx?.scheduleRender();
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
}
