#!/usr/bin/env node
import { Control } from "../ui/Control";
import { Column, Row } from "../ui/Layout";
import { Button } from "../ui/widgets/Button";
import { Spacer } from "../ui/widgets/Spacer";
import { Section } from "../ui/widgets/Section";
import { Checkbox } from "../ui/widgets/Checkbox";
import { SettingsPanel } from "../specialized/SettingsPanel";
import { ProfileList } from "../specialized/ProfileList";
import { StyledText } from "../ui/widgets/StyledText";
import { focusManager } from "../ui/FocusManager";
import { ConfigData, saveConfig } from "../../lib/config";
import { fireAsync } from "../../lib/utils";
import type { TabContext } from "../../lib/tabcontext";
import type { Size } from "../ui/types";
import { createConfirmDialog } from "../ui/widgets/ConfirmDialog";
import { createInputDialog } from "../ui/widgets/InputDialog";

export class ServerControl extends Control {
  focusable = true;
  protected _ctx: TabContext | null = null;
  protected _column: Column;
  protected _buttonRow: Row;
  protected _buttons: Button[];
  protected _section: Section;
  protected _settingsPanel: SettingsPanel;
  protected _profileList: ProfileList;
  protected _summary: StyledText;
  protected _advancedCheckbox: Checkbox;
  protected _showingSettings = false;

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;

    this._summary = new StyledText();

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

    this._advancedCheckbox = new Checkbox({ label: "Advanced options" });
    this._advancedCheckbox.visible = false;
    this._advancedCheckbox.setAction((checked: boolean) => {
      this._settingsPanel.setAdvancedMode(checked);
    });

    this._profileList = new ProfileList();
    this._profileList.flex = 1;
    this._profileList.setSelectCallback((name: string) => {
      this.switchProfile(name);
    });
    this._profileList.setEditCallback(() => {
      this.showSettings();
    });

    this._section = new Section();
    this._section.title = "Available Profiles";
    this._section.flex = 1;
    this._section.add(this._settingsPanel);
    this._section.add(this._profileList);

    this._column = new Column();
    this._column.add(this._buttonRow);
    this._column.add(this._section);
    this._buttonRow.add(this._summary);
    const spacer = new Spacer();
    spacer.flex = 1;
    this._buttonRow.add(spacer);
    this._buttonRow.add(this._advancedCheckbox);

    this.add(this._column);
  }

  measure(parentSize?: Size): Size {
    return parentSize ? { width: parentSize.width, height: parentSize.height } : super.measure(parentSize);
  }

  onInit(): void {
    if (!this._ctx) return;

    this._buttons[0]?.setAction(() => {
      this.createProfile();
    });

    this._buttons[1]?.setAction(() => {
      this.renameProfile();
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
    this._advancedCheckbox.visible = false;
    this._profileList.visible = true;
    const config = this._ctx?.getConfig();
    if (config) this._profileList.setConfig(config);
    focusManager.setFocus(this._profileList);
    this.markDirty();
  }

  showSettings(): void {
    this._showingSettings = true;
    this._settingsPanel.visible = true;
    this._advancedCheckbox.visible = true;
    this._profileList.visible = false;
    const config = this._ctx?.getConfig();
    if (config) this._settingsPanel.setConfig(config);
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

  createProfile(): void {
    const config = this._ctx?.getConfig();
    if (!config) return;

    fireAsync(async () => {
      const name = await this._ctx!.openModal<string | null>(
        createInputDialog("Create Profile", "Profile name", "")
      );
      if (!name) return;
      this.commitCreateProfile(name, config);
    }, this._ctx!);
  }

  commitCreateProfile(name: string, config: ConfigData): void {
    name = name.trim();
    if (!name) {
      this._ctx?.showMessage("Profile name cannot be empty");
      return;
    }
    if (name === "Default") {
      this._ctx?.showMessage("Cannot use 'Default' as a profile name");
      return;
    }
    if (config.server.profiles[name]) {
      this._ctx?.showMessage(`Profile '${name}' already exists`);
      return;
    }

    const current = config.server.profiles[config.server.activeProfile];
    if (!current) return;

    config.server.profiles[name] = JSON.parse(JSON.stringify(current));
    config.server.activeProfile = name;

    try {
      saveConfig(config);
      this._ctx?.showMessage(`Created profile: ${name}`);
    } catch (e) {
      this._ctx?.showMessage(`Error saving: ${e}`);
    }

    this.refreshConfig();
  }

  renameProfile(): void {
    const config = this._ctx?.getConfig();
    if (!config) return;

    if (config.server.activeProfile === "Default") {
      this._ctx?.showMessage("Default profile cannot be renamed");
      return;
    }

    fireAsync(async () => {
      const name = await this._ctx!.openModal<string | null>(
        createInputDialog("Rename Profile", "New name", config.server.activeProfile)
      );
      if (!name) return;
      this.commitRenameProfile(name, config);
    }, this._ctx!);
  }

  commitRenameProfile(name: string, config: ConfigData): void {
    name = name.trim();
    if (!name) {
      this._ctx?.showMessage("Profile name cannot be empty");
      return;
    }
    if (name === "Default") {
      this._ctx?.showMessage("Cannot use 'Default' as a profile name");
      return;
    }
    if (name === config.server.activeProfile) {
      return;
    }
    if (config.server.profiles[name]) {
      this._ctx?.showMessage(`Profile '${name}' already exists`);
      return;
    }

    const current = config.server.profiles[config.server.activeProfile];
    if (!current) return;

    config.server.profiles[name] = current;
    delete config.server.profiles[config.server.activeProfile];
    config.server.activeProfile = name;

    try {
      saveConfig(config);
      this._ctx?.showMessage(`Renamed profile to: ${name}`);
    } catch (e) {
      this._ctx?.showMessage(`Error saving: ${e}`);
    }

    this.refreshConfig();
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

    fireAsync(async () => {
      const confirmed = await this._ctx!.openModal<boolean>(createConfirmDialog(
        "Delete Profile",
        `Delete profile "${config.server.activeProfile}"? This cannot be undone.`
      ));
      if (!confirmed) return;

      const oldName = config.server.activeProfile;
      delete profiles[oldName];
      config.server.activeProfile = "Default";

      try {
        saveConfig(config);
        this._ctx?.showMessage(`Deleted profile "${oldName}", switched to Default`);
      } catch (e) {
        this._ctx?.showMessage(`Error saving: ${e}`);
      }

      this.refreshConfig();
    }, this._ctx!);
  }
}

export function createServerTab(ctx: TabContext): Control {
  return new ServerControl(ctx);
}
