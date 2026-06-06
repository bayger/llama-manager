import { Column } from "../ui/Layout.js";
import { ButtonBar } from "../ui/widgets/ButtonBar.js";
import { Button } from "../ui/widgets/Button.js";
import { themeColors, fg, termWidth, renderLine, renderDivider } from "../../lib/theme.js";
import { saveConfig } from "../../lib/config.js";
import type { ConfigData } from "../../lib/config.js";
import type { TabContext } from "../../lib/tabcontext.js";
import type { RenderContext, Size } from "../ui/types.js";

type FieldType = "string" | "number" | "boolean" | "password";

interface OptionField {
  key: string;
  label: string;
  type: FieldType;
  section: string;
  configPath?: string[];
  default?: unknown;
  description: string;
}

const FIELDS: OptionField[] = [
  {
    key: "hfToken",
    label: "HF Token",
    type: "password",
    section: "Credentials",
    default: null,
    description: "HuggingFace API token for model downloads",
  },
  {
    key: "versionsDir",
    label: "Versions Dir",
    type: "string",
    section: "Paths",
    default: null,
    description: "Custom directory for llama.cpp version binaries",
  },
  {
    key: "modelsDir",
    label: "Models Dir",
    type: "string",
    section: "Paths",
    default: null,
    description: "Custom directory for downloaded models",
  },
  {
    key: "tasksFile",
    label: "Tasks File",
    type: "string",
    section: "Paths",
    default: null,
    description: "Custom path for tasks JSONL file",
  },
  {
    key: "pollIntervalMs",
    label: "Poll Interval",
    type: "number",
    section: "Dashboard",
    configPath: ["dashboard", "pollIntervalMs"],
    default: 2000,
    description: "Dashboard polling interval in milliseconds",
  },
  {
    key: "killServerOnExit",
    label: "Kill Server on Exit",
    type: "boolean",
    section: "Dashboard",
    configPath: ["dashboard", "killServerOnExit"],
    default: false,
    description: "Automatically kill server when exiting the app",
  },
  {
    key: "maxStored",
    label: "Max Stored Tasks",
    type: "number",
    section: "Tasks",
    configPath: ["tasks", "maxStored"],
    default: 10000,
    description: "Maximum number of tasks to store in history",
  },
  {
    key: "autoParse",
    label: "Auto Parse Tasks",
    type: "boolean",
    section: "Tasks",
    configPath: ["tasks", "autoParse"],
    default: true,
    description: "Automatically parse task results on completion",
  },
];

function formatValue(value: unknown, type: FieldType): string {
  if (value === null || value === undefined) return "";
  if (type === "boolean") return value ? "on" : "off";
  if (type === "password" && value) return `●●●●●●${String(value).slice(-4)}`;
  return String(value);
}

function getValue(config: ConfigData, field: OptionField): unknown {
  if (field.configPath && field.configPath.length > 0) {
    let obj: unknown = config;
    for (const key of field.configPath) {
      if (obj && typeof obj === "object" && key in obj) {
        obj = (obj as Record<string, unknown>)[key];
      }
      else {
        return field.default;
      }
    }
    return obj;
  }
  return (config as unknown as Record<string, unknown>)[field.key] ?? field.default;
}

function setValue(config: ConfigData, field: OptionField, value: unknown): ConfigData {
  if (field.configPath && field.configPath.length > 0) {
    const newConfig = JSON.parse(JSON.stringify(config));
    let obj: Record<string, unknown> = newConfig;
    for (let i = 0; i < field.configPath.length - 1; i++) {
      obj[field.configPath[i]] = obj[field.configPath[i]] || {};
      obj = obj[field.configPath[i]] as Record<string, unknown>;
    }
    obj[field.configPath[field.configPath.length - 1]] = value;
    return newConfig;
  }
  return { ...config, [field.key]: value };
}

