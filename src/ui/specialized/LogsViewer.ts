import { Scrollable } from "../../framework/widgets/Scrollable";
import { fg } from "../../lib/theme";
import { renderLogLine } from "../../lib/logcolors";
import type { Point, Size, RenderContext } from "../../framework/types";

export interface LogsViewerConfig {
  getLines: () => string[];
  emptyMessage?: string;
}

export class LogsViewer extends Scrollable {
  focusable = true;
  protected _config: LogsViewerConfig;
  protected _autoScroll = true;

  constructor(config: LogsViewerConfig) {
    super();
    this._config = config;
  }

  measure(parentSize?: Size): Size {
    return { width: parentSize?.width ?? this.rect.width, height: parentSize?.height ?? this.rect.height };
  }

  onLayout(): void {
    this._viewportHeight = this.rect.height;
    const lines = this._config.getLines();
    const prevContentHeight = this.contentHeight;
    this.contentHeight = lines.length;

    const maxScroll = this.maxScrollOffset;
    if (this._autoScroll || this.scrollOffset > maxScroll) {
      this._autoScroll = true;
      this.scrollOffset = maxScroll;
    } else {
      this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll));
    }

    if (prevContentHeight !== this.contentHeight) {
      this.markDirty();
    }
  }

  scrollToBottom(): void {
    this._autoScroll = true;
    this.scrollOffset = this.maxScrollOffset;
    this.markDirty();
  }

  draw(ctx: RenderContext): void {
    const canvas = ctx.canvas;
    const { x, y, width, height } = this.rect;

    if (height <= 0) return;

    const lines = this._config.getLines();
    const totalLines = lines.length;
    const cw = this.contentWidth;

    if (totalLines === 0 && this._config.emptyMessage) {
      const midY = y + Math.floor(height / 2);
      const pad = Math.max(0, Math.floor((cw - this._config.emptyMessage.length) / 2));
      canvas.moveTo(x + pad, midY);
      fg(canvas, "textMuted", this._config.emptyMessage);
    } else {
      for (let i = 0; i < height; i++) {
        const lineIdx = this.scrollOffset + i;
        if (lineIdx >= 0 && lineIdx < totalLines) {
          renderLogLine(canvas, x, y + i, cw, lines[lineIdx]!);
        }
      }
    }

    if (this.needsScrollbar) {
      this.drawScrollbar(canvas, x + cw, y, this._scrollbarWidth, height);
    }
  }

  protected tryScroll(delta: number): boolean {
    const newOffset = this.scrollOffset + delta;
    if (newOffset < 0 || newOffset > this.maxScrollOffset) return false;
    this.scrollOffset = newOffset;
    if (this.scrollOffset === this.maxScrollOffset) {
      this._autoScroll = true;
    } else {
      this._autoScroll = false;
    }
    this.markDirty();
    return true;
  }

  handleKey(key: string): boolean {
    if (this.contentHeight === 0) return false;

    if (key === "UP" || key === "k") {
      if (this.scrollOffset > 0) {
        this._autoScroll = false;
        this.scrollOffset--;
        this.markDirty();
        return true;
      }
      return false;
    }
    if (key === "DOWN" || key === "j") {
      return this.tryScroll(1);
    }
    if (key === "PAGE_UP") {
      if (this.canScrollUp()) {
        this._autoScroll = false;
      }
      return super.handleKey(key);
    }
    if (key === "PAGE_DOWN") {
      return this.tryScroll(this._viewportHeight - 1);
    }
    if (key === "HOME") {
      if (this.scrollOffset !== 0) {
        this._autoScroll = false;
        this.scrollOffset = 0;
        this.markDirty();
      }
      return true;
    }
    if (key === "END") {
      if (this.scrollOffset !== this.maxScrollOffset) {
        this._autoScroll = true;
        this.scrollOffset = this.maxScrollOffset;
        this.markDirty();
      }
      return true;
    }
    return super.handleKey(key);
  }

  onMouseWheel(_point: Point, direction: 'up' | 'down'): boolean {
    if (this.contentHeight === 0) return false;
    if (direction === 'up' && this.scrollOffset > 0) {
      this._autoScroll = false;
      this.scrollOffset--;
      this.markDirty();
      return true;
    }
    if (direction === 'down') {
      return this.tryScroll(1);
    }
    return false;
  }

  onMouseDown(point: Point): boolean {
    if (!this.needsScrollbar) return false;

    const sx = this.rect.x + this.contentWidth;
    const sw = this._scrollbarWidth;

    if (point.x >= sx && point.x < sx + sw) {
      const trackTop = this.rect.y;
      const trackHeight = this.rect.height;
      const clickY = point.y - trackTop;
      const thumbMinHeight = 2;
      const ratio = this._viewportHeight / this.contentHeight;
      const thumbHeight = Math.max(thumbMinHeight, Math.floor(ratio * trackHeight));
      const maxThumbPos = trackHeight - thumbHeight;

      if (maxThumbPos <= 0) return false;

      const newOffset = Math.floor((clickY / maxThumbPos) * this.maxScrollOffset);
      this.scrollOffset = Math.max(0, Math.min(this.maxScrollOffset, newOffset));
      this._autoScroll = this.scrollOffset === this.maxScrollOffset;
      this.markDirty();
      return true;
    }

    return false;
  }
}
