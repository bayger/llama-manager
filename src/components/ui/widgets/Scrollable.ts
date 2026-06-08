import { Control } from "../Control.js";
import type { Size } from "../types.js";

export class Scrollable extends Control {
  public scrollOffset = 0;
  public contentHeight = 0;
  protected _viewportHeight = 0;

  measure(_parentSize?: Size): Size {
    return { width: this.rect.width || 40, height: this.rect.height || 10 };
  }

  onLayout(): void {
    this._viewportHeight = this.rect.height;
    if (this.scrollOffset >= Math.max(0, this.contentHeight - this._viewportHeight)) {
      this.scrollOffset = Math.max(0, this.contentHeight - this._viewportHeight);
    }
  }

  setScrollOffset(offset: number): void {
    this.scrollOffset = Math.max(0, Math.min(offset, Math.max(0, this.contentHeight - this._viewportHeight)));
    this.markDirty();
  }

  setContentHeight(h: number): void {
    this.contentHeight = h;
    if (this.scrollOffset >= Math.max(0, this.contentHeight - this._viewportHeight)) {
      this.scrollOffset = Math.max(0, this.contentHeight - this._viewportHeight);
    }
    this.markDirty();
  }

  canScrollUp(): boolean {
    return this.scrollOffset > 0;
  }

  canScrollDown(): boolean {
    return this.scrollOffset < Math.max(0, this.contentHeight - this._viewportHeight);
  }

  render(): void {
    if (!this.visible || !this.needsRender) return;
    for (const child of this.children) {
      child.render();
    }
    this.needsRender = false;
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
      const maxScroll = Math.max(0, this.contentHeight - this._viewportHeight);
      this.scrollOffset = Math.min(maxScroll, this.scrollOffset + this._viewportHeight - 1);
      this.markDirty();
      return true;
    }
    if (key === "HOME") {
      this.scrollOffset = 0;
      this.markDirty();
      return true;
    }
    if (key === "END") {
      this.scrollOffset = Math.max(0, this.contentHeight - this._viewportHeight);
      this.markDirty();
      return true;
    }
    return false;
  }
}
