import { Control } from "../ui/Control";
import { fg, fgBg } from "../../lib/theme";
import { ConfigData } from "../../lib/config";
import type { Point, Size, RenderContext } from "../ui/types";

export class ProfileList extends Control {
  focusable = true;
  protected _config: ConfigData | null = null;
  protected _selectedIndex = 0;
  protected _onSelect: ((name: string) => void) | null = null;
  protected _onEdit: ((name: string) => void) | null = null;
  protected _onCancel: (() => void) | null = null;

  setSelectCallback(cb: (name: string) => void): void {
    this._onSelect = cb;
  }

  setEditCallback(cb: (name: string) => void): void {
    this._onEdit = cb;
  }

  setCancelCallback(cb: () => void): void {
    this._onCancel = cb;
  }

  setConfig(config: ConfigData, preserveIndex?: boolean): void {
    this._config = config;
    if (!preserveIndex) {
      this._selectedIndex = 0;
      if (config) {
        const names = Object.keys(config.server.profiles);
        const idx = names.indexOf(config.server.activeProfile);
        if (idx !== -1) this._selectedIndex = idx;
      }
    } else if (config) {
      const names = Object.keys(config.server.profiles);
      this._selectedIndex = Math.max(0, Math.min(this._selectedIndex, names.length - 1));
    }
    this.markDirty();
  }

  measure(parentSize?: Size): Size {
    return parentSize ? { width: parentSize.width, height: parentSize.height } : super.measure(parentSize);
  }

  draw(ctx: RenderContext): void {
    if (!this._config) return;
    const canvas = ctx.canvas;
    const { x, y: startY, width, height } = this.rect;
    const names = Object.keys(this._config.server.profiles);

    if (names.length === 0) {
      return;
    }

    for (let i = 0; i < height; i++) {
      canvas.moveTo(x, startY + i);

      if (i < names.length) {
        const name = names[i]!;
        const isActive = name === this._config.server.activeProfile;
        const isHighlighted = i === this._selectedIndex;
        const fgColor = isHighlighted ? (this.focused ? "canvas" : "text") : (isActive ? "accent" : "text");
        const bgColor = this.focused ? (isHighlighted ? "selectedBg" : "canvasSubtle") : "canvasSubtle";
        const prefix = isActive ? "✓ " : "  ";
        const line = (prefix + name).padEnd(width);

        if (isHighlighted) {
          canvas.bold(true);
          fgBg(canvas, fgColor, bgColor, line.substring(0, width));
          canvas.bold(false);
        } else {
          fgBg(canvas, fgColor, bgColor, line.substring(0, width));
        }
      }
    }
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
      if (name && this._onEdit) this._onEdit(name);
      return true;
    }
    if (key === "SPACE" || key === " ") {
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

  onMouseDown(point: Point): boolean {
    if (!this._config) return false;
    const names = Object.keys(this._config.server.profiles);
    if (names.length === 0) return false;
    const row = point.y - this.rect.y;
    if (row >= 0 && row < names.length) {
      this._selectedIndex = row;
      this.markDirty();
      return true;
    }
    return false;
  }
}
