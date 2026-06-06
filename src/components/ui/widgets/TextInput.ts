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
    this.term(CURSOR_SHOW);
    this.cursorPos = this.value.length;
  }

onBlur(): void {
    super.onBlur();
    this.term(CURSOR_HIDE);
  }

  render(): void {
    if (!this.visible || !this.needsRender) return;
    const { term, rect } = this;
    term.moveTo(rect.x, rect.y);

    if (this.prefix) {
      fg(term, themeColors.textMuted, this.prefix);
    }

    const display = this.value || this.placeholder;
    const displayColor = this.value ? themeColors.text : themeColors.textMuted;

    if (this.focused) {
      term.moveTo(rect.x + this.prefix.length + this.cursorPos, rect.y);
    }

    fg(term, displayColor, display);

    if (this.focused) {
      term.moveTo(rect.x + this.prefix.length + this.cursorPos, rect.y);
    }

    this.needsRender = false;
  }

  handleKey(key: string): boolean {
    if (key === "RETURN") {
      if (this._onSubmit) this._onSubmit(this.value);
      return true;
    }
    if (key === "ESC" || key === "CTRL_C") {
      this.term(CURSOR_HIDE);
      if (this._onCancel) this._onCancel();
      return true;
    }
    if (key === "LEFT") {
      this.cursorPos = Math.max(0, this.cursorPos - 1);
      this.term.moveTo(this.rect.x + this.prefix.length + this.cursorPos, this.rect.y);
      this.needsRender = true;
      return true;
    }
    if (key === "RIGHT") {
      this.cursorPos = Math.min(this.value.length, this.cursorPos + 1);
      this.term.moveTo(this.rect.x + this.prefix.length + this.cursorPos, this.rect.y);
      this.needsRender = true;
      return true;
    }
    if (key === "CTRL_D" || key === "BACKSPACE" || key === "\u007f") {
      if (this.cursorPos > 0) {
        this.value = this.value.slice(0, this.cursorPos - 1) + this.value.slice(this.cursorPos);
        this.cursorPos--;
        if (this._onChange) this._onChange(this.value);
        this.needsRender = true;
        return true;
      }
    }
    if (key === "CTRL_E") {
      this.cursorPos = this.value.length;
      this.needsRender = true;
      return true;
    }
    if (key === "CTRL_A") {
      this.cursorPos = 0;
      this.needsRender = true;
      return true;
    }
    return false;
  }

  handleChar(char: string): boolean {
    this.value = this.value.slice(0, this.cursorPos) + char + this.value.slice(this.cursorPos);
    this.cursorPos++;
    if (this._onChange) this._onChange(this.value);
    this.needsRender = true;
    return true;
  }
}
