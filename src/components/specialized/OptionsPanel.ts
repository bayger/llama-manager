import { fg, fgBg, setActiveTheme, getThemeNames, loadTheme, setThemeMode, getThemeMode, themeHasLightVariant } from "../../lib/theme";
import type { Color } from "../../lib/theme";
import { focusManager } from "../ui/FocusManager";
import { Section } from "../ui/widgets/Section";
import { ConfigData, saveConfig } from "../../lib/config";
import type { TabContext } from "../../lib/tabcontext";
import type { Size, RenderContext } from "../ui/types";
import { EditableList, EditableRowInfo, formatFieldValue } from "./EditableList";

const KEY_COL_WIDTH = 22;
const THEME_PICKER_WIDTH = 30;

const V = "\u2502";

class ThemePickerControl extends Section {
  protected _index = 0;
  protected _scroll = 0;

  measure(parentSize: Size): Size {
    return { width: THEME_PICKER_WIDTH, height: parentSize.height };
  }

  setState(index: number, scroll: number): void {
    this._index = index;
    this._scroll = scroll;
    this.markDirty();
  }

  draw(ctx: RenderContext): void {
    const { canvas } = ctx;
    const { x, y, height } = this.rect;
    const names = getThemeNames();

    canvas.moveTo(x, y);
    canvas.bold();
    fg(canvas, "accent", `${V}`);
    fg(canvas, "accent", ` ${this.title}`);

    for (let row = 1; row < height; row++) {
      canvas.moveTo(x, y + row);
      canvas.setForegroundColor("borderMuted");
      canvas.write(V);
    }

    for (let i = 1; i < height; i++) {
      const themeIdx = i - 1 + this._scroll;
      if (themeIdx >= names.length) break;

      canvas.moveTo(x + 2, y + i);
      const name = names[themeIdx]!;
      const isSelected = themeIdx === this._index;
      const resolved = loadTheme(name);

      if (isSelected) {
        fg(canvas, "accent", ">");
        if (resolved) {
          fgBg(canvas, resolved.canvas as Color, resolved.text as Color, "\u2588");
          fgBg(canvas, resolved.text as Color, resolved.canvas as Color, "\u2588");
          fgBg(canvas, resolved.accent as Color, resolved.canvas as Color, "\u2588");
        }
        fg(canvas, "accentColor", ` ${name}`);
      } else {
        fg(canvas, "borderMuted", " ");
        if (resolved) {
          fgBg(canvas, resolved.canvas as Color, resolved.text as Color, "\u2588");
          fgBg(canvas, resolved.text as Color, resolved.canvas as Color, "\u2588");
          fgBg(canvas, resolved.accent as Color, resolved.canvas as Color, "\u2588");
          fg(canvas, "textMuted", ` ${name}`);
        } else {
          fg(canvas, "textMuted", `     ${name}`);
        }
      }
    }
  }
}

