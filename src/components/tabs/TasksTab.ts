import type { Terminal } from "terminal-kit";
import { themeColors, fg, termHeight, renderDivider, renderLine } from "../../lib/theme.js";
import { taskStore, TaskMetrics } from "../../lib/tasks.js";
import { pad, formatMs, formatNum, formatDraftRate, formatDate, formatTime } from "../../lib/utils.js";
import { TabContext } from "../../lib/tabcontext.js";

interface TasksState {
  tasks: TaskMetrics[];
  handler: (() => void) | null;
}

const COL_W = [8, 9, 12, 12, 9, 9, 9, 8, 8];

function renderTaskRow(term: Terminal, task: TaskMetrics, y: number): number {
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

export function createTasksTab(ctx: TabContext) {
  let state: TasksState = {
    tasks: [],
    handler: null,
  };

  state.handler = () => {
    state.tasks = taskStore.getTasks();
  };
  taskStore.on("updated", state.handler);
  state.tasks = taskStore.getTasks();

  return {
    render: (): void => {
      const term = ctx.term;
      const tasks = state.tasks;
      const stats = taskStore.getStats(tasks);

      if (tasks.length === 0) {
        fg(term, themeColors.textMuted, "No tasks yet. Start the server and run inference to see tasks here.");
        return;
      }

      const maxVisible = Math.max(0, termHeight(term) - 8);
      const visibleTasks = tasks.slice(-maxVisible);

      let y = 3;

      // Header
      const headerCells = ["Date", "Time", "Prompt", "Output", "P t/s", "O t/s", "Total", "Draft", "Context"];
      const headerRow = headerCells.map((h, i) => pad(h, COL_W[i])).join("");
      renderLine(term, y, () => {
        term.bold;
        fg(term, themeColors.accent, headerRow);
        term.styleReset(true);
      });
      y++;

      // Separator
      renderDivider(term, y, themeColors.textMuted);
      y++;

      // Pagination notice
      if (tasks.length > visibleTasks.length) {
        renderLine(term, y, () => {
          fg(term, themeColors.textMuted, `... showing last ${visibleTasks.length} of ${tasks.length} tasks`);
        });
        y++;
      }

      // Task rows
      for (const task of visibleTasks) {
        y = renderTaskRow(term, task, y);
      }

      // Stats footer
      y++;
      renderLine(term, y, () => {
        fg(term, themeColors.textMuted,
          `Avg prompt: ${stats.avgPromptSpeed.toFixed(1)} t/s | Avg output: ${stats.avgOutputSpeed.toFixed(1)} t/s | Total tokens: ${formatNum(stats.totalTokens)} | Draft: ${formatDraftRate(stats.avgDraftAcceptance)} | Tasks: ${stats.count}`);
      });
    },

    handleKey: (_key: string): boolean => false,

    dispose: (): void => {
      if (state.handler) {
        taskStore.off("updated", state.handler);
        state.handler = null;
      }
      state.tasks = [];
    },
  };
}
