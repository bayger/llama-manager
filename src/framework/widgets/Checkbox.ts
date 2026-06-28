import { Control } from "../Control";
import { fg, fgBg } from "../../lib/theme";
import { focusManager } from "../FocusManager";
import type { Point, Size, RenderContext } from "../types";

export interface CheckboxConfig {
  label: string;
  checked?: boolean;
  disabled?: boolean;
  action?: (checked: boolean) => void;
}

const BOX_UNCHECKED = "\u2610";
const BOX_CHECKED = "\u2611";

export class Checkbox extends Control {
  focusable = true;
  protected _label = "";
  protected _checked = false;
  protected _action: ((checked: boolean) => void) | null = null;
  protected _pressed = false;

  get label(): string { return this._label; }
  set label(v: string) { if (v !== this._label) { this._label = v; this.markDirty(); } }

  get checked(): boolean { return this._checked; }
  set checked(v: boolean) {
    if (v !== this._checked) {
      this._checked = v;
      this.markDirty();
      if (this._action) this._action(this._checked);
    }
  }

  get disabled(): boolean {
    return !this.enabled;
  }

  set disabled(value: boolean) {
    if (value === !this.enabled) return;
    this.enabled = !value;
    this.markDirty();
  }

  constructor(config?: CheckboxConfig) {
    super();
    if (config) {
      this._label = config.label;
      this._checked = config.checked || false;
      this.disabled = config.disabled || false;
      this._action = config.action || null;
    }
  }

  measure(_parentSize?: Size): Size {
    return { width: this._label.length + 4, height: 1 };
  }

  draw(ctx: RenderContext): void {
    const { canvas } = ctx;
    const { x, y } = this.rect;
    canvas.moveTo(x, y);

    const box = this._checked ? BOX_CHECKED : BOX_UNCHECKED;
    const text = `${box} ${this._label} `;

    if (this.disabled) {
      fg(canvas, "borderMuted", text);
    } else if (this.focused) {
      canvas.bold();
      fgBg(canvas, "canvas", "accent", text);
    } else {
      fg(canvas, "textMuted", text);
    }
  }

  handleKey(key: string): boolean {
    if (this.disabled) return false;
    if (key === "RETURN" || key === "ENTER" || key === "SPACE") {
      this._checked = !this._checked;
      this.markDirty();
      if (this._action) this._action(this._checked);
      return true;
    }
    if (key === "UP" || key === "k") {
      focusManager.focusPrev();
      return true;
    }
    if (key === "DOWN" || key === "j") {
      focusManager.focusNext();
      return true;
    }
    return false;
  }

  setAction(action: (checked: boolean) => void): void {
    this._action = action;
  }

  onMouseDown(_point: Point): boolean {
    this._pressed = true;
    return true;
  }

  onMouseUp(point: Point): boolean {
    if (this._pressed && !this.disabled && this.isPointInside(point)) {
      this._checked = !this._checked;
      this.markDirty();
      if (this._action) this._action(this._checked);
    }
    this._pressed = false;
    return true;
  }

  protected isPointInside(point: Point): boolean {
    const { x, y, width, height } = this.rect;
    return point.x >= x && point.x < x + width && point.y >= y && point.y < y + height;
  }
}