export interface OptionFieldDef {
  key: string;
  type: "string" | "number" | "boolean" | "enum";
  default: unknown;
  options?: string[];
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
    name: "Logs",
    fields: [
      { key: "maxLogLines", type: "number", default: 2000, description: "Max lines kept in memory (~0.65 MB per 1k)" },
    ],
    getter: (config) => ({
      maxLogLines: config.logs.maxLogLines,
    }),
    setter: (config, values) => {
      if (values.maxLogLines !== undefined) config.logs.maxLogLines = values.maxLogLines as number;
    },
  },
  {
    name: "Tasks",
    fields: [
      { key: "maxStored", type: "number", default: 10000, description: "Max stored tasks (~0.5 MB per 1k)" },
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
  {
    name: "Appearance",
    fields: [
      { key: "themeMode", type: "enum", default: "dark", options: ["dark", "light"], description: "Theme mode" },
      { key: "themeName", type: "string", default: "opencode", description: "UI theme (Enter to browse themes)" },
    ],
    getter: (config) => ({
      themeMode: config.themeMode,
      themeName: config.themeName,
    }),
    setter: (config, values) => {
      if (values.themeMode !== undefined) {
        const mode = values.themeMode as string;
        if (mode === "dark" || mode === "light") {
          config.themeMode = mode;
          setThemeMode(mode);
        }
      }
      if (values.themeName !== undefined) {
        const name = values.themeName as string;
        if (name && getThemeNames().includes(name)) {
          config.themeName = name;
          setActiveTheme(name);
        }
      }
    },
  },
];

export class OptionsPanel extends EditableList {
  protected _ctx: TabContext | null = null;
  protected _themePickerMode = false;
  protected _themePickerIndex = 0;
  protected _themePickerScroll = 0;
  protected _themePickerOriginal = "";
  protected _themePicker: ThemePickerControl;

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;
    this._themePicker = new ThemePickerControl();
    this._themePicker.title = "THEMES";
    this._themePicker.visible = false;
    this.add(this._themePicker);
    this.buildRows();
    this.clampSelection();
  }

  onDestroy(): void {
    this._ctx = null;
    if (this._edit) {
      this._edit = null;
      focusManager.activateTextInput(false);
    }
  }

  // --- Abstract implementations ---

  protected buildRows(): void {
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

  protected getRowValue(row: EditableRowInfo): unknown {
    if (row.type !== "field" || !row.field || !this._ctx) return undefined;
    const config = this._ctx.getConfig();
    if (!config) return undefined;
    const cat = OPTION_CATEGORIES[row.catIdx]!;
    return cat.getter(config)[row.field.key];
  }

  protected setRowValue(row: EditableRowInfo, value: unknown): void {
    if (row.type !== "field" || !row.field || !this._ctx) return;
    const config = this._ctx?.getConfig();
    if (!config) return;
    OPTION_CATEGORIES[row.catIdx]!.setter(config, { [row.field.key]: value });
    if (row.field.key === "themeMode" && value === "light" && !themeHasLightVariant(config.themeName)) {
      this._ctx?.showMessage(`Warning: "${config.themeName}" has no light variant`);
    }
  }

  protected getKeyColWidth(): number {
    return KEY_COL_WIDTH;
  }

  protected supportsEnumCycling(): boolean {
    return true;
  }

  protected drawHeader(canvas: NonNullable<RenderContext["canvas"]>, row: EditableRowInfo, isSelected: boolean, width: number): void {
    const cat = OPTION_CATEGORIES[row.catIdx]!;
    const arrow = this._collapsed.has(row.catIdx) ? "\u25b6" : "\u25bc";
    const headerText = ` ${arrow} ${cat.name}`;

    if (isSelected) {
      const padded = headerText.padEnd(width);
      fgBg(canvas, "selectedText", "selectedBg", padded);
    } else {
      fgBg(canvas, "accent", "canvasSubtle", headerText);
    }
  }

  protected drawField(canvas: NonNullable<RenderContext["canvas"]>, row: EditableRowInfo, isSelected: boolean, isEditing: boolean, width: number): void {
    const field = row.field!;
    const cat = OPTION_CATEGORIES[row.catIdx]!;
    const config = this._ctx?.getConfig();
    const data = config ? cat.getter(config) : {};
    const keyStr = ` ${field.key}`.padEnd(KEY_COL_WIDTH);

    if (isEditing && this._edit) {
      const value = this._edit.text;
      fgBg(canvas, "warning", "canvasSubtle", keyStr);
      fgBg(canvas, "selected", "canvas", value);
    } else {
      const value = formatFieldValue(field, data?.[field.key]);

      let extra = "";
      if (isSelected && (field.type === "boolean" || field.type === "enum")) {
        extra = " (toggle)";
      }

      const descSpace = Math.max(0, width - KEY_COL_WIDTH - value.length - extra.length - 2);
      const desc = descSpace > 0 && field.description ? field.description.substring(0, descSpace) : "";

      if (isSelected) {
        const padded = (keyStr + value + extra + (desc ? "  " + desc : "")).padEnd(width);
        fgBg(canvas, "selectedText", "selectedBg", padded.substring(0, width));
      } else {
        fgBg(canvas, "textMuted", "canvasSubtle", keyStr);
        fgBg(canvas, "text", "canvasSubtle", value);
        fgBg(canvas, "textMuted", "canvasSubtle", desc ? "  " + desc : "");
      }
    }
  }

  protected saveAndMessage(): void {
    const config = this._ctx?.getConfig();
    if (!config) return;
    try {
      saveConfig(config);
      this._ctx?.setConfig(config);
    } catch (e) {
      this._ctx?.showMessage(`Error saving: ${e}`);
    }
  }

  // --- Theme picker hooks ---

  protected isPickerVisible(): boolean {
    return this._themePickerMode && this.rect.width >= THEME_PICKER_WIDTH + 26;
  }

  protected getDrawWidth(): number {
    return this.isPickerVisible() ? this.rect.width - THEME_PICKER_WIDTH : this.rect.width;
  }

  onLayout(): void {
    super.onLayout();
    const { x, y, width, height } = this.rect;
    if (this.isPickerVisible()) {
      this._themePicker.visible = true;
      this._themePicker.setState(this._themePickerIndex, this._themePickerScroll);
      this._themePicker.layout({ x: x + width - THEME_PICKER_WIDTH, y, width: THEME_PICKER_WIDTH, height });
    } else {
      this._themePicker.visible = false;
    }
  }

  // --- Override: theme picker + themeName special case ---

  handleKey(key: string): boolean {
    if (this._themePickerMode) {
      return this.handleThemePickerKey(key);
    }

    // Intercept Enter on themeName to open picker instead of edit
    if ((key === "RETURN" || key === "ENTER") && !this._edit) {
      const row = this._rows[this._selectedIndex];
      if (row?.type === "field" && row.field?.key === "themeName") {
        this.openThemePicker();
        return true;
      }
    }

    // SPACE cycles enum fields
    if (key === "SPACE") {
      const row = this._rows[this._selectedIndex];
      if (row?.type === "field" && row.field?.type === "enum" && row.field.options) {
        this.cycleEnum(row);
        return true;
      }
    }

    return super.handleKey(key);
  }

  // --- Theme picker ---

  openThemePicker(): void {
    if (!this._ctx) return;
    const config = this._ctx.getConfig();
    if (!config) return;
    this._themePickerOriginal = config.themeName;
    this._themePickerMode = true;
    this._themePickerIndex = 0;
    this._themePickerScroll = 0;
    const names = getThemeNames();
    const idx = names.indexOf(config.themeName);
    if (idx >= 0) this._themePickerIndex = idx;
    this._themePickerScroll = Math.max(0, this._themePickerIndex - Math.floor(this.rect.height / 2));
    this._ctx.forceRender();
    this.markDirty();
  }

  closeThemePicker(cancel: boolean): void {
    if (cancel) {
      setActiveTheme(this._themePickerOriginal);
      const config = this._ctx?.getConfig();
      if (config) config.themeName = this._themePickerOriginal;
    } else {
      const config = this._ctx?.getConfig();
      if (config) saveConfig(config);
    }
    this._themePickerMode = false;
    this._ctx?.forceRender();
    this.markDirty();
  }

  handleThemePickerKey(key: string): boolean {
    const names = getThemeNames();
    const apply = () => {
      const name = names[this._themePickerIndex]!;
      setActiveTheme(name);
      const config = this._ctx?.getConfig();
      if (config) config.themeName = name;
      if (!themeHasLightVariant(name) && getThemeMode() === "light") {
        this._ctx?.showMessage(`Warning: "${name}" has no light variant`);
      }
      this._ctx?.forceRender();
    };
    if (key === "UP" || key === "k") {
      if (this._themePickerIndex > 0) {
        this._themePickerIndex--;
        if (this._themePickerIndex < this._themePickerScroll) {
          this._themePickerScroll = this._themePickerIndex;
        }
        apply();
        return true;
      }
      return false;
    }
    if (key === "DOWN" || key === "j") {
      if (this._themePickerIndex < names.length - 1) {
        this._themePickerIndex++;
        const bottom = this._themePickerScroll + this.rect.height;
        if (this._themePickerIndex >= bottom) {
          this._themePickerScroll = this._themePickerIndex - this.rect.height + 1;
        }
        apply();
        return true;
      }
      return false;
    }
    if (key === "PAGE_UP") {
      this._themePickerIndex = Math.max(0, this._themePickerIndex - this.rect.height);
      this._themePickerScroll = Math.max(0, this._themePickerScroll - this.rect.height);
      apply();
      return true;
    }
    if (key === "PAGE_DOWN") {
      this._themePickerIndex = Math.min(names.length - 1, this._themePickerIndex + this.rect.height);
      this._themePickerScroll = Math.min(names.length - this.rect.height, this._themePickerScroll + this.rect.height);
      apply();
      return true;
    }
    if (key === "HOME") {
      this._themePickerIndex = 0;
      this._themePickerScroll = 0;
      apply();
      return true;
    }
    if (key === "END") {
      this._themePickerIndex = names.length - 1;
      this._themePickerScroll = Math.max(0, names.length - this.rect.height);
      apply();
      return true;
    }
    if (key === "RETURN" || key === "ENTER") {
      this.closeThemePicker(false);
      return true;
    }
    if (key === "ESCAPE") {
      this.closeThemePicker(true);
      return true;
    }
    return false;
  }

  onBlur(): void {
    super.onBlur();
    if (this._themePickerMode) {
      this.closeThemePicker(true);
    }
  }
}
