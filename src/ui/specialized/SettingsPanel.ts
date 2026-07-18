import { fg, fgBg, rowColors, drawEditableHeader, drawEditableField } from "../../lib/theme";
import {
  PRESET_CATEGORIES,
  ConfigData,
  PresetFieldDef,
  ServerPresets,
  saveConfig,
} from "../../lib/config";
import type { RenderContext } from "../../framework/types";
import { EditableList, EditableRowInfo, formatFieldValue } from "./EditableList";
import { createDeviceSelectorModal } from "./DeviceSelectorModal";
import { createMmprojSelectorModal } from "./MmprojSelectorModal";
import { createModelSelectorModal } from "./ModelSelectorModal";
import type { TabContext } from "../../lib/tabcontext";
import { fireAsync } from "../../lib/utils";
import { detectForkFromFolder, isForkCompatibleWithPreset, isFieldCompatibleWithFork } from "../../lib/forks";

const KEY_COL_WIDTH = 18;

interface ModalFieldDef extends PresetFieldDef {
  modal?: boolean;
}

export class SettingsPanel extends EditableList {
  protected _config: ConfigData | null = null;
  protected _advancedMode = false;
  protected _ctx: TabContext | null = null;
  protected _onMessage: ((msg: string) => void) | null = null;
  protected _onEscape: (() => void) | null = null;
  protected _editingProfile: string | null = null;

  setTabContext(ctx: TabContext | null): void {
    this._ctx = ctx;
  }

  setMessageCallback(cb: (msg: string) => void): void {
    this._onMessage = cb;
  }

  setOnEscape(cb: () => void): void {
    this._onEscape = cb;
  }

  setEditingProfile(profile: string | null): void {
    this._editingProfile = profile;
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
    const profileName = this._editingProfile || this._config.server.activeProfile;
    const presets = this._config.server.profiles[profileName]?.presets;
    if (!presets) return;

    const forkId = this._config.activeVersion ? detectForkFromFolder(this._config.activeVersion).id : "llama.cpp";

    for (let catIdx = 0; catIdx < PRESET_CATEGORIES.length; catIdx++) {
      const cat = PRESET_CATEGORIES[catIdx]!;
      if (!isForkCompatibleWithPreset(forkId, cat.presetKey)) continue;
      const catHasVisible = cat.fields.some(f =>
        (!f.advanced || this._advancedMode) && isFieldCompatibleWithFork(forkId, f.key, cat.presetKey),
      );
      if (!catHasVisible) continue;

      this._rows.push({ type: "header", catIdx });
      if (!this._collapsed.has(catIdx)) {
        for (let fIdx = 0; fIdx < cat.fields.length; fIdx++) {
          const field = cat.fields[fIdx]!;
          if (field.advanced && !this._advancedMode) continue;
          if (!isFieldCompatibleWithFork(forkId, field.key, cat.presetKey)) continue;
          this._rows.push({ type: "field", catIdx, fieldIdx: fIdx, field });
        }
      }
    }
  }

  protected getRowValue(row: EditableRowInfo): unknown {
    if (row.type !== "field" || !row.field || !this._config) return undefined;
    const profileName = this._editingProfile || this._config.server.activeProfile;
    const presets = this._config.server.profiles[profileName]?.presets;
    const presetData = presets?.[PRESET_CATEGORIES[row.catIdx]!.presetKey];
    return presetData?.[row.field.key];
  }

  protected setRowValue(row: EditableRowInfo, value: unknown): void {
    if (row.type !== "field" || !row.field || !this._config) return;
    const profileName = this._editingProfile || this._config.server.activeProfile;
    const presets = this._config.server.profiles[profileName]?.presets;
    const presetData = presets?.[PRESET_CATEGORIES[row.catIdx]!.presetKey];
    if (presetData) {
      presetData[row.field.key] = value;
    }
  }

  protected getKeyColWidth(): number {
    return KEY_COL_WIDTH;
  }

  protected drawHeader(canvas: NonNullable<RenderContext["canvas"]>, row: EditableRowInfo, isHighlighted: boolean, width: number): void {
    const cat = PRESET_CATEGORIES[row.catIdx]!;
    drawEditableHeader(canvas, cat.name, this._collapsed.has(row.catIdx), isHighlighted, this.focused, width);
  }

