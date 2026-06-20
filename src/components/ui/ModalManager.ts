import { focusManager } from "./FocusManager";
import type { Control } from "./Control";
import type { FramebufferCanvas } from "../../lib/framebuffer-canvas";
import type { Modal } from "./widgets/Modal";
import type { Point } from "./types";

export class ModalManager {
  private _stack: Modal[] = [];
  private _tabContent: Control | null = null;
  private _needsRender = false;

  init(tabContent: Control): void {
    this._tabContent = tabContent;
  }

  open(modal: Modal): void {
    this._stack.push(modal);
    this._needsRender = true;
    focusManager.saveRoot();
    focusManager.setRoot(modal);
  }

  close(modal?: Modal): void {
    if (modal) {
      const idx = this._stack.indexOf(modal);
      if (idx !== -1) this._stack.splice(idx, 1);
    } else if (this._stack.length > 0) {
      this._stack.pop();
    }
    this._needsRender = true;
    if (this._tabContent) this._tabContent.markDirty();
    if (this._stack.length === 0) {
      focusManager.restoreRoot();
    } else {
      focusManager.restoreRoot();
      focusManager.setRoot(this._stack[this._stack.length - 1]);
    }
  }

  isOpen(): boolean {
    return this._stack.length > 0;
  }

  getTop(): Modal | null {
    return this._stack.length > 0 ? this._stack[this._stack.length - 1] : null;
  }

  get stackSize(): number {
    return this._stack.length;
  }

  markDirty(): void {
    this._needsRender = true;
  }

  get needsRender(): boolean {
    return this._needsRender;
  }

  handleMouseDown(point: Point): boolean {
    if (!this.isOpen()) return false;
    const top = this.getTop();
    if (!top) return false;
    if (top.onMouseDown(point)) return true;
    return this.isPointInTabContent(point);
  }

  handleMouseUp(point: Point): boolean {
    if (!this.isOpen()) return false;
    const top = this.getTop();
    if (!top) return false;
    if (top.onMouseUp(point)) return true;
    return this.isPointInTabContent(point);
  }

  private isPointInTabContent(point: Point): boolean {
    if (!this._tabContent) return false;
    const { x, y, width, height } = this._tabContent.rect;
    return point.x >= x && point.x < x + width && point.y >= y && point.y < y + height;
  }

  render(canvas: FramebufferCanvas): void {
    if (!this.isOpen()) return;
    this._needsRender = false;

    canvas.dimRect(1, 1, canvas.width, canvas.height, 0.2);

    const termW = canvas.width;
    const termH = canvas.height;

    for (let i = 0; i < this._stack.length; i++) {
      const modal = this._stack[i]!;
      const m = modal.measure({ width: termW, height: termH });
      const mw = Math.min(m.width, termW - 4);
      const mh = Math.min(m.height, termH - 2);
      const mx = 1 + Math.max(1, Math.floor((termW - mw) / 2));
      const my = 1 + Math.max(1, Math.floor((termH - mh) / 2));
      const offset = i * 2;
      const modalY = my + offset;

      // Shadow: darker region offset bottom-right
      const shadowX = mx + 2;
      const shadowY = modalY + 1;
      canvas.dimRect(shadowX, shadowY, mw, mh, 0.15);

      canvas.setClipRect(null);
      modal.layout({ x: mx, y: modalY, width: mw, height: mh });
      modal.needsRender = true;
      modal.render({ canvas, scheduleRender: () => {}, showMessage: () => {}, getConfig: () => null, showCursor: () => {} });
      canvas.styleReset();
    }
  }
}

export const modalManager = new ModalManager();
