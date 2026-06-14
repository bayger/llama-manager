import { Control } from "../Control.js";
import { fg } from "../../../lib/theme.js";
import { focusManager } from "../FocusManager.js";
import type { Color } from "../../../lib/theme.js";
import type { Size, RenderContext } from "../types.js";

export class Label extends Control {
  focusable = false;
  protected _text = "";
  protected _color: Color = "text";
  protected _bold = false;
  protected _padding = 0;
  protected _align: "left" | "center" = "left";

  get text(): string { return this._text; }
  set text(v: string) { if (v !== this._text) { this._text = v; this.markDirty(); } }

  get color(): Color { return this._color; }
  set color(v: Color) { if (v !== this._color) { this._color = v; this.markDirty(); } }

  get bold(): boolean { return this._bold; }
  set bold(v: boolean) { if (v !== this._bold) { this._bold = v; this.markDirty(); } }

  get padding(): number { return this._padding; }
  set padding(v: number) { if (v !== this._padding) { this._padding = v; this.markDirty(); } }

  get align(): "left" | "center" { return this._align; }
  set align(v: "left" | "center") { if (v !== this._align) { this._align = v; this.markDirty(); } }

  measure(_parentSize?: Size): Size {
    const len = this.text.length + this.padding * 2;
    return { width: len, height: 1 };
  }

  onFocus(): void {
    super.onFocus();
    this.markDirty();
  }

  onBlur(): void {
    super.onBlur();
    this.markDirty();
  }

  draw(ctx: RenderContext): void {
    const { canvas } = ctx;
    canvas.moveTo(this.rect.x, this.rect.y);
    if (this.bold) canvas.bold();
    if (this.align === "center") {
      const pad = Math.max(0, (this.rect.width - this.text.length) / 2);
      canvas.write(" ".repeat(pad));
    } else if (this.padding > 0) {
      canvas.write(" ".repeat(this.padding));
    }
    const isFocused = focusManager.getFocused() === this;
    const prefix = isFocused ? "> " : "";
    fg(canvas, this.color, prefix + this.text);
    canvas.styleReset();
  }
}
