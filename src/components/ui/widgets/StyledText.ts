import { Control } from "../Control.js";
import { fg } from "../../../lib/theme.js";
import type { Color } from "../../../lib/theme.js";
import type { Size, RenderContext } from "../types.js";

export interface TextSegment {
  text: string;
  color: Color;
}

export class StyledTextBuilder {
  protected _target: StyledText;
  public _resetDone = false;

  constructor(target: StyledText) {
    this._target = target;
  }

  protected reset(): void {
    if (this._resetDone) return;
    this._target.segments = [];
    this._resetDone = true;
  }

  protected commit(text: string, color: Color): this {
    this._target.segments.push({ text, color });
    this._target.markDirty();
    return this;
  }

  text(value: string): this { this.reset(); return this.commit(String(value), "text"); }
  muted(value: string): this { this.reset(); return this.commit(String(value), "textMuted"); }
  accent(value: string): this { this.reset(); return this.commit(String(value), "accent"); }
  accentColor(value: string): this { this.reset(); return this.commit(String(value), "accentColor"); }
  success(value: string): this { this.reset(); return this.commit(String(value), "success"); }
  warning(value: string): this { this.reset(); return this.commit(String(value), "warning"); }
  danger(value: string): this { this.reset(); return this.commit(String(value), "danger"); }
  info(value: string): this { this.reset(); return this.commit(String(value), "info"); }
}

export class StyledText extends Control {
  focusable = false;
  public segments: TextSegment[] = [];
  protected _builder: StyledTextBuilder;

  constructor() {
    super();
    this._builder = new StyledTextBuilder(this);
  }

  get builder(): StyledTextBuilder {
    this._builder._resetDone = false;
    return this._builder;
  }

  measure(_parentSize?: Size): Size {
    let len = 0;
    for (const s of this.segments) len += s.text.length;
    return { width: len || this.rect.width, height: 1 };
  }

  render(ctx: RenderContext): void {
    if (!this.visible || !this.needsRender) return;
    super.render(ctx);
    const { canvas } = ctx;
    canvas.moveTo(this.rect.x, this.rect.y);
    for (const seg of this.segments) {
      fg(canvas, seg.color, seg.text);
    }
    canvas.styleReset();
    this.needsRender = false;
  }
}
