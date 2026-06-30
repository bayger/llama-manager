import { focusManager } from "./FocusManager";
import type { Control } from "./Control";
import type { FramebufferCanvas } from "../lib/framebuffer-canvas";
import type { Modal } from "./widgets/Modal";
import type { Point } from "./types";

export class ModalManager {
  private _stack: Modal[] = [];
  private _savedRoots: (Control | null)[] = [];
  private _needsRender = false;
  private _onDirty: (() => void) | null = null;

  setOnDirty(callback: () => void): void {
    this._onDirty = callback;
  }

  open(modal: Modal): void {
    this._savedRoots.push(focusManager.getRoot());
    this._stack.push(modal);
    this._needsRender = true;
    focusManager.setRoot(modal);
  }

  close(): void {
    if (this._stack.length === 0) return;
    this._stack.pop();
    this._needsRender = true;
    if (this._onDirty) this._onDirty();
    if (this._stack.length === 0) {
      focusManager.setRoot(this._savedRoots.pop()!);
    } else {
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
    return this._needsRender || (this._stack.length > 0 && this._stack[this._stack.length - 1]!.needsRender);
  }

  handleMouseDown(point: Point): boolean {
    if (!this.isOpen()) return false;
    const top = this.getTop();
    if (!top) return false;
    const target = top.hitTest(point);
    if (target && target.focusable) {
      focusManager.setFocus(target);
    } else {
      focusManager.setFocus(top);
    }
    target?.onMouseDown(point);
    return true;
  }

  handleMouseUp(point: Point): boolean {
    if (!this.isOpen()) return false;
    const top = this.getTop();
    if (!top) return false;
    const target = top.hitTest(point);
    target?.onMouseUp(point);
    return true;
  }

  handleKey(key: string): boolean {
    if (!this.isOpen()) return false;
    const top = this.getTop();
    if (!top) return false;

    if (key === "TAB") {
      focusManager.nextFocus();
      return true;
    }
    if (key === "SHIFT_TAB") {
      focusManager.previousFocus();
      return true;
    }

    const focused = focusManager.getFocused();
    if (focused && focused.handleKey(key)) return true;
    if (focusManager.isTextInputActive()) {
      if (key.length === 1 && key >= " " && key <= "~") {
        if (focused?.handleChar(key)) return true;
      }
    }
    if (top.handleKey(key)) return true;
    return false;
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
      modal.render({ canvas, scheduleRender: () => {}, showMessage: () => {}, showCursor: () => {} });
      canvas.styleReset();
    }
  }
}

export const modalManager = new ModalManager();
