#!/usr/bin/env node
import { Control } from "../ui/Control.js";
import { Column, Row } from "../ui/Layout.js";
import { Button } from "../ui/widgets/Button.js";
import { Spacer } from "../ui/widgets/Spacer.js";
import { TextInput } from "../ui/widgets/TextInput.js";
import { SettingsPanel } from "../specialized/SettingsPanel.js";
import { ProfileList } from "../specialized/ProfileList.js";
import { StyledText } from "../ui/widgets/StyledText.js";
import { focusManager } from "../ui/FocusManager.js";
import { ConfigData, saveConfig } from "../../lib/config.js";
import type { TabContext } from "../../lib/tabcontext.js";
import type { Size } from "../ui/types.js";

export class ServerControl extends Control {
  focusable = true;
  protected _ctx: TabContext | null = null;
  protected _column: Column;
  protected _editRow: Row;
  protected _editInput: TextInput;
  protected _buttonRow: Row;
  protected _buttons: Button[];
  protected _settingsPanel: SettingsPanel;
  protected _profileList: ProfileList;
  protected _summary: StyledText;
  protected _editMode: "create" | "rename" | null = null;
  protected _showingSettings = false;

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;

    this._summary = new StyledText();

    this._editInput = new TextInput();
    this._editInput.placeholder = "Profile name";
    this._editInput.setOnSubmit((value: string) => this.commitProfileEdit(value));
    this._editInput.setOnCancel(() => this.cancelProfileEdit());

    this._editRow = new Row();
    this._editRow.add(this._editInput);
    this._editRow.visible = false;

    this._buttonRow = new Row();
    this._buttons = [
      new Button({ label: "Create" }),
      new Button({ label: "Rename" }),
      new Button({ label: "Delete" }),
    ];
    for (const btn of this._buttons) {
      this._buttonRow.add(btn);
    }

    this._settingsPanel = new SettingsPanel();
    this._settingsPanel.flex = 1;
    this._settingsPanel.visible = false;
    this._settingsPanel.setMessageCallback((msg: string) => {
      this._ctx?.showMessage(msg);
    });
    this._settingsPanel.setOnEscape(() => {
      this.showProfileList();
    });

    this._profileList = new ProfileList();
    this._profileList.flex = 1;
    this._profileList.setSelectCallback((name: string) => {
      this.switchProfile(name);
    });
    this._profileList.setEditCallback(() => {
      this.showSettings();
    });

    this._column = new Column();
    this._column.add(this._summary);
    this._column.add(this._editRow);
    this._column.add(new Spacer());
    this._column.add(this._buttonRow);
    this._column.add(new Spacer());
    this._column.add(this._settingsPanel);
    this._column.add(this._profileList);

