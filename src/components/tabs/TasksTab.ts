import type { Terminal } from "terminal-kit";
import { themeColors, fg, termHeight } from "../../lib/theme.js";
import { taskStore, TaskMetrics } from "../../lib/tasks.js";

interface TasksState {
  tasks: TaskMetrics[];
  handler: (() => void) | null;
}

const state: TasksState = {
  tasks: [],
  handler: null,
};

function pad(str: string, len: number): string {
  if (str.length >= len) return str.substring(0, len);
  return str + " ".repeat(len - str.length);
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatDraftRate(rate: number): string {
  return rate > 0 ? `${(rate * 100).toFixed(1)}%` : "-";
}

const COL_W = [8, 9, 12, 12, 9, 9, 9, 8, 8];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return [d.getMonth() + 1, d.getDate()].map((v) => String(v).padStart(2, "0")).join("/");
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((v) => String(v).padStart(2, "0")).join(":");
}

function renderLine(term: Terminal, y: number, fn: () => void): void {
  term.moveTo(1, y);
  term.eraseLine();
  fn();
}

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

state.handler = () => {
  state.tasks = taskStore.getTasks();
};
taskStore.on("updated", state.handler);
state.tasks = taskStore.getTasks();

export function render(app: any): void {
  const term = app.term as Terminal;
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
  const sepRow = COL_W.map((w) => pad("\u2500".repeat(w - 1), w)).join("");
  renderLine(term, y, () => {
    fg(term, themeColors.textMuted, sepRow);
  });
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
}

export function handleKey(_app: any, _key: string): boolean {
  return false;
}

export function dispose(): void {
  if (state.handler) {
    taskStore.off("updated", state.handler);
    state.handler = null;
  }
  state.tasks = [];
}
