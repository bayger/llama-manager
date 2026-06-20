import { Control } from "../ui/Control";
import { fg, fgBg } from "../../lib/theme";
import { renderLogLine } from "../../lib/logcolors";
import type { Point, Size, RenderContext } from "../ui/types";

export interface LogsViewerConfig {
  getLines: () => string[];
  emptyMessage?: string;
}

export class LogsViewer extends Control {
  focusable = true;
  protected _config: LogsViewerConfig;
  protected _scrollOffset = 0;
  protected _viewportHeight = 0;
  protected _totalLines = 0;
  protected _autoScroll = true;
  protected _scrollbarWidth = 1;

  constructor(config: LogsViewerConfig) {
    super();
    this._config = config;
  }

  measure(parentSize?: Size): Size {
    return { width: parentSize?.width ?? this.rect.width, height: parentSize?.height ?? this.rect.height };
  }

  onLayout(): void {
    const prevViewport = this._viewportHeight;
    this._viewportHeight = this.rect.height;
    const lines = this._config.getLines();
    this._totalLines = lines.length;

    const maxScroll = this.maxScrollOffset;
    if (this._autoScroll || this._scrollOffset > maxScroll) {
      this._scrollOffset = maxScroll;
    }
    this._scrollOffset = Math.max(0, this._scrollOffset);

    if (prevViewport !== this._viewportHeight) {
      this.markDirty();
    }
  }

  get maxScrollOffset(): number {
    return Math.max(0, this._totalLines - this._viewportHeight);
  }

  get needsScrollbar(): boolean {
    return this._totalLines > this._viewportHeight;
  }

  get contentWidth(): number {
    return this.needsScrollbar ? this.rect.width - this._scrollbarWidth : this.rect.width;
  }

  scrollToBottom(): void {
    this._autoScroll = true;
    this._scrollOffset = this.maxScrollOffset;
    this.markDirty();
  }

  draw(ctx: RenderContext): void {
    const canvas = ctx.canvas;
    const { x, y, width, height } = this.rect;

    if (height <= 0) {
      return;
    }

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
        const lineIdx = this._scrollOffset + i;
        if (lineIdx >= 0 && lineIdx < totalLines) {
          renderLogLine(canvas, x, y + i, cw, lines[lineIdx]!);
        }
      }
    }

    if (this.needsScrollbar) {
      this.drawScrollbar(canvas, x + cw, y, width - cw, height);
    }
  }

  protected drawScrollbar(canvas: any, sx: number, sy: number, sw: number, sh: number): void {
    if (sh <= 0 || sw <= 0) return;

    const trackTop = sy;
    const trackHeight = sh;
    const thumbMinHeight = 2;
    const ratio = this._viewportHeight / this._totalLines;
    const thumbHeight = Math.max(thumbMinHeight, Math.floor(ratio * trackHeight));
    const maxThumbPos = trackHeight - thumbHeight;
    const thumbOffset = this.maxScrollOffset > 0
      ? Math.floor((this._scrollOffset / this.maxScrollOffset) * maxThumbPos)
      : 0;

    for (let i = 0; i < trackHeight; i++) {
      canvas.moveTo(sx, trackTop + i);
      if (i >= thumbOffset && i < thumbOffset + thumbHeight) {
        fgBg(canvas, "textMuted", "canvasSubtle", " ".repeat(sw));
      } else {
        fgBg(canvas, "canvasSubtle", "canvas", " ".repeat(sw));
      }
    }
  }

  handleKey(key: string): boolean {
    if (this._totalLines === 0) return false;

    if (key === "UP" || key === "k") {
      if (this._scrollOffset > 0) {
        this._autoScroll = false;
        this._scrollOffset--;
        this.markDirty();
        return true;
      }
      return false;
    }
    if (key === "DOWN" || key === "j") {
      if (this._scrollOffset < this.maxScrollOffset) {
        this._scrollOffset++;
        if (this._scrollOffset === this.maxScrollOffset) {
          this._autoScroll = true;
        }
        this.markDirty();
        return true;
      }
      return false;
    }
    if (key === "PAGE_UP") {
      const prev = this._scrollOffset;
      this._scrollOffset = Math.max(0, this._scrollOffset - this._viewportHeight + 1);
      if (this._scrollOffset !== prev) {
        this._autoScroll = false;
        this.markDirty();
      }
      return true;
    }
    if (key === "PAGE_DOWN") {
      const prev = this._scrollOffset;
      this._scrollOffset = Math.min(this.maxScrollOffset, this._scrollOffset + this._viewportHeight - 1);
      if (this._scrollOffset !== prev) {
        if (this._scrollOffset === this.maxScrollOffset) {
          this._autoScroll = true;
        } else {
          this._autoScroll = false;
        }
        this.markDirty();
      }
      return true;
    }
    if (key === "HOME") {
      if (this._scrollOffset !== 0) {
        this._autoScroll = false;
        this._scrollOffset = 0;
        this.markDirty();
      }
      return true;
    }
    if (key === "END") {
      const maxScroll = this.maxScrollOffset;
      if (this._scrollOffset !== maxScroll) {
        this._autoScroll = true;
        this._scrollOffset = maxScroll;
        this.markDirty();
      }
      return true;
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
      const ratio = this._viewportHeight / this._totalLines;
      const thumbHeight = Math.max(thumbMinHeight, Math.floor(ratio * trackHeight));
      const maxThumbPos = trackHeight - thumbHeight;
      const maxScroll = this.maxScrollOffset;

      if (maxScroll <= 0) return false;

      const newOffset = Math.floor((clickY / maxThumbPos) * maxScroll);
      this._scrollOffset = Math.max(0, Math.min(maxScroll, newOffset));
      this._autoScroll = this._scrollOffset === this.maxScrollOffset;
      this.markDirty();
      return true;
    }

    return false;
  }
}
