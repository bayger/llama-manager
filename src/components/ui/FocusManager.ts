import { Control } from "./Control.js";
import type { Point } from "./types.js";

export class FocusManager {
  private _root: Control | null = null;
  private _focused: Control | null = null;
  private _textInputActive = false;

  setRoot(root: Control): void {
    this._root = root;
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
    this._focused = control;
    if (control) {
      control.focus();
    }
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
    if (!this._root || !this._focused) return;
    const focusable = this._root.getAllFocusable();
    const idx = focusable.indexOf(this._focused);
    if (idx === -1 || idx >= focusable.length - 1) return;
    this.setFocus(focusable[idx + 1]);
  }

  focusPrev(): void {
    if (!this._root || !this._focused) return;
    const focusable = this._root.getAllFocusable();
    const idx = focusable.indexOf(this._focused);
    if (idx === -1 || idx <= 0) return;
    this.setFocus(focusable[idx - 1]);
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

  handleMouse(point: Point): boolean {
    if (!this._root) return false;
    const target = this._root.hitTest(point);
    if (!target) return false;
    this.setFocus(target);
    target.onMouseDown(point);
    return true;
  }

  handleKey(key: string): boolean {
    if (!this._root) return false;

    if (this._textInputActive && this._focused) {
      if (this._focused.handleKey(key)) return true;
      return this._focused.handleChar(key) || this._root.handleKey(key);
    }
    if (key === "TAB") {
      this.nextFocus();
      return true;
    }
    if (key === "SHIFT_TAB") {
      this.previousFocus();
      return true;
    }
    if (this._root.handleKey(key)) return true;
    if ((key === "UP" || key === "k") && this._focused) {
      this.focusPrev();
      return true;
    }
    if ((key === "DOWN" || key === "j") && this._focused) {
      this.focusNext();
      return true;
    }
    return false;
  }
}

export const focusManager = new FocusManager();