export class OptionsControl extends Column {
  protected _ctx: TabContext | null = null;
  protected _selectedIndex = 0;
  protected _focusArea: "buttons" | "form" = "buttons";
  protected _buttonBar: ButtonBar;
  protected _editMode = false;
  protected _editValue = "";

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;
    this._buttonBar = new ButtonBar();
    this._buttonBar.add(new Button({ label: "Reset", action: () => this._onReset() }));
    this._buttonBar.add(new Button({ label: "Save All", action: () => this._onSaveAll() }));
  }

  attach(renderContext: RenderContext): void {
    super.attach(renderContext);
    this._buttonBar.attach(renderContext);
  }

  detach(): void {
    this._buttonBar.detach();
    super.detach();
  }

  measure(_parentSize?: Size): Size {
    return { width: _parentSize?.width || 80, height: _parentSize?.height || 20 };
  }

  focus(): void {
    super.focus();
    if (this._focusArea === "buttons") {
      this._buttonBar.focus();
    }
  }

  render(): void {
    if (!this.visible || !this.needsRender || !this._ctx) return;
    const term = this.term;
    const config = this._ctx.getConfig();

    if (!config) {
      renderLine(term, this.rect.y, () => {
        fg(term, themeColors.textMuted, "Loading config...");
      });
      this.needsRender = false;
      return;
    }

    let y = this.rect.y;
    y = this._renderHeader(term, y);
    y = this._renderButtons(term, y);
    renderDivider(term, y++, themeColors.border);
    y = this._renderForm(term, config, y);
    y = this._renderHelp(term, y);

    this.needsRender = false;
  }

  handleKey(key: string): boolean {
    if (this._editMode) {
      return this._handleEditModeKey(key);
    }

    if (this._focusArea === "buttons") {
      return this._handleButtonsKey(key);
    }

    return this._handleFormKey(key);
  }

  handleChar(char: string): boolean {
    if (this._editMode && char.length === 1) {
      this._editValue += char;
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    return false;
  }

  // — Edit mode —

  _handleEditModeKey(key: string): boolean {
    if (key === "RETURN" || key === "ENTER") {
      this._submitEdit();
      return true;
    }
    if (key === "ESC" || key === "CTRL_C") {
      this._cancelEdit();
      return true;
    }
    if (key === "BACKSPACE" || key === "DEL") {
      this._editValue = this._editValue.slice(0, -1);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "TAB") {
      return true;
    }
    if (key === "SPACE") {
      this._editValue += key;
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    return true;
  }

  _submitEdit(): void {
    const field = FIELDS[this._selectedIndex];
    if (!field) {
      this._cancelEdit();
      return;
    }

    let parsed: unknown = this._editValue;
    if (field.type === "number") {
      const num = Number(this._editValue);
      if (isNaN(num)) {
        this._ctx?.showMessage("Invalid number");
        return;
      }
      parsed = num;
    }

    this._saveField(field, parsed);
    this._cancelEdit();
  }

  _cancelEdit(): void {
    this._editMode = false;
    this._editValue = "";
    this._ctx?.setTextInputFocused(false);
    this.markDirty();
    this._ctx?.scheduleRender();
  }

  // — Buttons —

  _updateButtons(): void {
    const buttons = this._buttonBar.getButtons();
    buttons[0].disabled = false;
    buttons[1].disabled = false;
  }

  _onReset(): void {
    const field = FIELDS[this._selectedIndex];
    if (field) {
      this._saveField(field, field.default);
    }
  }

  _onSaveAll(): void {
    this._ctx?.showMessage("All changes are saved automatically");
  }

  _handleButtonsKey(key: string): boolean {
    if (key === "DOWN") {
      this._focusArea = "form";
      this._buttonBar.blur();
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    const handled = this._buttonBar.handleKey(key);
    if (handled) {
      this.markDirty();
      this._ctx?.scheduleRender();
    }
    return handled;
  }

  // — Form —

  _handleFormKey(key: string): boolean {
    if (key === "UP") {
      if (this._selectedIndex === 0) {
        this._focusArea = "buttons";
        this._buttonBar.focus();
        this.markDirty();
        this._ctx?.scheduleRender();
        return true;
      }
      this._selectedIndex = Math.max(0, this._selectedIndex - 1);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "k") {
      this._selectedIndex = Math.max(0, this._selectedIndex - 1);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "j" || key === "DOWN") {
      this._selectedIndex = Math.min(FIELDS.length - 1, this._selectedIndex + 1);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "RETURN" || key === "ENTER") {
      this._handleFormEnter();
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    return true;
  }

  _handleFormEnter(): void {
    const field = FIELDS[this._selectedIndex];
    if (!field) return;

    if (field.type === "boolean") {
      const config = this._ctx?.getConfig();
      if (!config) return;
      const current = getValue(config, field) as boolean;
      this._saveField(field, !current);
    } else {
      const config = this._ctx?.getConfig();
      const current = config ? getValue(config, field) : undefined;
      this._editMode = true;
      this._editValue = current !== null && current !== undefined ? String(current) : "";
      this._ctx?.setTextInputFocused(true);
    }
  }

  _saveField(field: OptionField, value: unknown): void {
    const config = this._ctx?.getConfig();
    if (!config) return;

    const updated = setValue(config, field, value);
    Object.assign(config, updated);
    if (field.configPath) {
      let obj: Record<string, unknown> = config;
      for (let i = 0; i < field.configPath.length - 1; i++) {
        obj[field.configPath[i]] = obj[field.configPath[i]] || {};
        obj = obj[field.configPath[i]] as Record<string, unknown>;
      }
      obj[field.configPath[field.configPath.length - 1]] = value;
    }
    saveConfig(config)
      .then(() => {
        this._ctx?.showMessage(`Saved ${field.label}`);
        this.markDirty();
        this._ctx?.scheduleRender();
      })
      .catch((e: any) => {
        this._ctx?.showMessage(`Failed to save: ${e}`);
      });
  }

  // — Rendering —

  _renderHeader(term: any, startY: number): number {
    const w = termWidth(term);
    const title = `  Options │ ${FIELDS.length} settings`;

    let y = startY;
    renderLine(term, y++, () => {
      term.bold();
      fg(term, themeColors.text, title);
      term.styleReset();
      term(" ".repeat(Math.max(0, w - title.length)));
    });
    renderDivider(term, y++, themeColors.border);
    return y;
  }

  _renderButtons(term: any, startY: number): number {
    this._updateButtons();
    const buttons = this._buttonBar.getButtons();
    let totalWidth = 0;
    for (let i = 0; i < buttons.length; i++) {
      totalWidth += buttons[i]!.label.length + 4;
      if (i < buttons.length - 1) totalWidth += 2;
    }
    const rect = { x: 0, y: startY, width: totalWidth, height: 1 };
    this._buttonBar.rect = rect;
    this._buttonBar.onLayout();
    this._buttonBar.needsRender = true;
    this._buttonBar.render();
    return startY + 1;
  }

  _renderForm(term: any, config: ConfigData, startY: number): number {
    let y = startY;
    let lastSection = "";

    for (let i = 0; i < FIELDS.length; i++) {
      const field = FIELDS[i];

      if (field.section !== lastSection) {
        if (lastSection !== "") {
          renderLine(term, y++, () => {});
        }
        renderLine(term, y++, () => {
          term.bold();
          fg(term, themeColors.accent, ` ${field.section}`);
          term.styleReset();
        });
        lastSection = field.section;
      }

      y = this._renderField(term, field, config, i, y);
    }

    return y;
  }

  _renderField(term: any, field: OptionField, config: ConfigData, index: number, startY: number): number {
    const isSelected = index === this._selectedIndex && this._focusArea === "form" && !this._editMode;
    const isEditing = this._editMode && index === this._selectedIndex;
    const value = getValue(config, field);
    const formatted = formatValue(value, field.type);
    const isDefault = value === field.default;

    let y = startY;

    renderLine(term, y++, () => {
      if (isEditing) {
        term.bold();
        fg(term, themeColors.success, "\u25c8 ");
        fg(term, themeColors.text, field.label);
        fg(term, themeColors.selected, ` ${this._editValue}`);
        term.styleReset();
      } else if (isSelected) {
        term.bold();
        fg(term, themeColors.success, "\u25c8 ");
        fg(term, themeColors.text, field.label);
        term(" ");

        if (isDefault) {
          fg(term, themeColors.textMuted, formatted || `(<${field.default === null ? "null" : String(field.default)}>)`);
        }
        else {
          fg(term, themeColors.success, formatted);
        }

        term(" ");
        fg(term, themeColors.textMuted, field.type === "boolean" ? "[toggle]" : "[edit]");
        term.styleReset();
      }
      else {
        fg(term, themeColors.textMuted, "  ");
        fg(term, themeColors.text, field.label);
        term(" ");

        if (isDefault) {
          fg(term, themeColors.textMuted, formatted || `(<${field.default === null ? "null" : String(field.default)}>)`);
        }
        else {
          fg(term, themeColors.success, formatted);
        }
      }
    });

    if (isSelected) {
      renderLine(term, y++, () => {
        fg(term, themeColors.textMuted, `    ${field.description} | default: ${field.default ?? "<none>"}`);
      });
    }

    return y;
  }

  _renderHelp(term: any, startY: number): number {
    let hint = "";

    if (this._editMode) {
      hint = ` Value: ${this._editValue} │ Enter confirm │ Ctrl+C cancel `;
    } else if (this._focusArea === "buttons") {
      hint = " h/l navigate │ Enter execute │ DOWN to list ";
    } else {
      hint = " j/k navigate │ UP to actions │ Enter edit/toggle ";
    }

    renderLine(term, startY++, () => {});

    const width = termWidth(term);
    const left = Math.floor((width - 2 - hint.length) / 2);

    renderLine(term, startY, () => {
      term(" ".repeat(left));
      fg(term, themeColors.textMuted, hint);
    });

    return startY + 1;
  }

  onDetach(): void {
    this._selectedIndex = 0;
    this._focusArea = "buttons";
    this._editMode = false;
    this._editValue = "";
  }
}

export function createOptionsTab(ctx: TabContext) {
  return new OptionsControl(ctx);
}
