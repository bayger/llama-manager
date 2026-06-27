import { Control } from "../ui/Control";
import { Section } from "../ui/widgets/Section";
import { Button } from "../ui/widgets/Button";
import { Column, Row } from "../ui/Layout";
import { fg, fgBg } from "../../lib/theme";
import { focusManager } from "../ui/FocusManager";
import { taskStore } from "../../lib/tasks";
import { formatDate } from "../../lib/utils";
import type { TaskMetrics, SpeedSample } from "../../lib/tasks";
import type { Point, Size, RenderContext } from "../ui/types";

interface SampleStats {
  min: number;
  max: number;
  avg: number;
  count: number;
}

function computeStats(samples: SpeedSample[]): SampleStats {
  if (samples.length === 0) return { min: 0, max: 0, avg: 0, count: 0 };
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const s of samples) {
    if (s.speedTps < min) min = s.speedTps;
    if (s.speedTps > max) max = s.speedTps;
    sum += s.speedTps;
  }
  return { min, max, avg: sum / samples.length, count: samples.length };
}

function formatStats(stats: SampleStats): string {
  if (stats.count === 0) return "no data";
  return `min ${stats.min.toFixed(1)}  avg ${stats.avg.toFixed(1)}  max ${stats.max.toFixed(1)}  (${stats.count} samples)`;
}

class SpeedSamplesList extends Control {
  focusable = true;
  protected _samples: SpeedSample[] = [];
  protected _selectedIndex = -1;
  protected _scrollOffset = 0;
  protected _viewportHeight = 0;
  protected _scrollbarWidth = 1;

  update(samples: SpeedSample[]): void {
    this._samples = samples;
    this._selectedIndex = samples.length > 0 ? 0 : -1;
    this._scrollOffset = 0;
    this.markDirty();
  }

  measure(parentSize: Size): Size {
    return { width: parentSize.width, height: parentSize.height };
  }

  onLayout(): void {
    this._viewportHeight = Math.max(0, this.rect.height - 1);
    this._scrollOffset = Math.max(0, Math.min(this._scrollOffset, this.maxScrollOffset));
  }

  get contentHeight(): number {
    return this._samples.length;
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

  draw(ctx: RenderContext): void {
    const { canvas } = ctx;
    const { x, y, width, height } = this.rect;
    if (width < 4 || height < 2) return;

    const cw = this.contentWidth;
    const header = this._formatHeader();
    canvas.moveTo(x, y);
    fg(canvas, "textMuted", header.substring(0, cw));

    const startLine = this._scrollOffset;
    for (let i = 0; i < this._viewportHeight; i++) {
      const globalIdx = startLine + i;
      if (globalIdx >= this._samples.length) break;

      const sample = this._samples[globalIdx]!;
      const line = this._formatSample(sample);
      const isHighlighted = globalIdx === this._selectedIndex;
      const fgColor = isHighlighted ? (this.focused ? "canvas" : "text") : "text";
      const bgColor = this.focused ? (isHighlighted ? "selectedBg" : "canvasSubtle") : "canvasSubtle";

      canvas.moveTo(x, y + 1 + i);

      if (isHighlighted && this.focused) {
        canvas.bold(true);
        fgBg(canvas, fgColor, bgColor, line.substring(0, cw));
        canvas.bold(false);
      } else {
        fgBg(canvas, fgColor, bgColor, line.substring(0, cw));
      }
    }

    if (this.needsScrollbar) {
      this.drawScrollbar(canvas, x + cw, y, this._scrollbarWidth, height);
    }
  }

  protected drawScrollbar(canvas: any, sx: number, sy: number, sw: number, sh: number): void {
    if (sh <= 0 || sw <= 0) return;
    const trackHeight = sh;
    const thumbMinHeight = 2;
    const ratio = this._viewportHeight / this.contentHeight;
    const thumbHeight = Math.max(thumbMinHeight, Math.floor(ratio * trackHeight));
    const maxThumbPos = trackHeight - thumbHeight;
    const thumbOffset = this.maxScrollOffset > 0
      ? Math.floor((this._scrollOffset / this.maxScrollOffset) * maxThumbPos)
      : 0;

    for (let i = 0; i < trackHeight; i++) {
      canvas.moveTo(sx, sy + i);
      if (i >= thumbOffset && i < thumbOffset + thumbHeight) {
        fgBg(canvas, "textMuted", "border", " ".repeat(sw));
      } else {
        fgBg(canvas, "canvasSubtle", "borderMuted", " ".repeat(sw));
      }
    }
  }

  _formatHeader(): string {
    return "Elapsed   Phase  Pos    Speed(t/s)  ms/t";
  }

  _formatSample(s: SpeedSample): string {
    const elapsed = s.elapsedS.toFixed(2).padStart(6);
    const phase = (s.phase === "prompt" ? "P" : "G").padEnd(5);
    const pos = String(s.position).padStart(5);
    const speed = s.speedTps.toFixed(1).padStart(11);
    const mspt = s.msPerToken.toFixed(1).padStart(5);
    return `${elapsed}   ${phase} ${pos}   ${speed}   ${mspt}`;
  }

  handleKey(key: string): boolean {
    if (this._samples.length === 0) return false;

    if (key === "UP" || key === "k") {
      if (this._selectedIndex > 0) {
        this._selectedIndex--;
        if (this._selectedIndex < this._scrollOffset) {
          this._scrollOffset = this._selectedIndex;
        }
        this.markDirty();
        return true;
      }
      if (this._scrollOffset > 0) {
        this._scrollOffset--;
        this.markDirty();
        return true;
      }
      return false;
    }
    if (key === "DOWN" || key === "j") {
      if (this._selectedIndex < this._samples.length - 1) {
        this._selectedIndex++;
        if (this._selectedIndex >= this._scrollOffset + this._viewportHeight) {
          this._scrollOffset = this._selectedIndex - this._viewportHeight + 1;
        }
        this.markDirty();
        return true;
      }
      if (this._scrollOffset < this.maxScrollOffset) {
        this._scrollOffset++;
        this.markDirty();
        return true;
      }
      return false;
    }
    if (key === "PAGE_UP") {
      const vp = this._viewportHeight;
      const newIdx = Math.max(0, this._selectedIndex - vp);
      if (newIdx !== this._selectedIndex) {
        this._selectedIndex = newIdx;
        if (this._selectedIndex < this._scrollOffset) {
          this._scrollOffset = this._selectedIndex;
        }
        this.markDirty();
      }
      return true;
    }
    if (key === "PAGE_DOWN") {
      const vp = this._viewportHeight;
      const newIdx = Math.min(this._samples.length - 1, this._selectedIndex + vp);
      if (newIdx !== this._selectedIndex) {
        this._selectedIndex = newIdx;
        if (this._selectedIndex >= this._scrollOffset + this._viewportHeight) {
          this._scrollOffset = this._selectedIndex - this._viewportHeight + 1;
        }
        this.markDirty();
      }
      return true;
    }
    if (key === "HOME") {
      if (this._selectedIndex !== 0) {
        this._selectedIndex = 0;
        this._scrollOffset = 0;
        this.markDirty();
      }
      return true;
    }
    if (key === "END") {
      const last = this._samples.length - 1;
      if (this._selectedIndex !== last) {
        this._selectedIndex = last;
        this._scrollOffset = Math.max(0, last - this._viewportHeight + 1);
        this.markDirty();
      }
      return true;
    }
    return false;
  }

  onMouseWheel(_point: Point, direction: 'up' | 'down'): boolean {
    if (this._samples.length === 0) return false;
    if (direction === 'up' && this._scrollOffset > 0) {
      this._scrollOffset--;
      this.markDirty();
      return true;
    }
    if (direction === 'down' && this._scrollOffset < this.maxScrollOffset) {
      this._scrollOffset++;
      this.markDirty();
      return true;
    }
    return false;
  }

  onFocus(): void {
    super.onFocus();
    if (this._selectedIndex < 0 && this._samples.length > 0) {
      this._selectedIndex = 0;
      this.markDirty();
    }
  }
}

export class TaskDetailsView extends Control {
  focusable = true;
  protected _task: TaskMetrics;
  protected _onBack: () => void;
  protected _column: Column;
  protected _topRow: Row;
  protected _backButton: Button;
  protected _ppStatsLabel: Control;
  protected _tgStatsLabel: Control;
  protected _samplesSection: Section;
  protected _samplesList: SpeedSamplesList;
  protected _promptSamples: SpeedSample[] = [];
  protected _genSamples: SpeedSample[] = [];

