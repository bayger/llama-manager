import { Control } from "../Control";
import { fg, fgBg } from "../../../lib/theme";
import { focusManager } from "../FocusManager";
import type { Point, Size, RenderContext } from "../types";

export class TextInput extends Control {
  focusable = true;
  protected _value = "";
  protected _placeholder = "";
  protected _cursorPos = 0;
  protected _prefix = "";
  protected _viewportOffset = 0;

  get value(): string { return this._value; }
  set value(v: string) { if (v !== this._value) { this._value = v; this.markDirty(); } }

  get placeholder(): string { return this._placeholder; }
  set placeholder(v: string) { if (v !== this._placeholder) { this._placeholder = v; this.markDirty(); } }

  get cursorPos(): number { return this._cursorPos; }
  set cursorPos(v: number) {
    if (v !== this._cursorPos) {
      this._cursorPos = v;
      this.updateViewport();
      this.markDirty();
    }
  }

  get prefix(): string { return this._prefix; }
  set prefix(v: string) { if (v !== this._prefix) { this._prefix = v; this.markDirty(); } }
  protected _onSubmit: ((value: string) => void) | null = null;
  protected _onCancel: (() => void) | null = null;
  protected _onChange: ((value: string) => void) | null = null;

  measure(_parentSize?: Size): Size {
    const contentLen = Math.max(this.value.length, this.placeholder.length) + this.prefix.length;
    return { width: contentLen, height: 1 };
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

  protected updateViewport(): void {
    const visibleWidth = Math.max(1, this.rect.width - this.prefix.length);
    if (this._cursorPos < this._viewportOffset) {
      this._viewportOffset = this._cursorPos;
    } else if (this._cursorPos >= this._viewportOffset + visibleWidth) {
      this._viewportOffset = this._cursorPos - visibleWidth + 1;
    }
    this._viewportOffset = Math.max(0, Math.min(this._viewportOffset, this.value.length));
  }

  onFocus(): void {
    super.onFocus();
    focusManager.activateTextInput(true);
    this.cursorPos = this.value.length;
  }

  onBlur(): void {
    super.onBlur();
    focusManager.activateTextInput(false);
  }

  draw(ctx: RenderContext): void {
    const { canvas } = ctx;
    const { x, y } = this.rect;

    const bg = this.focused ? "canvasSubtle" : "canvas";
    const borderColor = this.focused ? "borderActive" : "borderMuted";

    canvas.moveTo(x, y);
    fgBg(canvas, "None", bg, " ".repeat(this.rect.width));
    canvas.moveTo(x, y);

    if (this.prefix) {
      fg(canvas, "textMuted", this.prefix);
    }

    const visibleWidth = Math.max(1, this.rect.width - this.prefix.length);
    this.updateViewport();

    const display = this.value || this.placeholder;
    const displayColor = this.value ? "text" : "textMuted";
    const visible = display.slice(this._viewportOffset, this._viewportOffset + visibleWidth);
    fg(canvas, displayColor, visible);

    if (this.focused) {
      const cursorX = x + this.prefix.length + (this.cursorPos - this._viewportOffset);
      canvas.setTerminalCursor(cursorX, y);
      canvas.showTerminalCursor();
    }
  }

  handleKey(key: string): boolean {
    if (key === "TAB") {
      return false; // Let FocusManager handle focus navigation
    }
    if (key === "RETURN" || key === "ENTER") {
      if (this._onSubmit) this._onSubmit(this.value);
      return true;
    }
    if (key === "ESC" || key === "ESCAPE" || key === "CTRL_C") {
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

  onMouseDown(point: Point): boolean {
    const { x, y } = this.rect;
    if (point.x < x || point.x >= x + this.rect.width || point.y !== y) return false;

    // Layout: prefix + visible text
    const offsetX = point.x - x;
    if (offsetX < this.prefix.length) {
      this.cursorPos = 0;
    } else {
      this.cursorPos = Math.min(this.value.length, Math.max(0, this._viewportOffset + offsetX - this.prefix.length));
    }
    this.markDirty();
    return true;
  }

  handleChar(char: string): boolean {
    this.value = this.value.slice(0, this.cursorPos) + char + this.value.slice(this.cursorPos);
    this.cursorPos++;
    if (this._onChange) this._onChange(this.value);
    this.markDirty();
    return true;
  }
}
