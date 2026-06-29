import { Control } from "../Control";
import { fg, fgBg } from "../../lib/theme";
import { focusManager } from "../FocusManager";
import type { Color } from "../../lib/theme";
import type { Point, Size, RenderContext } from "../types";

export interface SelectorLabelConfig {
  prefix: string;
  value?: string;
  valueColor?: Color;
  onActivate: () => Promise<string | null>;
}

export class SelectorLabel extends Control {
  focusable = true;
  protected _prefix = "";
  protected _value = "";
  protected _valueColor: Color = "text";
  protected _onActivate: () => Promise<string | null>;

  get value(): string { return this._value; }
  set value(v: string) { if (v !== this._value) { this._value = v; this.markDirty(); } }

  get prefix(): string { return this._prefix; }
  set prefix(v: string) { if (v !== this._prefix) { this._prefix = v; this.markDirty(); } }

  constructor(config: SelectorLabelConfig) {
    super();
    this._prefix = config.prefix;
    this._value = config.value || "";
    this._valueColor = config.valueColor || "text";
    this._onActivate = config.onActivate;
  }

  measure(_parentSize?: Size): Size {
    return { width: ` ${this._prefix} ${this._value} `.length, height: 1 };
  }

  draw(ctx: RenderContext): void {
    const { canvas } = ctx;
    canvas.moveTo(this.rect.x, this.rect.y);

    if (this.focused) {
      canvas.bold();
      fgBg(canvas, "canvas", "accent", ` ${this._prefix} ${this._value} `);
    } else {
      fg(canvas, "textMuted", ` ${this._prefix} `);
      fg(canvas, this._valueColor, this._value);
    }
  }

  handleKey(key: string): boolean {
    if (key === "RETURN" || key === "ENTER" || key === "SPACE" || key === " ") {
      this._activate();
      return true;
    }
    if (key === "LEFT" || key === "UP" || key === "k" || key === "h") {
      focusManager.focusPrev();
      return true;
    }
    if (key === "RIGHT" || key === "DOWN" || key === "j" || key === "l") {
      focusManager.focusNext();
      return true;
    }
    return false;
  }

  onMouseDown(_point: Point): boolean {
    return true;
  }

  onMouseUp(_point: Point): boolean {
    this._activate();
    return true;
  }

  protected _activate(): void {
    (async () => {
      const result = await this._onActivate();
      if (result !== null) {
        this.value = result;
      }
    })();
  }
}
