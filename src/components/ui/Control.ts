import type { Terminal } from "terminal-kit";
import type { Rect, Size, RenderContext } from "./types.js";
import { termWidth } from "../../lib/theme.js";

export class Control {
  public rect: Rect = { x: 0, y: 0, width: 0, height: 0 };
  public enabled = true;
  public visible = true;
  public focused = false;
  public tabIndex = 0;
  public needsRender = true;
  public flex = 0;
  public minWidth = 0;
  public minHeight = 0;

  protected children: Control[] = [];
  protected _parent: Control | null = null;
  protected _renderContext: RenderContext | null = null;

  get parent(): Control | null {
    return this._parent;
  }

  get renderContext(): RenderContext {
    if (!this._renderContext) throw new Error("Control not attached to render context");
    return this._renderContext;
  }

  get term(): Terminal {
    return this.renderContext.term;
  }

  constructor() {
    this.on("resize", () => {
      this.markDirty();
    });
  }

  // — Event helpers —

  on(event: string, callback: (...args: any[]) => void): void {
    const handler = callback.bind(this);
    (this as any)[`_on_${event}`] = handler;
    this.emit(event);
  }

  off(event: string, callback: (...args: any[]) => void): void {
    delete (this as any)[`_on_${event}`];
  }

  emit(event: string, ...args: any[]): void {
    const handler = (this as any)[`_on_${event}`];
    if (handler) handler(...args);
  }

  // — Child management —

  add(child: Control): void {
    child._parent = this;
    this.children.push(child);
    this.needsRender = true;
  }

  remove(child: Control): void {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child._parent = null;
      this.needsRender = true;
    }
  }

  clear(): void {
    for (const child of this.children) {
      child._parent = null;
    }
    this.children.length = 0;
    this.needsRender = true;
  }

  // — Attachment —

  attach(renderContext: RenderContext): void {
    this._renderContext = renderContext;
    for (const child of this.children) {
      child.attach(renderContext);
    }
    this.onAttach();
  }

  detach(): void {
    this.onDetach();
    for (const child of this.children) {
      child.detach();
    }
    this._renderContext = null;
  }

  // — Layout —

  measure(_parentSize?: Size): Size {
    return { width: this.rect.width, height: this.rect.height };
  }

  layout(rect: Rect): void {
    this.rect = rect;
    this.onLayout();
    this.needsRender = true;
  }

  // — Rendering —

  render(): void {
    if (!this.visible || !this.needsRender) return;
    const { term } = this;
    const { x, y, width } = this.rect;
    term.moveTo(x, y);
    term.colorRgbHex(this._renderContext!.term.width ? "#c9d1d9" : "#c9d1d9");
    for (const child of this.children) {
      child.render();
    }
    this.needsRender = false;
  }

  // — Input —

  handleKey(_key: string): boolean {
    return false;
  }

  handleChar(_char: string): boolean {
    return false;
  }

  // — Focus —

  focus(): void {
    this.focused = true;
    this.onFocus();
    this.needsRender = true;
  }

  blur(): void {
    this.focused = false;
    this.onBlur();
    this.needsRender = true;
  }

  // — Dirty tracking —

  markDirty(): void {
    this.needsRender = true;
    if (this._parent) {
      this._parent.markDirty();
    }
  }

  // — Lifecycle hooks —

  onAttach(): void {}
  onDetach(): void {}
  onFocus(): void {}
  onBlur(): void {}
  onLayout(): void {}

  // — Utilities —

  getAllFocusable(): Control[] {
    const result: Control[] = [];
    for (const child of this.children) {
      if (child.enabled && child.visible) {
        result.push(child);
        result.push(...child.getAllFocusable());
      }
    }
    return result;
  }

  fitContent(width: number, height: number): Size {
    return { width: Math.min(width, termWidth(this.term)), height: Math.min(height, 999) };
  }
}