  constructor(task: TaskMetrics, onBack: () => void) {
    super();
    this._task = task;
    this._onBack = onBack;

    this._backButton = new Button({ label: "[Back]", action: onBack });

    this._ppStatsLabel = new Control();
    this._tgStatsLabel = new Control();

    this._topRow = new Row();
    this._topRow.add(this._backButton);
    this._topRow.add(this._ppStatsLabel);
    this._topRow.add(this._tgStatsLabel);

    this._samplesList = new SpeedSamplesList();
    this._samplesSection = new Section();
    this._samplesSection.add(this._samplesList);
    this._samplesList.flex = 1;

    this._column = new Column();
    this._column.add(this._topRow);
    this._column.add(this._samplesSection);
    this._samplesSection.flex = 1;

    this.add(this._column);
  }

  measure(parentSize?: Size): Size {
    return parentSize ? { width: parentSize.width, height: parentSize.height } : { width: 80, height: 20 };
  }

  onLayout(): void {
    const { x, y, width, height } = this.rect;
    this._column.layout({ x, y, width, height });

    const allSamples = taskStore.getSpeedSamples(this._task.taskId);
    this._promptSamples = allSamples.filter(s => s.phase === "prompt");
    this._genSamples = allSamples.filter(s => s.phase === "generation");
    this._samplesSection.title = `Task #${this._task.taskId}  S${this._task.slotId}  ${formatDate(this._task.timestamp)}  Count: ${allSamples.length}`;
    this._samplesList.update(allSamples);
    this.markDirty();
  }

  draw(_ctx: RenderContext): void {
    const ppStats = computeStats(this._promptSamples);
    const tgStats = computeStats(this._genSamples);

    this._ppStatsLabel.draw = (ctx: RenderContext) => {
      const { canvas } = ctx;
      const { x, y } = this._ppStatsLabel.rect;
      canvas.moveTo(x, y);
      const text = `PP: ${formatStats(ppStats)}`;
      fg(canvas, "warning", text);
    };

    this._tgStatsLabel.draw = (ctx: RenderContext) => {
      const { canvas } = ctx;
      const { x, y } = this._tgStatsLabel.rect;
      canvas.moveTo(x, y);
      const text = `TG: ${formatStats(tgStats)}`;
      fg(canvas, "accentColor", text);
    };
  }

  handleKey(key: string): boolean {
    const focused = this.findFocusedDescendant();
    if (focused && focused !== this._backButton && focused.handleKey(key)) return true;
    if (focused === this._backButton && focused.handleKey(key)) return true;
    if (key === "ESCAPE") {
      this._onBack();
      return true;
    }
    return false;
  }

  onFocus(): void {
    super.onFocus();
    focusManager.setFocus(this._backButton);
    this.markDirty();
  }
}
