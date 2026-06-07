import { Control } from "../ui/Control.js";
import { themeColors, fg, fgBg } from "../../lib/theme.js";
import { ConfigData } from "../../lib/config.js";
import type { Size } from "../ui/types.js";

export class ProfileList extends Control {
  protected _config: ConfigData | null = null;
  protected _selectedIndex = 0;
  protected _onSelect: ((name: string) => void) | null = null;
  protected _onCancel: (() => void) | null = null;

  setSelectCallback(cb: (name: string) => void): void {
    this._onSelect = cb;
  }

  setCancelCallback(cb: () => void): void {
    this._onCancel = cb;
  }

  setConfig(config: ConfigData): void {
    this._config = config;
    this._selectedIndex = 0;
    if (config) {
      const names = Object.keys(config.server.profiles);
      const idx = names.indexOf(config.server.activeProfile);
      if (idx !== -1) this._selectedIndex = idx;
    }
    this.markDirty();
  }

  measure(parentSize?: Size): Size {
    return parentSize ? { width: parentSize.width, height: parentSize.height } : super.measure(parentSize);
  }

  render(): void {
    if (!this.visible || !this.needsRender || !this._config) return;
    const term = this.term;
    const { x, y: startY, width, height } = this.rect;
    const names = Object.keys(this._config.server.profiles);

    if (names.length === 0) {
      this.needsRender = false;
      return;
    }

    for (let i = 0; i < height; i++) {
      term.moveTo(x, startY + i);
      term.styleReset();

      if (i < names.length) {
        const name = names[i]!;
        const isActive = name === this._config.server.activeProfile;
        const isSelected = i === this._selectedIndex;

        if (isSelected) {
          const prefix = isActive ? " > " : "   ";
          const line = (prefix + name).padEnd(width);
          fgBg(term, themeColors.canvas, themeColors.accent, line.substring(0, width));
        } else if (isActive) {
          const line = ("* " + name).padEnd(width);
          fg(term, themeColors.accent, line.substring(0, width));
        } else {
          const line = ("   " + name).padEnd(width);
          fg(term, themeColors.textMuted, line.substring(0, width));
        }
      } else {
        fg(term, themeColors.canvas, " ".repeat(width));
      }
    }

    this.needsRender = false;
  }

  handleKey(key: string): boolean {
    if (!this._config) return false;
    const names = Object.keys(this._config.server.profiles);
    if (names.length === 0) return false;

    if (key === "UP" || key === "k") {
      if (this._selectedIndex > 0) {
        this._selectedIndex--;
        this.markDirty();
        return true;
      }
      return false;
    }
    if (key === "DOWN" || key === "j") {
      if (this._selectedIndex < names.length - 1) {
        this._selectedIndex++;
        this.markDirty();
        return true;
      }
      return false;
    }
    if (key === "HOME") {
      this._selectedIndex = 0;
      this.markDirty();
      return true;
    }
    if (key === "END") {
      this._selectedIndex = names.length - 1;
      this.markDirty();
      return true;
    }
    if (key === "RETURN" || key === "ENTER") {
      const name = names[this._selectedIndex];
      if (name && this._onSelect) {
        this._onSelect(name);
      }
      return true;
    }
    if (key === "ESCAPE") {
      if (this._onCancel) this._onCancel();
      return true;
    }
    return false;
  }

  onFocus(): void {
    super.onFocus();
    this.markDirty();
  }

  onBlur(): void {
    super.onBlur();
    this.markDirty();
  }
}
