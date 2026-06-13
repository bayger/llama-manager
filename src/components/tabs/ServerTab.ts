#!/usr/bin/env node
import { Control } from "../ui/Control.js";
import { Column, Row } from "../ui/Layout.js";
import { Button } from "../ui/widgets/Button.js";
import { Spacer } from "../ui/widgets/Spacer.js";
import { Label } from "../ui/widgets/Label.js";
import { SettingsPanel } from "../specialized/SettingsPanel.js";
import { ProfileList } from "../specialized/ProfileList.js";
import { themeColors, fg } from "../../lib/theme.js";
import { focusManager } from "../ui/FocusManager.js";
import { ConfigData, saveConfig } from "../../lib/config.js";
import type { TabContext } from "../../lib/tabcontext.js";
import type { Size, RenderContext } from "../ui/types.js";

export class ServerControl extends Control {
  focusable = true;
  protected _ctx: TabContext | null = null;
  protected _column: Column;
  protected _profileLabel: Label;
  protected _buttonRow: Row;
  protected _buttons: Button[];
  protected _settingsPanel: SettingsPanel;
  protected _profileList: ProfileList;
  protected _profileEdit: { text: string; cursor: number; mode: "create" | "rename" } | null = null;
  protected _showingSettings = false;

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;

    this._profileLabel = new Label();
    this._profileLabel.text = "Loading...";
    this._profileLabel.color = themeColors.text;

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
    this._column.add(this._profileLabel);
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
    if (this._profileEdit) return;
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
    this._profileLabel.text = `Profiles: ${count} | Current: ${config.server.activeProfile}`;
    this._settingsPanel.setConfig(config);
    this._profileList.setConfig(config);
    const isDefault = config.server.activeProfile === "Default";
    this._buttons[1].disabled = isDefault;
    this._buttons[2].disabled = isDefault;
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

    this._profileLabel.visible = false;
    this._profileEdit = {
      text: mode === "create" ? "" : config.server.activeProfile,
      cursor: mode === "create" ? 0 : config.server.activeProfile.length,
      mode,
    };
    focusManager.setFocus(this);
    focusManager.activateTextInput(true);
    this.markDirty();
  }

  cancelProfileEdit(restoreFocus: boolean = true): void {
    this._profileEdit = null;
    this._profileLabel.visible = true;
    this.refreshConfig();
    focusManager.activateTextInput(false);
    if (restoreFocus) {
      const firstEnabled = this._buttons.find(b => !b.disabled);
      if (firstEnabled) {
        focusManager.setFocus(firstEnabled);
      }
    }
    this.markDirty();
  }

  commitProfileEdit(): void {
    if (!this._profileEdit) return;
    const config = this._ctx?.getConfig();
    if (!config) return;

    const name = this._profileEdit.text.trim();
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

    if (this._profileEdit.mode === "create") {
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
      this._ctx?.showMessage(`${this._profileEdit.mode === "create" ? "Created" : "Renamed"} profile: ${name}`);
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

  handleKey(key: string): boolean {
    if (this._profileEdit) {
      return this.handleProfileEditKey(key);
    }
    return super.handleKey(key);
  }

  handleProfileEditKey(key: string): boolean {
    if (!this._profileEdit) return false;

    if (key === "ESCAPE") {
      this.cancelProfileEdit();
      return true;
    }
    if (key === "RETURN" || key === "ENTER") {
      this.commitProfileEdit();
      return true;
    }
    if (key === "LEFT" || key === "CTRL_A" || key === "HOME") {
      if (key === "LEFT") {
        this._profileEdit.cursor = Math.max(0, this._profileEdit.cursor - 1);
      } else {
        this._profileEdit.cursor = 0;
      }
      this.markDirty();
      return true;
    }
    if (key === "RIGHT" || key === "CTRL_E" || key === "END") {
      if (key === "RIGHT") {
        this._profileEdit.cursor = Math.min(this._profileEdit.text.length, this._profileEdit.cursor + 1);
      } else {
        this._profileEdit.cursor = this._profileEdit.text.length;
      }
      this.markDirty();
      return true;
    }
    if (key === "BACKSPACE" || key === "CTRL_H" || key === "\u007f") {
      if (this._profileEdit.cursor > 0) {
        this._profileEdit.text = this._profileEdit.text.slice(0, this._profileEdit.cursor - 1) + this._profileEdit.text.slice(this._profileEdit.cursor);
        this._profileEdit.cursor--;
      }
      this.markDirty();
      return true;
    }
    if (key === "DELETE" || key === "CTRL_D") {
      if (this._profileEdit.cursor < this._profileEdit.text.length) {
        this._profileEdit.text = this._profileEdit.text.slice(0, this._profileEdit.cursor) + this._profileEdit.text.slice(this._profileEdit.cursor + 1);
      }
      this.markDirty();
      return true;
    }
    if (key === "CTRL_W") {
      const before = this._profileEdit.text.slice(0, this._profileEdit.cursor);
      const match = before.match(/\S+\s*$/);
      const newCursor = match ? this._profileEdit.cursor - match[0].length : 0;
      this._profileEdit.text = this._profileEdit.text.slice(0, newCursor) + this._profileEdit.text.slice(this._profileEdit.cursor);
      this._profileEdit.cursor = newCursor;
      this.markDirty();
      return true;
    }
    return false;
  }

  handleChar(char: string): boolean {
    if (!this._profileEdit) return false;
    if (char.length !== 1) return false;

    this._profileEdit.text = this._profileEdit.text.slice(0, this._profileEdit.cursor) + char + this._profileEdit.text.slice(this._profileEdit.cursor);
    this._profileEdit.cursor++;
    this.markDirty();
    return true;
  }

  render(ctx: RenderContext): void {
    if (!this.visible || !this.needsRender) return;
    super.render(ctx);

    if (this._profileEdit) {
      const canvas = ctx.canvas;
      const labelRect = this._profileLabel.rect;
      const prefix = this._profileEdit.mode === "create" ? "Create: " : "Rename: ";
      canvas.moveTo(labelRect.x, labelRect.y);
      canvas.styleReset();
      fg(canvas, themeColors.warning, prefix);
      fg(canvas, themeColors.selected, this._profileEdit.text);
      const drawn = labelRect.x + prefix.length + this._profileEdit.text.length;
      canvas.moveTo(drawn, labelRect.y);
    }

    this.needsRender = false;
  }
}

export function createServerTab(ctx: TabContext): Control {
  return new ServerControl(ctx);
}
