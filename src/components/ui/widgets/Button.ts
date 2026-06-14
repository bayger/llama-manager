import { Control } from "../Control.js";
import { fg, fgBg } from "../../../lib/theme.js";
import { focusManager } from "../FocusManager.js";
import type { Point, Size, RenderContext } from "../types.js";

export interface ButtonConfig {
  label: string;
  disabled?: boolean;
  action?: () => void;
}

export class Button extends Control {
  focusable = true;
  public label = "";
  protected _action: (() => void) | null = null;
  protected _pressed = false;

  get disabled(): boolean {
    return !this.enabled;
  }

  set disabled(value: boolean) {
    if (value === !this.enabled) return;
    if (value && this.focused) {
      this.blur();
      const sibling = this.findNextEnabledSibling();
      if (sibling) {
        focusManager.setFocus(sibling);
      }
    }
    this.enabled = !value;
    this.markDirty();
  }

  findNextEnabledSibling(): Button | null {
    if (!this._parent) return null;
    const siblings = this._parent.getAllFocusable().filter(c => c instanceof Button) as Button[];
    const idx = siblings.indexOf(this);
    if (idx === -1) return null;
    for (let i = 1; i < siblings.length; i++) {
      const offset = (idx + i) % siblings.length;
      const s = siblings[offset]!;
      if (s.enabled && s.visible) {
        return s;
      }
    }
    return null;
  }

  constructor(config?: ButtonConfig) {
    super();
    if (config) {
      this.label = config.label;
      this.disabled = config.disabled || false;
      this._action = config.action || null;
    }
  }

  measure(_parentSize?: Size): Size {
    return { width: this.label.length + 4, height: 1 };
  }

  draw(ctx: RenderContext): void {
    const { canvas } = ctx;
    const { x, y } = this.rect;
    canvas.moveTo(x, y);
    const padded = ` ${this.label} `;

    if (this.disabled) {
      fgBg(canvas, "borderMuted", "canvas", padded);
    } else if (this.focused) {
      canvas.bold();
      fgBg(canvas, "canvas", "accent", padded);
      canvas.styleReset();
    } else {
      fgBg(canvas, "textMuted", "canvasSubtle", padded);
    }
  }

  handleKey(key: string): boolean {
    if (this.disabled) return false;
    if (key === "RETURN" || key === "ENTER" || key === "SPACE") {
      if (this._action) this._action();
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

  setAction(action: () => void): void {
    this._action = action;
  }

  onMouseDown(_point: Point): boolean {
    this._pressed = true;
    return true;
  }

  onMouseUp(_point: Point): boolean {
    if (this._pressed && !this.disabled && this._action) {
      this._action();
    }
    this._pressed = false;
    return true;
  }
}
