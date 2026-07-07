import { fg, fgBg, setActiveTheme, getThemeNames, setThemeMode, themeHasLightVariant, getThemeMode } from "../../lib/theme";
import { focusManager } from "../../framework/FocusManager";
import { ConfigData, saveConfig } from "../../lib/config";
import { getInstallableForks } from "../../lib/forks";
import type { TabContext } from "../../lib/tabcontext";
import type { RenderContext } from "../../framework/types";
import { EditableList, EditableRowInfo, formatFieldValue } from "./EditableList";
import { createThemeSelectorModal } from "./ThemeSelectorModal";

const KEY_COL_WIDTH = 22;

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
    name: "Forks",
    fields: [
      { key: "defaultFork", type: "string", default: "llama.cpp", description: "Default fork for installs (Enter to cycle)" },
    ],
    getter: (config) => ({
      defaultFork: config.defaultFork,
    }),
    setter: (config, values) => {
      if (values.defaultFork !== undefined) {
        config.defaultFork = values.defaultFork as string;
      }
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
  {
    name: "Updates",
    fields: [
      { key: "checkOnStartup", type: "boolean", default: true, description: "Check for updates on startup" },
    ],
    getter: (config) => ({
      checkOnStartup: config.updates.checkOnStartup,
    }),
    setter: (config, values) => {
      if (values.checkOnStartup !== undefined) {
        config.updates.checkOnStartup = values.checkOnStartup as boolean;
      }
    },
  },
];

export class OptionsPanel extends EditableList {
  protected _ctx: TabContext | null = null;
  protected _themePickerOriginal = "";

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;
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

  protected drawHeader(canvas: NonNullable<RenderContext["canvas"]>, row: EditableRowInfo, isHighlighted: boolean, width: number): void {
    const cat = OPTION_CATEGORIES[row.catIdx]!;
    const arrow = this._collapsed.has(row.catIdx) ? "\u25b6" : "\u25bc";
    const headerText = ` ${arrow} ${cat.name}`;
    const fgColor = isHighlighted ? (this.focused ? "canvas" : "accent") : "accent";
    const bgColor = this.focused ? (isHighlighted ? "selectionBg" : "surface") : "surface";

    const padded = headerText.padEnd(width);
    if (isHighlighted) {
      canvas.bold(true);
      fgBg(canvas, fgColor, bgColor, padded);
      canvas.bold(false);
    } else {
      fgBg(canvas, fgColor, bgColor, padded);
    }
  }

  protected drawField(canvas: NonNullable<RenderContext["canvas"]>, row: EditableRowInfo, isHighlighted: boolean, isEditing: boolean, width: number): void {
    const field = row.field!;
    const cat = OPTION_CATEGORIES[row.catIdx]!;
    const config = this._ctx?.getConfig();
    const data = config ? cat.getter(config) : {};
    const keyStr = ` ${field.key}`.padEnd(KEY_COL_WIDTH);

    if (isEditing && this._edit) {
      const value = this._edit.text;
      fgBg(canvas, "warning", "surface", keyStr);
      fgBg(canvas, "accent", "canvas", value);
    } else {
      let value = formatFieldValue(field, data?.[field.key]);
      if (field.key === "hfToken" && value !== "(null)") {
        value = "•".repeat(Math.min(value.length, 16));
      }

      let extra = "";
      if (isHighlighted && (field.type === "boolean" || field.type === "enum")) {
        extra = " (toggle)";
      }

      const descSpace = Math.max(0, width - KEY_COL_WIDTH - value.length - extra.length - 2);
      const desc = descSpace > 0 && field.description ? field.description.substring(0, descSpace) : "";

      const fgColor = isHighlighted ? (this.focused ? "canvas" : "text") : "text";
      const fgMutedColor = isHighlighted ? "canvas" : "textMuted";
      const bgColor = this.focused ? (isHighlighted ? "selectionBg" : "surface") : "surface";
      const content = keyStr + value + extra + (desc ? "  " + desc : "");

      if (isHighlighted) {
        canvas.bold(true);
        fgBg(canvas, fgColor, bgColor, content.substring(0, width));
        canvas.bold(false);
      } else {
        fgBg(canvas, fgMutedColor, bgColor, keyStr);
        fgBg(canvas, fgColor, bgColor, value);
        fgBg(canvas, fgMutedColor, bgColor, desc ? "  " + desc : "");
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

  // --- Override: theme selector modal + themeName special case ---

  handleKey(key: string): boolean {
    // Intercept Enter on themeName to open modal instead of edit
    if ((key === "RETURN" || key === "ENTER") && !this._edit) {
      const row = this._rows[this._selectedIndex];
      if (row?.type === "field" && row.field?.key === "themeName") {
        this.openThemeSelector();
        return true;
      }
      if (row?.type === "field" && row.field?.key === "defaultFork") {
        this.cycleDefaultFork(row);
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

  // --- Theme selector modal ---

  openThemeSelector(): void {
    if (!this._ctx) return;
    const config = this._ctx.getConfig();
    if (!config) return;
    this._themePickerOriginal = config.themeName;
    createThemeSelectorModal(config.themeName).then((result) => {
      if (result) {
        const cfg = this._ctx?.getConfig();
        if (cfg) {
          cfg.themeName = result;
          cfg.themeMode = getThemeMode();
          saveConfig(cfg);
        }
        this._ctx?.forceRender();
        this.markDirty();
      }
    });
  }

  cycleDefaultFork(row: EditableRowInfo): void {
    if (!this._ctx) return;
    const config = this._ctx.getConfig();
    if (!config) return;
    const forks = getInstallableForks();
    const currentIdx = forks.findIndex(f => f.id === config.defaultFork);
    const nextIdx = (currentIdx + 1) % forks.length;
    config.defaultFork = forks[nextIdx]!.id;
    this.saveAndMessage();
    this._ctx?.forceRender();
    this.markDirty();
  }
}
