import { Control } from "../ui/Control.js";
import { Divider } from "../ui/widgets/Divider.js";
import { themeColors, fg } from "../../lib/theme.js";
import { focusManager } from "../ui/FocusManager.js";
import { taskStore, TaskMetrics } from "../../lib/tasks.js";
import type { TabContext } from "../../lib/tabcontext.js";
import type { Size } from "../ui/types.js";

export class TasksControl extends Control {
  protected _ctx: TabContext | null = null;
  protected _divider: Divider;
  protected _scrollOffset = 0;
  protected _selectedIndex = 0;
  protected _attached = false;

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;
    this._divider = new Divider();
    this.add(this._divider);
  }

  measure(parentSize?: Size): Size {
    return parentSize ? { width: parentSize.width, height: parentSize.height } : super.measure(parentSize);
  }

  onAttach(): void {
    if (this._attached) return;
    this._attached = true;
    taskStore.on("updated", () => {
      this._selectedIndex = 0;
      this._scrollOffset = 0;
      this.markDirty();
    });
    this.markDirty();
  }

  onDetach(): void {
    this._attached = false;
    this._ctx = null;
  }

  onLayout(): void {
    this._divider.layout({ x: this.rect.x, y: this.rect.y + 1, width: this.rect.width, height: 1 });
    this.clampSelection();
  }

  clampSelection(): void {
    const tasks = taskStore.getTasks();
    const len = tasks.length;
    if (len === 0) {
      this._selectedIndex = 0;
      this._scrollOffset = 0;
      return;
    }
    this._selectedIndex = Math.max(0, Math.min(this._selectedIndex, len - 1));
    const listHeight = this.rect.height - 3;
    const maxScroll = Math.max(0, len - listHeight);
    this._scrollOffset = Math.max(0, Math.min(this._scrollOffset, maxScroll));
    if (this._selectedIndex < this._scrollOffset) {
      this._scrollOffset = this._selectedIndex;
    }
    if (this._selectedIndex >= this._scrollOffset + listHeight) {
      this._scrollOffset = this._selectedIndex - listHeight + 1;
    }
  }

  markDirty(): void {
    super.markDirty();
    this._ctx?.scheduleRender();
  }

  render(): void {
    if (!this.visible || !this.needsRender) return;
    const term = this.term;
    const { x, y: startY, width, height } = this.rect;
    const tasks = taskStore.getTasks();
    const stats = taskStore.getStats(tasks);

    term.moveTo(x, startY);
    term.styleReset();
    fg(term, themeColors.text, `Tasks: ${stats.count}`);
    fg(term, themeColors.textMuted, `  Avg PP: ${stats.avgPromptSpeed.toFixed(1)}`);
    fg(term, themeColors.textMuted, `  Avg TG: ${stats.avgOutputSpeed.toFixed(1)}`);
    fg(term, themeColors.textMuted, " ".repeat(Math.max(0, width - 28 - String(stats.count).length - String(stats.avgPromptSpeed.toFixed(1)).length - String(stats.avgOutputSpeed.toFixed(1)).length)));

    super.render();

    const headerY = startY + 2;
    term.moveTo(x, headerY);
    term.styleReset();
    this.renderHeaderRow(width);

    const listStartY = startY + 3;
    const listHeight = height - 3;

    for (let i = 0; i < listHeight; i++) {
      const taskIdx = i + this._scrollOffset;
      term.moveTo(x, listStartY + i);
      term.styleReset();

      if (taskIdx < tasks.length) {
        const task = tasks[taskIdx]!;
        const isSelected = taskIdx === this._selectedIndex;
        this.renderTaskRow(task, isSelected, width);
      } else {
        fg(term, themeColors.canvas, " ".repeat(width));
      }
    }

    this.needsRender = false;
  }

  renderHeaderRow(width: number): void {
    const cols = [
      "TIMESTAMP".padEnd(9),
      "ID".padStart(6),
      "SLOT".padEnd(4),
      "PP".padStart(10),
      "TG".padStart(10),
      "TOKENS".padStart(8),
      "TIME".padStart(8),
    ].join(" ");
    const row = ` ${cols}`;
    fg(this.term, themeColors.accent, row);
    fg(this.term, themeColors.textMuted, " ".repeat(Math.max(0, width - row.length)));
    this.term.styleReset();
  }

  renderTaskRow(task: TaskMetrics, isSelected: boolean, width: number): void {
    const time = new Date(task.timestamp);
    const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}:${time.getSeconds().toString().padStart(2, "0")}`;

    const cols = [
      timeStr.padEnd(9),
      `#${task.taskId}`.padStart(6),
      `S${task.slotId}`.padEnd(4),
      `${task.promptSpeed.toFixed(1)} tps`.padStart(10),
      `${task.outputSpeed.toFixed(1)} tps`.padStart(10),
      `${task.outputTokens}`.padStart(8),
      `${task.totalTimeMs.toFixed(0)}ms`.padStart(8),
    ].join(" ");

    const row = ` ${cols}`;

    if (isSelected) {
      const padded = row.padEnd(width);
      this.term.colorRgbHex(themeColors.canvas).bgColorRgbHex(themeColors.accent)(padded);
      this.term.styleReset();
    } else {
      fg(this.term, themeColors.text, row);
      fg(this.term, themeColors.textMuted, " ".repeat(Math.max(0, width - row.length)));
    }
    this.term.styleReset();
  }

  handleKey(key: string): boolean {
    const tasks = taskStore.getTasks();
    const len = tasks.length;
    if (len === 0) return false;

    if (key === "UP" || key === "k") {
      if (this._selectedIndex > 0) {
        this._selectedIndex--;
        if (this._selectedIndex < this._scrollOffset) {
          this._scrollOffset = this._selectedIndex;
        }
        this.markDirty();
        return true;
      }
      return false;
    }
    if (key === "DOWN" || key === "j") {
      if (this._selectedIndex < len - 1) {
        this._selectedIndex++;
        const viewportBottom = this._scrollOffset + this.rect.height - 3;
        if (this._selectedIndex >= viewportBottom) {
          this._scrollOffset = this._selectedIndex - this.rect.height + 4;
        }
        this.markDirty();
        return true;
      }
      return false;
    }
    if (key === "PAGE_UP") {
      const listHeight = this.rect.height - 3;
      this._selectedIndex = Math.max(0, this._selectedIndex - listHeight);
      this._scrollOffset = Math.max(0, this._scrollOffset - listHeight);
      this.markDirty();
      return true;
    }
    if (key === "PAGE_DOWN") {
      const listHeight = this.rect.height - 3;
      this._selectedIndex = Math.min(len - 1, this._selectedIndex + listHeight);
      this._scrollOffset = Math.min(len - listHeight, this._scrollOffset + listHeight);
      this.markDirty();
      return true;
    }
    if (key === "HOME") {
      this._selectedIndex = 0;
      this._scrollOffset = 0;
      this.markDirty();
      return true;
    }
    if (key === "END") {
      this._selectedIndex = len - 1;
      this._scrollOffset = Math.max(0, len - (this.rect.height - 3));
      this.markDirty();
      return true;
    }

    return false;
  }

  onFocus(): void {
    super.onFocus();
    this.clampSelection();
    this.markDirty();
  }
}

export function createTasksTab(ctx: TabContext): Control {
  return new TasksControl(ctx);
}
