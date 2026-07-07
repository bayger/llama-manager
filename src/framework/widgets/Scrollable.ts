import { Control } from "../Control";
import { fgBg } from "../../lib/theme";
import type { Point, Size } from "../types";
import type { FramebufferCanvas } from "../../lib/framebuffer-canvas";

export class Scrollable extends Control {
  public scrollOffset = 0;
  public contentHeight = 0;
  protected _viewportHeight = 0;
  protected _scrollbarWidth = 1;

  measure(_parentSize?: Size): Size {
    return { width: this.rect.width || 40, height: this.rect.height || 10 };
  }

  onLayout(): void {
    this._viewportHeight = this.rect.height;
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, this.maxScrollOffset));
  }

  get maxScrollOffset(): number {
    return Math.max(0, this.contentHeight - this._viewportHeight);
  }

  get needsScrollbar(): boolean {
    return this.contentHeight > this._viewportHeight;
  }

  get contentWidth(): number {
    return this.needsScrollbar ? this.rect.width - this._scrollbarWidth : this.rect.width;
  }

  setScrollOffset(offset: number): void {
    this.scrollOffset = Math.max(0, Math.min(offset, this.maxScrollOffset));
    this.markDirty();
  }

  setContentHeight(h: number): void {
    this.contentHeight = h;
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, this.maxScrollOffset));
    this.markDirty();
  }

  canScrollUp(): boolean {
    return this.scrollOffset > 0;
  }

  canScrollDown(): boolean {
    return this.scrollOffset < this.maxScrollOffset;
  }

  drawScrollbar(canvas: FramebufferCanvas, sx: number, sy: number, sw: number, sh: number): void {
    if (sh <= 0 || sw <= 0) return;

    const trackTop = sy;
    const trackHeight = sh;
    const thumbMinHeight = 2;
    const ratio = this._viewportHeight / this.contentHeight;
    const thumbHeight = Math.max(thumbMinHeight, Math.floor(ratio * trackHeight));
    const maxThumbPos = trackHeight - thumbHeight;
    const thumbOffset = this.maxScrollOffset > 0
      ? Math.floor((this.scrollOffset / this.maxScrollOffset) * maxThumbPos)
      : 0;

    for (let i = 0; i < trackHeight; i++) {
      canvas.moveTo(sx, trackTop + i);
      if (i >= thumbOffset && i < thumbOffset + thumbHeight) {
        fgBg(canvas, "textMuted", "border", " ".repeat(sw));
      } else {
        fgBg(canvas, "surface", "borderMuted", " ".repeat(sw));
      }
    }
  }

  handleKey(key: string): boolean {
    if (key === "UP" && this.canScrollUp()) {
      this.scrollOffset--;
      this.markDirty();
      return true;
    }
    if (key === "DOWN" && this.canScrollDown()) {
      this.scrollOffset++;
      this.markDirty();
      return true;
    }
    if (key === "PAGE_UP") {
      this.scrollOffset = Math.max(0, this.scrollOffset - this._viewportHeight + 1);
      this.markDirty();
      return true;
    }
    if (key === "PAGE_DOWN") {
      this.scrollOffset = Math.min(this.maxScrollOffset, this.scrollOffset + this._viewportHeight - 1);
      this.markDirty();
      return true;
    }
    if (key === "HOME") {
      this.scrollOffset = 0;
      this.markDirty();
      return true;
    }
    if (key === "END") {
      this.scrollOffset = this.maxScrollOffset;
      this.markDirty();
      return true;
    }
    return false;
  }

  onMouseWheel(_point: Point, direction: 'up' | 'down'): boolean {
    if (direction === 'up' && this.canScrollUp()) {
      this.scrollOffset--;
      this.markDirty();
      return true;
    }
    if (direction === 'down' && this.canScrollDown()) {
      this.scrollOffset++;
      this.markDirty();
      return true;
    }
    return false;
  }
}
