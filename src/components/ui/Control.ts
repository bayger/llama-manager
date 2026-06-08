import type { Rect, Size, RenderContext, Point } from "./types.js";
import type { FramebufferCanvas } from "../../lib/framebuffer-canvas.js";

export class Control {
  public rect: Rect = { x: 0, y: 0, width: 0, height: 0 };
  public enabled = true;
  public visible = true;
  public focused = false;
  public focusable = true;
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

  get canvas(): FramebufferCanvas {
    if (!this._renderContext) throw new Error("Control not attached to render context");
    return this._renderContext.canvas;
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
    this.markDirty();
  }

  remove(child: Control): void {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child._parent = null;
      this.markDirty();
    }
  }

  clear(): void {
    for (const child of this.children) {
      child._parent = null;
    }
    this.children.length = 0;
    this.markDirty();
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
    this.markDirty();
  }

  // — Rendering —

  render(): void {
    if (!this.visible || !this.needsRender) return;

    const prevClip = this.canvas.getClipRect();
    this.canvas.setClipRect(this.rect);

    for (const child of this.children) {
      child.render();
    }

    this.canvas.setClipRect(prevClip);
    this.needsRender = false;
  }

  // — Input —

  handleKey(key: string): boolean {
    const focused = this.findFocusedDescendant();
    if (focused && focused.handleKey(key)) return true;
    return false;
  }

  handleChar(char: string): boolean {
    const focused = this.findFocusedDescendant();
    if (focused && focused.handleChar(char)) return true;
    return false;
  }

  findFocusedDescendant(): Control | null {
    for (const child of this.children) {
      if (child.enabled && child.visible && child.focused) return child;
      const found = child.findFocusedDescendant();
      if (found) return found;
    }
    return null;
  }

  // — Focus —

  focus(): void {
    this.focused = true;
    this.onFocus();
    this.markDirty();
  }

  blur(): void {
    this.focused = false;
    this.onBlur();
    this.markDirty();
  }

  // — Dirty tracking —

  markDirty(): void {
    this.needsRender = true;
    if (this._renderContext) {
      this._renderContext.scheduleRender();
    }
    if (this._parent) {
      this._parent.markDirty();
    }
  }

  // — Lifecycle hooks —

  onAttach(): void {}
  onDetach(): void {}
  onFocus(): void {}
  onBlur(): void {}
  onMouseDown(_point: Point): boolean {
    return false;
  }
  onLayout(): void {
    for (const child of this.children) {
      if (child.visible) {
        child.layout(this.rect);
      }
    }
  }

  // — Mouse —

  hitTest(point: Point): Control | null {
    if (!this.visible || !this.enabled) return null;

    for (let i = this.children.length - 1; i >= 0; i--) {
      const child = this.children[i]!;
      const found = child.hitTest(point);
      if (found) return found;
    }

    const { x, y, width, height } = this.rect;
    if (point.x >= x && point.x < x + width && point.y >= y && point.y < y + height) {
      return this;
    }
    return null;
  }

  // — Utilities —

  getAllFocusable(): Control[] {
    const result: Control[] = [];
    for (const child of this.children) {
      if (!child.enabled || !child.visible) continue;
      if (child.focusable) {
        result.push(child);
      }
      result.push(...child.getAllFocusable());
    }
    return result;
  }

  fitContent(width: number, height: number): Size {
    return { width: Math.min(width, this.canvas.width), height: Math.min(height, 999) };
  }
}
