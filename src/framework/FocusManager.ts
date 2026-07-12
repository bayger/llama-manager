import { Control } from "./Control";
import type { Point } from "./types";

export class FocusManager {
  private _root: Control | null = null;
  private _focused: Control | null = null;
  private _textInputActive = false;
  private _mousePos: Point | null = null;
  private _hovered: Control | null = null;

  setRoot(root: Control): void {
    this._root = root;
    this.setFocus(root);
  }

  getRoot(): Control | null {
    return this._root;
  }

  getFocused(): Control | null {
    return this._focused;
  }

  isTextInputActive(): boolean {
    return this._textInputActive;
  }

  activateTextInput(active: boolean): void {
    this._textInputActive = active;
  }

  setFocus(control: Control): void {
    if (this._focused === control) return;
    if (this._focused) {
      this._focused.blur();
    }
    if (!control) {
      this._focused = null;
      return;
    }
    if (!control.focusable) {
      const focusable = control.getAllFocusable();
      if (focusable.length > 0) {
        control = focusable[0];
      } else {
        this._focused = null;
        return;
      }
    }
    this._focused = control;
    control.focus();
  }

  nextFocus(): void {
    if (!this._root) {
      this.focusFirst();
      return;
    }
    const focusable = this._root.getAllFocusable();
    if (focusable.length === 0) return;
    const currentIdx = this._focused ? focusable.indexOf(this._focused) : -1;
    if (currentIdx === -1 || currentIdx >= focusable.length - 1) {
      this.setFocus(focusable[0]);
    } else {
      this.setFocus(focusable[currentIdx + 1]);
    }
  }

  previousFocus(): void {
    if (!this._root) {
      this.focusLast();
      return;
    }
    const focusable = this._root.getAllFocusable();
    if (focusable.length === 0) return;
    const currentIdx = this._focused ? focusable.indexOf(this._focused) : -1;
    if (currentIdx === -1 || currentIdx <= 0) {
      this.setFocus(focusable[focusable.length - 1]);
    } else {
      this.setFocus(focusable[currentIdx - 1]);
    }
  }

  focusNext(): void {
    if (!this._root) return;
    const focusable = this._root.getAllFocusable();
    if (focusable.length === 0) return;
    const currentIdx = this._focused ? focusable.indexOf(this._focused) : -1;
    if (currentIdx === -1 || currentIdx >= focusable.length - 1) {
      this.setFocus(focusable[0]);
    } else {
      this.setFocus(focusable[currentIdx + 1]);
    }
  }

  focusPrev(): void {
    if (!this._root) return;
    const focusable = this._root.getAllFocusable();
    if (focusable.length === 0) return;
    const currentIdx = this._focused ? focusable.indexOf(this._focused) : -1;
    if (currentIdx === -1 || currentIdx <= 0) {
      this.setFocus(focusable[focusable.length - 1]);
    } else {
      this.setFocus(focusable[currentIdx - 1]);
    }
  }

  focusFirst(): void {
    if (!this._root) return;
    this.setFocus(this._root);
  }

  focusLast(): void {
    if (!this._root) return;
    const focusable = this._root.getAllFocusable();
    this.setFocus(focusable.length > 0 ? focusable[focusable.length - 1] : this._root);
  }

  clear(): void {
    if (this._focused) {
      this._focused.blur();
    }
    this._focused = null;
    this._textInputActive = false;
  }

  handleMouseDown(point: Point): boolean {
    if (!this._root) return false;
    const target = this._root.hitTest(point);
    if (!target) return false;
    if (target.focusable) {
      this.setFocus(target);
    }
    target.onMouseDown(point);
    return true;
  }

  handleMouseUp(point: Point): boolean {
    if (!this._root) return false;
    const target = this._root.hitTest(point);
    if (!target) return false;
    target.onMouseUp(point);
    return true;
  }

  handleMouseWheel(point: Point, direction: 'up' | 'down'): boolean {
    if (!this._root) return false;
    const target = this._root.hitTest(point);
    if (!target) return false;
    let current: Control | null = target;
    while (current) {
      if (current.onMouseWheel(point, direction)) return true;
      current = current.parent;
    }
    return false;
  }

  getMousePos(): Point | null {
    return this._mousePos;
  }

  handleMouseMove(point: Point): void {
    if (!this._root) return;
    this._mousePos = point;

    const target = this._root.hitTest(point);
    if (target === this._hovered) {
      // Still over same control, dispatch move with local coords
      if (target) {
        const local = { x: point.x - target.rect.x, y: point.y - target.rect.y };
        target.onMouseMove(local);
      }
      return;
    }

    // Mouse left old control
    if (this._hovered) {
      this._hovered.onMouseLeave();
      this._hovered = null;
    }

    // Mouse entered new control
    if (target) {
      this._hovered = target;
      const local = { x: point.x - target.rect.x, y: point.y - target.rect.y };
      target.onMouseEnter(local);
      target.onMouseMove(local);
    }
  }

  static handleNavKeys(key: string, bidirectional = false): boolean {
    if (key === "UP" || key === "k" || (bidirectional && (key === "LEFT" || key === "h"))) {
      focusManager.focusPrev();
      return true;
    }
    if (key === "DOWN" || key === "j" || (bidirectional && (key === "RIGHT" || key === "l"))) {
      focusManager.focusNext();
      return true;
    }
    return false;
  }

  handleKey(key: string): boolean {
    if (!this._root) return false;

    if (key === "TAB") {
      this.nextFocus();
      return true;
    }
    if (key === "SHIFT_TAB") {
      this.previousFocus();
      return true;
    }

    if (this._textInputActive && this._focused) {
      if (this._focused.handleKey(key)) return true;
      // Only pass printable single characters to handleChar
      if (key.length === 1 && key >= " " && key <= "~") {
        if (this._focused.handleChar(key)) return true;
      }
      return this._root.handleKey(key);
    }
    if (this._root.handleKey(key)) return true;
    return false;
  }
}

export const focusManager = new FocusManager();
