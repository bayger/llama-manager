import { fg, fgBg } from "../../lib/theme";
import {
  PRESET_CATEGORIES,
  ConfigData,
  PresetFieldDef,
  ServerPresets,
  saveConfig,
} from "../../lib/config";
import type { RenderContext } from "../ui/types";
import { EditableList, EditableRowInfo, formatFieldValue } from "./EditableList";

const KEY_COL_WIDTH = 18;

export class SettingsPanel extends EditableList {
  protected _config: ConfigData | null = null;
  protected _advancedMode = false;
  protected _onMessage: ((msg: string) => void) | null = null;
  protected _onEscape: (() => void) | null = null;

  setMessageCallback(cb: (msg: string) => void): void {
    this._onMessage = cb;
  }

  setOnEscape(cb: () => void): void {
    this._onEscape = cb;
  }

  setConfig(config: ConfigData): void {
    this._config = config;
    this._edit = null;
    this.buildRows();
    this.clampSelection();
    this.markDirty();
  }

  setAdvancedMode(advanced: boolean): void {
    if (this._advancedMode !== advanced) {
      this._advancedMode = advanced;
      this.buildRows();
      this.clampSelection();
      this.markDirty();
    }
  }

  // --- Abstract implementations ---

  protected buildRows(): void {
    this._rows = [];
    if (!this._config) return;
    const presets = this._config.server.profiles[this._config.server.activeProfile]?.presets;
    if (!presets) return;

    for (let catIdx = 0; catIdx < PRESET_CATEGORIES.length; catIdx++) {
      const cat = PRESET_CATEGORIES[catIdx]!;
      const catHasVisible = cat.fields.some(f => !f.advanced || this._advancedMode);
      if (!catHasVisible) continue;

      this._rows.push({ type: "header", catIdx });
      if (!this._collapsed.has(catIdx)) {
        for (let fIdx = 0; fIdx < cat.fields.length; fIdx++) {
          const field = cat.fields[fIdx]!;
          if (field.advanced && !this._advancedMode) continue;
          this._rows.push({ type: "field", catIdx, fieldIdx: fIdx, field });
        }
      }
    }
  }

  protected getRowValue(row: EditableRowInfo): unknown {
    if (row.type !== "field" || !row.field || !this._config) return undefined;
    const presets = this._config.server.profiles[this._config.server.activeProfile]?.presets;
    const presetData = presets?.[PRESET_CATEGORIES[row.catIdx]!.presetKey];
    return presetData?.[row.field.key];
  }

  protected setRowValue(row: EditableRowInfo, value: unknown): void {
    if (row.type !== "field" || !row.field || !this._config) return;
    const presets = this._config.server.profiles[this._config.server.activeProfile]?.presets;
    const presetData = presets?.[PRESET_CATEGORIES[row.catIdx]!.presetKey];
    if (presetData) {
      presetData[row.field.key] = value;
    }
  }

  protected getKeyColWidth(): number {
    return KEY_COL_WIDTH;
  }

  protected drawHeader(canvas: NonNullable<RenderContext["canvas"]>, row: EditableRowInfo, isSelected: boolean, width: number): void {
    const cat = PRESET_CATEGORIES[row.catIdx]!;
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
    const cat = PRESET_CATEGORIES[row.catIdx]!;
    const presets = this._config?.server.profiles[this._config?.server.activeProfile]?.presets;
    const presetData = presets?.[cat.presetKey];
    const keyStr = ` ${field.key}`.padEnd(KEY_COL_WIDTH);

    if (isEditing && this._edit) {
      const value = this._edit.text;
      fgBg(canvas, "warning", "canvasSubtle", keyStr);
      fgBg(canvas, "selected", "canvas", value);
    } else {
      const value = formatFieldValue(field, presetData?.[field.key]);

      let extra = "";
      if (isSelected && field.type === "boolean") {
        extra = " (toggle)";
      } else if (isSelected && field.type === "enum" && field.options) {
        extra = ` [${field.options.join(" | ")}]`;
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
    if (!this._config) return;
    try {
      saveConfig(this._config);
    } catch (e) {
      this._onMessage?.(`Error saving: ${e}`);
    }
  }

  // --- Override for escape callback ---

  handleKey(key: string): boolean {
    if (key === "ESCAPE") {
      if (this._edit) {
        this.commitEdit();
      }
      this._onEscape?.();
      return true;
    }
    return super.handleKey(key);
  }
}
