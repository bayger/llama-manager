import { Row } from "../Layout.js";
import { Button } from "./Button.js";
import { fg, themeColors } from "../../../lib/theme.js";
import type { Size } from "../types.js";

export class ButtonBar extends Row {
  protected _selectedIndex = -1;

  get selectedIndex(): number {
    return this._selectedIndex;
  }

  measure(_parentSize: Size): Size {
    let totalWidth = 0;
    const visibleButtons = this.children.filter(c => c.visible) as Button[];
    for (let i = 0; i < visibleButtons.length; i++) {
      const btn = visibleButtons[i]!;
      const s = btn.measure(_parentSize);
      totalWidth += s.width;
      if (i < visibleButtons.length - 1) {
        totalWidth += 2;
      }
    }
    return { width: totalWidth, height: 1 };
  }

  onLayout(): void {
    const { x, y, width: _w, height } = this.rect;
    const visibleButtons = this.children.filter(c => c.visible) as Button[];
    let currentX = x;
    for (const btn of visibleButtons) {
      const s = btn.measure({ width: _w, height });
      btn.layout({ x: currentX, y, width: s.width, height });
      currentX += s.width + 2;
    }
  }

  render(): void {
    if (!this.visible || !this.needsRender) return;
    super.render();
    this.needsRender = false;
  }

  handleKey(key: string): boolean {
    const buttons = this.children.filter(c => c.visible) as Button[];
    if (key === "RIGHT" || key === "LEFT") {
      const dir = key === "RIGHT" ? 1 : -1;
      this.moveSelection(dir);
      return true;
    }
    if (key === "RETURN" || key === "SPACE") {
      if (this._selectedIndex >= 0 && this._selectedIndex < buttons.length) {
        const btn = buttons[this._selectedIndex]!;
        if (!btn.disabled) {
          return btn.handleKey(key);
        }
      }
      return false;
    }
    return false;
  }

  moveSelection(direction: -1 | 1): void {
    const buttons = this.children.filter(c => c.visible) as Button[];
    if (buttons.length === 0) return;
    let next = this._selectedIndex + direction;
    if (next < 0) next = buttons.length - 1;
    if (next >= buttons.length) next = 0;
    while (buttons[next]?.disabled && next !== this._selectedIndex) {
      next += direction;
      if (next < 0) next = buttons.length - 1;
      if (next >= buttons.length) next = 0;
    }
    if (this._selectedIndex >= 0 && this._selectedIndex < buttons.length) {
      buttons[this._selectedIndex]!.focused = false;
    }
    this._selectedIndex = next;
    if (this._selectedIndex >= 0 && this._selectedIndex < buttons.length) {
      buttons[this._selectedIndex]!.focused = true;
    }
    this.needsRender = true;
  }

  focus(): void {
    super.focus();
    const buttons = this.children.filter(c => c.visible) as Button[];
    if (buttons.length > 0) {
      let firstEnabled = -1;
      for (let i = 0; i < buttons.length; i++) {
        if (!buttons[i]!.disabled) {
          firstEnabled = i;
          break;
        }
      }
      if (firstEnabled >= 0) {
        if (this._selectedIndex >= 0 && this._selectedIndex < buttons.length) {
          buttons[this._selectedIndex]!.focused = false;
        }
        this._selectedIndex = firstEnabled;
        buttons[firstEnabled].focused = true;
        this.needsRender = true;
      }
    }
  }

  blur(): void {
    super.blur();
    const buttons = this.children.filter(c => c.visible) as Button[];
    if (this._selectedIndex >= 0 && this._selectedIndex < buttons.length) {
      buttons[this._selectedIndex]!.focused = false;
    }
    this._selectedIndex = -1;
    this.needsRender = true;
  }
}
