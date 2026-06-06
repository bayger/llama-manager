import { Control } from "../Control.js";
import { fg, themeColors } from "../../../lib/theme.js";
import type { Size } from "../types.js";

export interface ButtonConfig {
  label: string;
  disabled?: boolean;
  action?: () => void;
}

export class Button extends Control {
  focusable = false;
  public label = "";
  public disabled = false;
  protected _action: (() => void) | null = null;

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

  render(): void {
    if (!this.visible || !this.needsRender) return;
    const { term, rect } = this;
    term.moveTo(rect.x, rect.y);
    const text = `[ ${this.label} ]`;

    if (this.disabled) {
      fg(term, themeColors.borderMuted, text);
    } else if (this.focused) {
      term.bold();
      fg(term, themeColors.success, text);
      term.styleReset();
    } else {
      fg(term, themeColors.textMuted, text);
    }

    this.needsRender = false;
  }

  handleKey(key: string): boolean {
    if (this.disabled) return false;
    if (key === "RETURN" || key === "ENTER" || key === "SPACE") {
      if (this._action) this._action();
      return true;
    }
    return false;
  }

  setAction(action: () => void): void {
    this._action = action;
  }
}
