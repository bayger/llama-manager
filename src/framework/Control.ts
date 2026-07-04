import type { Rect, Size, RenderContext, Point } from "./types";
import type { Color } from "../lib/theme";

import { focusManager } from "./FocusManager";

export class Control {
  public rect: Rect = { x: 0, y: 0, width: 0, height: 0 };
  public enabled = true;
  public focused = false;
  public focusable = false;
  public needsRender = true;
  public flex = 0;
  public foregroundColor: Color = "None";
  public backgroundColor: Color = "None";

  protected _visible = true;
  get visible(): boolean { return this._visible; }
  set visible(v: boolean) {
    if (this._visible === v) return;
    this._visible = v;
    if (v) this.onShow(); else this.onHide();
    this.markDirty();
  }

  protected children: Control[] = [];
  protected _parent: Control | null = null;

  get parent(): Control | null {
    return this._parent;
  }

  constructor() {
    this.on("resize", () => {
      this.markDirty();
    });
  }

  // - Multi-listener event helpers -

  private _listeners: Map<string, Array<(...args: any[]) => void>> = new Map();

  on(event: string, callback: (...args: any[]) => void): (...args: any[]) => void {
    const handler = callback.bind(this);
    const list = this._listeners.get(event) || [];
    list.push(handler);
    this._listeners.set(event, list);
    return handler;
  }

  off(event: string, handler?: ((...args: any[]) => void) | undefined): void {
    const list = this._listeners.get(event);
    if (!list) return;
    if (handler) {
      const idx = list.indexOf(handler);
      if (idx !== -1) list.splice(idx, 1);
    } else {
      this._listeners.delete(event);
    }
  }

  emit(event: string, ...args: any[]): void {
    const list = this._listeners.get(event);
    if (!list) return;
    const snapshot = [...list];
    for (const handler of snapshot) {
      handler(...args);
    }
  }

  // - Child management -

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
      if (focusManager.getFocused() === child || child.isAncestorOf(focusManager.getFocused())) {
        focusManager.clear();
      }
      this.markDirty();
    }
  }

  clear(): void {
    const focused = focusManager.getFocused();
    for (const child of this.children) {
      child._parent = null;
      if (focused === child || child.isAncestorOf(focused)) {
        focusManager.clear();
        break;
      }
    }
    this.children.length = 0;
    this.markDirty();
  }

  // - Layout -

  measure(_parentSize?: Size): Size {
    return { width: this.rect.width, height: this.rect.height };
  }

  layout(rect: Rect): void {
    this.rect = rect;
    this.onLayout();
    this.markDirty();
  }

  // - Rendering -

  render(ctx: RenderContext): void {
    if (!this.visible) return;

    const prevClip = ctx.canvas.getClipRect();
    ctx.canvas.setClipRect(this.rect);

    const { x, y, width, height } = this.rect;
    ctx.canvas.setForegroundColor(this.foregroundColor);
    ctx.canvas.setBackgroundColor(this.backgroundColor);
    ctx.canvas.clearRect(x, y, width, height);

    this.draw(ctx);
    ctx.canvas.styleReset();

    for (const child of this.children) {
      child.render(ctx);
    }

    ctx.canvas.setClipRect(prevClip);
    this.needsRender = false;
  }

  draw(_ctx: RenderContext): void {}

  // - Input -

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

  // - Focus -

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

  // - Dirty tracking -

  markDirty(): void {
    this.needsRender = true;
    if (this._parent) {
      this._parent.markDirty();
    }
  }

  markAllDirty(): void {
    this.needsRender = true;
    for (const child of this.children) {
      child.markAllDirty();
    }
  }

  // - Lifecycle -

  init(): void {
    this.onInit();
    for (const child of this.children) {
      child.init();
    }
  }

  onInit(): void {}
  onDestroy(): void {}
  onShow(): void {}
  onHide(): void {}
  onFocus(): void {}
  onBlur(): void {}
  onMouseDown(_point: Point): boolean {
    return false;
  }
  onMouseUp(_point: Point): boolean {
    return false;
  }
  onMouseWheel(_point: Point, _direction: 'up' | 'down'): boolean {
    return false;
  }
  onLayout(): void {
    for (const child of this.children) {
      if (child.visible) {
        child.layout(this.rect);
      }
    }
  }

  // - Destroy -

  destroy(): void {
    this.onDestroy();
    for (const child of this.children) {
      child.destroy();
    }
  }

  // - Mouse -

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

  // - Utilities -

  getAllFocusable(): Control[] {
    const result: Control[] = [];
    for (const child of this.children) {
      if (!child.enabled || !child.visible) continue;
      result.push(...child.getAllFocusable());
      if (child.focusable) {
        result.push(child);
      }
    }
    return result;
  }

  fitContent(width: number, height: number): Size {
    return { width: Math.min(width, process.stdout.columns || 80), height: Math.min(height, 999) };
  }

  isAncestorOf(control: Control | null): boolean {
    let current = control;
    while (current) {
      if (current === this) return true;
      current = current._parent;
    }
    return false;
  }
}