    this.add(this._column);
  }

  measure(parentSize?: Size): Size {
    return parentSize ? { width: parentSize.width, height: parentSize.height } : super.measure(parentSize);
  }

  onInit(): void {
    if (!this._ctx) return;

    this._buttons[0]?.setAction(() => {
      this.startProfileEdit("create");
    });

    this._buttons[1]?.setAction(() => {
      this.startProfileEdit("rename");
    });

    this._buttons[2]?.setAction(() => {
      this.deleteProfile();
    });

    this.refreshConfig();
  }

  onDestroy(): void {
    this._ctx = null;
  }

  onFocus(): void {
    super.onFocus();
    if (this._editMode) return;
    if (this._showingSettings) {
      focusManager.setFocus(this._settingsPanel);
    } else {
      focusManager.setFocus(this._profileList);
    }
  }

  refreshConfig(): void {
    const config = this._ctx?.getConfig();
    if (!config) return;

    const count = Object.keys(config.server.profiles).length;
    this._settingsPanel.setConfig(config);
    this._profileList.setConfig(config);
    const isDefault = config.server.activeProfile === "Default";
    this._buttons[1].disabled = isDefault;
    this._buttons[2].disabled = isDefault;
    this._summary.builder
      .muted("Profiles ")
      .accentColor(String(count))
      .muted("  Current ")
      .text(config.server.activeProfile);
    this.markDirty();
  }

  showProfileList(): void {
    this._showingSettings = false;
    this._settingsPanel.visible = false;
    this._profileList.visible = true;
    this._profileList.setConfig(this._ctx?.getConfig() || null);
    focusManager.setFocus(this._profileList);
    this.markDirty();
  }

  showSettings(): void {
    this._showingSettings = true;
    this._settingsPanel.visible = true;
    this._profileList.visible = false;
    this._settingsPanel.setConfig(this._ctx?.getConfig() || null);
    focusManager.setFocus(this._settingsPanel);
    this.markDirty();
  }

  switchProfile(name: string): void {
    const config = this._ctx?.getConfig();
    if (!config) return;

    config.server.activeProfile = name;
    try {
      saveConfig(config);
      this._ctx?.showMessage(`Switched to profile: ${name}`);
    } catch (e) {
      this._ctx?.showMessage(`Error saving: ${e}`);
    }

    this.refreshConfig();
  }

  startProfileEdit(mode: "create" | "rename"): void {
    const config = this._ctx?.getConfig();
    if (!config) return;

    if (mode === "rename" && config.server.activeProfile === "Default") {
      this._ctx?.showMessage("Default profile cannot be renamed");
      return;
    }

    this._editMode = mode;
    this._summary.builder.warning(mode === "create" ? "Create: " : "Rename: ");
    this._editRow.visible = true;
    this._editInput.value = mode === "create" ? "" : config.server.activeProfile;
    this._editInput.cursorPos = mode === "create" ? 0 : config.server.activeProfile.length;
    focusManager.setFocus(this._editInput);
    this.markDirty();
  }

  cancelProfileEdit(): void {
    this._editMode = null;
    this._editRow.visible = false;
    this.refreshConfig();
    const firstEnabled = this._buttons.find(b => !b.disabled);
    if (firstEnabled) {
      focusManager.setFocus(firstEnabled);
    }
    this.markDirty();
  }

  commitProfileEdit(name: string): void {
    const config = this._ctx?.getConfig();
    if (!config || !this._editMode) return;

    name = name.trim();
    if (!name) {
      this._ctx?.showMessage("Profile name cannot be empty");
      this.cancelProfileEdit();
      return;
    }
    if (name === "Default") {
      this._ctx?.showMessage("Cannot use 'Default' as a profile name");
      this.cancelProfileEdit();
      return;
    }
    if (config.server.profiles[name]) {
      this._ctx?.showMessage(`Profile '${name}' already exists`);
      this.cancelProfileEdit();
      return;
    }

    if (this._editMode === "create") {
      const current = config.server.profiles[config.server.activeProfile];
      if (!current) {
        this.cancelProfileEdit();
        return;
      }
      config.server.profiles[name] = JSON.parse(JSON.stringify(current));
      config.server.activeProfile = name;
    } else {
      const current = config.server.profiles[config.server.activeProfile];
      if (!current) {
        this.cancelProfileEdit();
        return;
      }
      config.server.profiles[name] = current;
      delete config.server.profiles[config.server.activeProfile];
      config.server.activeProfile = name;
    }

    try {
      saveConfig(config);
      this._ctx?.showMessage(`${this._editMode === "create" ? "Created" : "Renamed"} profile: ${name}`);
    } catch (e) {
      this._ctx?.showMessage(`Error saving: ${e}`);
    }

    this.cancelProfileEdit();
  }

  deleteProfile(): void {
    const config = this._ctx?.getConfig();
    if (!config) return;

    if (config.server.activeProfile === "Default") {
      this._ctx?.showMessage("Cannot delete Default profile");
      return;
    }

    const profiles = config.server.profiles;
    const keys = Object.keys(profiles);
    if (keys.length <= 1) {
      this._ctx?.showMessage("Cannot delete the only profile");
      return;
    }

    delete profiles[config.server.activeProfile];
    config.server.activeProfile = "Default";

    try {
      saveConfig(config);
      this._ctx?.showMessage("Profile deleted, switched to Default");
    } catch (e) {
      this._ctx?.showMessage(`Error saving: ${e}`);
    }

    this.refreshConfig();
  }
}

export function createServerTab(ctx: TabContext): Control {
  return new ServerControl(ctx);
}
