import type { Terminal } from "terminal-kit";
import type { TabContext } from "../../lib/tabcontext.js";
import { themeColors, fg, termWidth, renderBox, renderLine, renderDivider } from "../../lib/theme.js";
import { saveConfig } from "../../lib/config.js";
import type { ConfigData } from "../../lib/config.js";

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

interface OptionsState {
  selectedIndex: number;
  editMode: boolean;
  editValue: string;
}

function renderHeader(term: Terminal, startY: number): number {
  const w = termWidth(term);
  const left = " Options ";
  const mid = ` ${FIELDS.length} settings `;
  const right = " j/k navigate | Enter edit/toggle ";
  const sep = " ";
  const contentLen = left.length + mid.length + right.length + sep.length * 2;
  const pad = Math.max(0, w - contentLen + 2);

  renderLine(term, startY, () => {
    fg(term, themeColors.text, left + mid + sep + right);
    term(" ".repeat(pad));
  });

  renderDivider(term, startY + 1, themeColors.border);

  return startY + 2;
}

function renderField(term: Terminal, field: OptionField, config: ConfigData, index: number, selectedIndex: number, startY: number): number {
  const isSelected = index === selectedIndex;
  const value = getValue(config, field);
  const formatted = formatValue(value, field.type);
  const isDefault = value === field.default;
  const actionLabel = field.type === "boolean" ? "[toggle]" : "[edit]";

  let y = startY;

  renderLine(term, y++, () => {
    if (isSelected) {
      term.bold();
      fg(term, themeColors.selected, "▸ ");
    }
    else {
      fg(term, themeColors.text, "  ");
    }

    fg(term, themeColors.text, field.label);
    term(" ");

    if (isDefault) {
      fg(term, themeColors.textMuted, formatted || `<${field.default === null ? "null" : String(field.default)}> `);
    }
    else {
      fg(term, themeColors.success, formatted + " ");
    }

    fg(term, themeColors.textMuted, actionLabel);

    if (isSelected) {
      term.styleReset();
    }
  });

  if (isSelected) {
    renderLine(term, y++, () => {
      fg(term, themeColors.textMuted, "    ");
      fg(term, themeColors.textMuted, field.description);
      term(" | default: ");
      fg(term, themeColors.textMuted, String(field.default ?? "<none>"));
    });
  }

  return y;
}

function renderEditMode(term: Terminal, field: OptionField, editValue: string, startY: number): number {
  renderLine(term, startY, () => {
    fg(term, themeColors.warning, `  Editing ${field.label}: `);
    fg(term, themeColors.text, editValue);
  });
  return startY + 1;
}

export function createOptionsTab(ctx: TabContext) {
  const state: OptionsState = {
    selectedIndex: 0,
    editMode: false,
    editValue: "",
  };

  function saveCurrentConfig(field: OptionField, value: unknown): void {
    const config = ctx.getConfig();
    if (!config) return;

    const updated = setValue(config, field, value);
    saveConfig(updated).then(() => {
      ctx.showMessage(`Saved ${field.label}`);
    }).catch((e) => {
      ctx.showMessage(`Failed to save: ${e}`);
    });
  }

  return {
    render: (): void => {
      const term = ctx.term;
      const config = ctx.getConfig();

      if (!config) {
        fg(term, themeColors.textMuted, "Loading config...\n");
        return;
      }

      let y = 3;

      y = renderHeader(term, y);
      y++;

      let lastSection = "";
      for (let i = 0; i < FIELDS.length; i++) {
        const field = FIELDS[i];

        if (field.section !== lastSection) {
          if (lastSection !== "") {
            y++;
          }
          renderLine(term, y++, () => {
            term.bold();
            fg(term, themeColors.accent, field.section);
            term.styleReset();
          });
          lastSection = field.section;
        }

        y = renderField(term, field, config, i, state.selectedIndex, y);
      }

      if (state.editMode) {
        y++;
        const field = FIELDS[state.selectedIndex];
        if (field) {
          y = renderEditMode(term, field, state.editValue, y);
        }
      }
    },

    handleKey: (key: string): boolean => {
      const config = ctx.getConfig();

      if (state.editMode) {
        if (key === "RETURN") {
          const field = FIELDS[state.selectedIndex];
          if (!field || !config) {
            state.editMode = false;
            state.editValue = "";
            ctx.setTextInputFocused(false);
            return true;
          }

          let parsed: unknown = state.editValue;
          if (field.type === "number") {
            const num = Number(state.editValue);
            if (isNaN(num)) {
              ctx.showMessage("Invalid number");
              return true;
            }
            parsed = num;
          }

          saveCurrentConfig(field, parsed);
          state.editMode = false;
          state.editValue = "";
          ctx.setTextInputFocused(false);
          return true;
        }
        else if (key === "CTRL_C" || key === "ESC") {
          state.editMode = false;
          state.editValue = "";
          ctx.setTextInputFocused(false);
          return true;
        }
        else if (key === "BACKSPACE" || key === "DEL") {
          state.editValue = state.editValue.slice(0, -1);
          return true;
        }
        else if (key.length === 1) {
          state.editValue += key;
          return true;
        }
        return true;
      }

      if (key === "j" || key === "DOWN") {
        state.selectedIndex = Math.min(state.selectedIndex + 1, FIELDS.length - 1);
        return true;
      }
      if (key === "k" || key === "UP") {
        state.selectedIndex = Math.max(state.selectedIndex - 1, 0);
        return true;
      }
      if (key === "RETURN") {
        const field = FIELDS[state.selectedIndex];
        if (!field || !config) return false;

        if (field.type === "boolean") {
          const current = getValue(config, field) as boolean;
          saveCurrentConfig(field, !current);
          return true;
        }
        else {
          state.editMode = true;
          const current = getValue(config, field);
          state.editValue = current !== null && current !== undefined ? String(current) : "";
          ctx.setTextInputFocused(true);
          return true;
        }
      }

      return false;
    },

    dispose: (): void => {
      state.selectedIndex = 0;
      state.editMode = false;
      state.editValue = "";
    },
  };
}