  protected drawField(canvas: NonNullable<RenderContext["canvas"]>, row: EditableRowInfo, isHighlighted: boolean, isEditing: boolean, width: number): void {
    const field = row.field!;
    const cat = PRESET_CATEGORIES[row.catIdx]!;
    const profileName = this._editingProfile || this._config?.server.activeProfile || "";
    const presets = this._config?.server.profiles[profileName]?.presets;
    const presetData = presets?.[cat.presetKey];
    const keyStr = ` ${field.key}`.padEnd(KEY_COL_WIDTH);

    if (isEditing && this._edit) {
      drawEditableField(canvas, keyStr, this._edit.text, "", true, isHighlighted, this.focused, width);
    } else {
      const value = formatFieldValue(field, presetData?.[field.key]);

      let extra = "";
      if (isHighlighted && field.type === "boolean") {
        extra = " (toggle)";
      } else if (isHighlighted && field.type === "enum" && field.options) {
        extra = ` [${field.options.join(" | ")}]`;
      }

      drawEditableField(canvas, keyStr, value, extra, false, isHighlighted, this.focused, width);
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

  // --- Override for escape callback and modal fields ---

  handleKey(key: string): boolean {
    if (key === "ESCAPE") {
      if (this._edit) {
        this.commitEdit();
      }
      this._onEscape?.();
      return true;
    }

    if (key === "RETURN" || key === "ENTER") {
      const row = this._rows[this._selectedIndex];
      if (row && row.type === "field" && row.field && (row.field as ModalFieldDef)?.modal) {
        if (row.field.key === "mmproj") {
          this.openMmprojSelector(row);
        } else if (row.field.key === "model" || row.field.key === "draftModel") {
          this.openModelSelector(row);
        } else {
          this.openDeviceSelector(row);
        }
        return true;
      }
    }

    if (key === "DELETE" && !this._edit) {
      this.restoreDefault();
      return true;
    }

    return super.handleKey(key);
  }

  protected restoreDefault(): void {
    const row = this._rows[this._selectedIndex];
    if (!row || row.type !== "field" || !row.field) return;

    const cat = PRESET_CATEGORIES[row.catIdx]!;
    const fieldDef = cat.fields.find(f => f.key === row.field!.key);
    if (!fieldDef) return;

    this.setRowValue(row, fieldDef.default);
    this.saveAndMessage();
    this._onMessage?.(`Restored ${row.field.key} to default: ${fieldDef.default}`);
    this.markDirty();
  }

  protected openDeviceSelector(row: import("./EditableList").EditableRowInfo): void {
    const config = this._config;
    const ctx = this._ctx;
    if (!config || !ctx) return;
    const field = row.field!;

    fireAsync(async () => {
      const modal = createDeviceSelectorModal(config);
      await modal.scanDevices();
      const result = await ctx.openModal<string | null>(modal);
      if (result !== null) {
        const profileName = this._editingProfile || config.server.activeProfile;
        const presets = config.server.profiles[profileName]?.presets;
        const presetData = presets?.[PRESET_CATEGORIES[row.catIdx]!.presetKey];
        if (presetData) {
          presetData[field.key] = result;
          try {
            saveConfig(config);
            this._onMessage?.(`Set ${field.key} to: ${result}`);
          } catch (e) {
            this._onMessage?.(`Error saving: ${e}`);
          }
        }
      }
    }, ctx);
  }

  protected openMmprojSelector(row: import("./EditableList").EditableRowInfo): void {
    const config = this._config;
    const ctx = this._ctx;
    if (!config || !ctx) return;
    const field = row.field!;

    fireAsync(async () => {
      const modal = createMmprojSelectorModal(config);
      const items = await modal.scanMmprojs();
      const profileName = this._editingProfile || config.server.activeProfile;
      const presets = config.server.profiles[profileName]?.presets;
      const presetData = presets?.[PRESET_CATEGORIES[row.catIdx]!.presetKey];
      const currentMmproj = presetData?.mmproj as string | null;
      modal.setItems(items, currentMmproj);
      modal.title = "Select mmproj file";
      modal.hint = "enter confirm";
      modal.setMinSize(40, 8);
      modal.setMaxSize(80, 22);

      const result = await ctx.openModal<string | null>(modal);
      if (result !== null) {
        if (presetData) {
          presetData[field.key] = result;
          try {
            saveConfig(config);
            this._onMessage?.(`Set ${field.key} to: ${result}`);
          } catch (e) {
            this._onMessage?.(`Error saving: ${e}`);
          }
        }
      }
    }, ctx);
  }

  protected openModelSelector(row: import("./EditableList").EditableRowInfo): void {
    const config = this._config;
    const ctx = this._ctx;
    if (!config || !ctx) return;
    const field = row.field!;

    fireAsync(async () => {
      const modal = createModelSelectorModal(config);
      const items = await modal.scanModels();
      const profileName = this._editingProfile || config.server.activeProfile;
      const presets = config.server.profiles[profileName]?.presets;
      const presetData = presets?.[PRESET_CATEGORIES[row.catIdx]!.presetKey];
      const currentValue = presetData?.[field.key] as string | null;
      modal.setItems(items, currentValue);
      modal.title = "Select model file";
      modal.hint = "enter confirm";
      modal.setMinSize(60, 8);
      modal.setMaxSize(120, 22);

      const result = await ctx.openModal<string | null>(modal);
      if (result !== null) {
        if (presetData) {
          presetData[field.key] = result;
          try {
            saveConfig(config);
            this._onMessage?.(`Set ${field.key} to: ${result}`);
          } catch (e) {
            this._onMessage?.(`Error saving: ${e}`);
          }
        }
      }
    }, ctx);
  }
}
