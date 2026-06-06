import { Column } from "../ui/Layout.js";
import { fg, themeColors, termHeight, termWidth, renderDivider, renderLine } from "../../lib/theme.js";
import { taskStore, TaskMetrics } from "../../lib/tasks.js";
import { pad, formatMs, formatNum, formatDraftRate, formatDate, formatTime } from "../../lib/utils.js";
import type { TabContext } from "../../lib/tabcontext.js";
import type { Size } from "../ui/types.js";

const COL_W = [8, 9, 12, 12, 9, 9, 9, 8, 8];

function renderTaskRow(term: any, task: TaskMetrics, y: number): number {
  const cells = [
    formatDate(task.timestamp),
    formatTime(task.timestamp),
    `${task.promptTokens} tok`,
    `${task.outputTokens} tok`,
    `${task.promptSpeed.toFixed(1)}`,
    `${task.outputSpeed.toFixed(1)}`,
    formatMs(task.totalTimeMs),
    formatDraftRate(task.draftAcceptance),
    formatNum(task.contextSize),
  ];
  const row = cells.map((c, i) => pad(c, COL_W[i])).join("");
  renderLine(term, y, () => {
    fg(term, themeColors.text, row);
  });
  return y + 1;
}

export class TasksControl extends Column {
  protected _ctx: TabContext | null = null;
  protected _tasks: TaskMetrics[] = [];
  protected _handler: (() => void) | null = null;

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;
  }

  measure(_parentSize?: Size): Size {
    return { width: _parentSize?.width || 80, height: _parentSize?.height || 20 };
  }

  onAttach(): void {
    super.onAttach();
    this._handler = () => {
      this._tasks = taskStore.getTasks();
      this.needsRender = true;
      if (this._ctx) this._ctx.scheduleRender();
    };
    taskStore.on("updated", this._handler);
    this._tasks = taskStore.getTasks();
  }

  onDetach(): void {
    if (this._handler) {
      taskStore.off("updated", this._handler);
      this._handler = null;
    }
    this._tasks = [];
    super.onDetach();
  }

  render(): void {
    if (!this.visible || !this.needsRender || !this._ctx) return;
    const term = this.term;
    const tasks = this._tasks;
    const stats = taskStore.getStats(tasks);

    if (tasks.length === 0) {
      renderLine(term, this.rect.y, () => {
        fg(term, themeColors.textMuted, "No tasks yet. Start the server and run inference to see tasks here.");
      });
      this.needsRender = false;
      return;
    }

    const maxVisible = Math.max(0, termHeight(term) - 8);
    const visibleTasks = tasks.slice(-maxVisible);

    let y = this.rect.y;

    const headerCells = ["Date", "Time", "Prompt", "Output", "P t/s", "O t/s", "Total", "Draft", "Context"];
    const headerRow = headerCells.map((h, i) => pad(h, COL_W[i])).join("");
    renderLine(term, y, () => {
      term.bold;
      fg(term, themeColors.accent, headerRow);
      term.styleReset(true);
    });
    y++;

    renderDivider(term, y, themeColors.textMuted);
    y++;

    if (tasks.length > visibleTasks.length) {
      renderLine(term, y, () => {
        fg(term, themeColors.textMuted, `... showing last ${visibleTasks.length} of ${tasks.length} tasks`);
      });
      y++;
    }

    for (const task of visibleTasks) {
      y = renderTaskRow(term, task, y);
    }

    y++;
    renderLine(term, y, () => {
      fg(term, themeColors.textMuted,
        `Avg prompt: ${stats.avgPromptSpeed.toFixed(1)} t/s | Avg output: ${stats.avgOutputSpeed.toFixed(1)} t/s | Total tokens: ${formatNum(stats.totalTokens)} | Draft: ${formatDraftRate(stats.avgDraftAcceptance)} | Tasks: ${stats.count}`);
    });

    this.needsRender = false;
  }

  handleKey(_key: string): boolean {
    return false;
  }
}

export function createTasksTab(ctx: TabContext) {
  return new TasksControl(ctx);
}
