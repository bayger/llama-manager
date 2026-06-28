import { Control } from "../Control";
import { fg } from "../../lib/theme";
import type { Color } from "../../lib/theme";
import type { Size, RenderContext } from "../types";

export class Label extends Control {
  focusable = false;
  protected _text = "";
  protected _color: Color = "text";
  protected _bold = false;
  protected _padding = 0;
  protected _align: "left" | "center" = "left";
  protected _truncate: "tail" | "head" | false = "tail";

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

  get truncate(): "tail" | "head" | false { return this._truncate; }
  set truncate(v: "tail" | "head" | false) { if (v !== this._truncate) { this._truncate = v; this.markDirty(); } }

  measure(_parentSize?: Size): Size {
    const len = this.text.length + this.padding * 2;
    return { width: len, height: 1 };
  }

  draw(ctx: RenderContext): void {
    const { canvas } = ctx;
    canvas.moveTo(this.rect.x, this.rect.y);
    if (this.bold) canvas.bold();

    const pad = this.padding;
    const available = Math.max(0, this.rect.width - pad);
    let display = this.text;

    if (this.truncate && display.length > available) {
      const ellipsis = "\u2026";
      const sliceLen = Math.max(0, available - ellipsis.length);
      if (this.truncate === "tail") {
        display = display.slice(0, sliceLen) + ellipsis;
      } else {
        display = ellipsis + display.slice(-sliceLen);
      }
    }

    if (this.align === "center") {
      const centerPad = Math.max(0, Math.floor((this.rect.width - display.length - pad) / 2));
      canvas.write(" ".repeat(pad + centerPad));
    } else if (pad > 0) {
      canvas.write(" ".repeat(pad));
    }
    fg(canvas, this.color, display);
  }
}
