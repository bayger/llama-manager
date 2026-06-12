import { Control } from "../Control.js";
import { fg, fgBg, themeColors } from "../../../lib/theme.js";
import { focusManager } from "../FocusManager.js";
import type { Size, RenderContext } from "../types.js";

export interface ButtonConfig {
  label: string;
  disabled?: boolean;
  action?: () => void;
}

export class Button extends Control {
  focusable = true;
  public label = "";
  protected _action: (() => void) | null = null;

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

  render(ctx: RenderContext): void {
    if (!this.visible || !this.needsRender) return;
    const { canvas } = ctx;
    const { x, y, width } = this.rect;
    canvas.clearRect(x, y, width, 1, themeColors.canvas);
    canvas.moveTo(x, y);
    const padded = ` ${this.label} `;

    if (this.disabled) {
      fg(canvas, themeColors.borderMuted, `( ${this.label} )`);
    } else if (this.focused) {
      canvas.bold();
      fgBg(canvas, themeColors.canvas, themeColors.accent, padded);
      canvas.styleReset();
    } else {
      fg(canvas, themeColors.textMuted, padded);
    }

    this.needsRender = false;
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
}
