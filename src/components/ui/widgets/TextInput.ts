import { Control } from "../Control.js";
import { fg, themeColors } from "../../../lib/theme.js";
import type { Size } from "../types.js";

const CURSOR_SHOW = "\x1b[?25h";
const CURSOR_HIDE = "\x1b[?25l";

export class TextInput extends Control {
  public value = "";
  public placeholder = "";
  public cursorPos = 0;
  public prefix = "";
  protected _onSubmit: ((value: string) => void) | null = null;
  protected _onCancel: (() => void) | null = null;
  protected _onChange: ((value: string) => void) | null = null;

  measure(_parentSize?: Size): Size {
    const contentLen = Math.max(this.value.length, this.placeholder.length) + this.prefix.length + 2;
    return { width: Math.max(contentLen, this.rect.width), height: 1 };
  }

  setOnSubmit(callback: (value: string) => void): void {
    this._onSubmit = callback;
  }

  setOnCancel(callback: () => void): void {
    this._onCancel = callback;
  }

  setOnChange(callback: (value: string) => void): void {
    this._onChange = callback;
  }

  onFocus(): void {
    super.onFocus();
    if (this._renderContext) {
      this.term(CURSOR_SHOW);
    }
    this.cursorPos = this.value.length;
  }

  onBlur(): void {
    super.onBlur();
    if (this._renderContext) {
      this.term(CURSOR_HIDE);
    }
  }

  render(): void {
    if (!this.visible || !this.needsRender) return;
    const { term, rect } = this;
    term.moveTo(rect.x, rect.y);
    term.styleReset();

    if (this.prefix) {
      fg(term, themeColors.textMuted, this.prefix);
    }

    const display = this.value || this.placeholder;
    const displayColor = this.value ? themeColors.text : themeColors.textMuted;
    fg(term, displayColor, display);

    const contentLen = this.value.length + this.prefix.length;
    const remaining = Math.max(0, rect.width - contentLen);
    fg(term, themeColors.canvas, " ".repeat(remaining));

    if (this.focused) {
      const cursorX = rect.x + this.prefix.length + this.cursorPos;
      term.moveTo(cursorX, rect.y);
    }

    this.needsRender = false;
  }

  handleKey(key: string): boolean {
    if (key === "RETURN" || key === "ENTER") {
      if (this._onSubmit) this._onSubmit(this.value);
      return true;
    }
    if (key === "ESC" || key === "ESCAPE" || key === "CTRL_C") {
      if (this._renderContext) {
        this.term(CURSOR_HIDE);
      }
      if (this._onCancel) this._onCancel();
      return true;
    }
    if (key === "LEFT") {
      this.cursorPos = Math.max(0, this.cursorPos - 1);
      this.markDirty();
      return true;
    }
    if (key === "RIGHT") {
      this.cursorPos = Math.min(this.value.length, this.cursorPos + 1);
      this.markDirty();
      return true;
    }
    if (key === "BACKSPACE" || key === "CTRL_H" || key === "\u007f") {
      if (this.cursorPos > 0) {
        this.value = this.value.slice(0, this.cursorPos - 1) + this.value.slice(this.cursorPos);
        this.cursorPos--;
        if (this._onChange) this._onChange(this.value);
      }
      this.markDirty();
      return true;
    }
    if (key === "DELETE" || key === "CTRL_D") {
      if (this.cursorPos < this.value.length) {
        this.value = this.value.slice(0, this.cursorPos) + this.value.slice(this.cursorPos + 1);
        if (this._onChange) this._onChange(this.value);
      }
      this.markDirty();
      return true;
    }
    if (key === "CTRL_E" || key === "END") {
      this.cursorPos = this.value.length;
      this.markDirty();
      return true;
    }
    if (key === "CTRL_A" || key === "HOME") {
      this.cursorPos = 0;
      this.markDirty();
      return true;
    }
    if (key === "CTRL_W") {
      const before = this.value.slice(0, this.cursorPos);
      const match = before.match(/\S+\s*$/);
      const newCursor = match ? this.cursorPos - match[0].length : 0;
      this.value = this.value.slice(0, newCursor) + this.value.slice(this.cursorPos);
      this.cursorPos = newCursor;
      if (this._onChange) this._onChange(this.value);
      this.markDirty();
      return true;
    }
    return false;
  }

  handleChar(char: string): boolean {
    this.value = this.value.slice(0, this.cursorPos) + char + this.value.slice(this.cursorPos);
    this.cursorPos++;
    if (this._onChange) this._onChange(this.value);
    this.markDirty();
    return true;
  }
}
