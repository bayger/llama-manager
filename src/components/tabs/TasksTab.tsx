import React from "react";
import { Box, Text } from "ink";
import { taskStore, TaskMetrics } from "../../lib/tasks.js";
import { theme } from "../../lib/theme.js";

function pad(str: string, len: number): string {
  return str.padEnd(len);
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
  return rate > 0 ? `${(rate * 100).toFixed(1)}%` : "—";
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

function TaskRow({ task }: { task: TaskMetrics }) {
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
  return (
    <Box>
      <Text color={theme.text}>{row}</Text>
    </Box>
  );
}

export default function TasksTab({ message, showMessage, setIsTextInputFocused }: { message: string | null; showMessage: (msg: string) => void; setIsTextInputFocused: (focused: boolean) => void }) {
  const [tick, setTick] = React.useState(0);
  const [tasks, setTasks] = React.useState<TaskMetrics[]>([]);

  React.useEffect(() => {
    setTasks(taskStore.getTasks());
    const handler = () => {
      setTasks(taskStore.getTasks());
      setTick((t) => t + 1);
    };
    taskStore.on("updated", handler);
    return () => {
      taskStore.off("updated", handler);
    };
  }, []);

  const stats = taskStore.getStats(tasks);

  const headerCells = ["Date", "Time", "Prompt", "Output", "P t/s", "O t/s", "Total", "Draft", "Context"];
  const headerRow = headerCells.map((h, i) => pad(h, COL_W[i])).join("");
  const sepRow = COL_W.map((w) => pad("─".repeat(w - 1), w)).join("");

  return (
    <Box flexDirection="column" flexGrow={1}>
      {tasks.length === 0 ? (
        <Box marginTop={1}>
          <Text color={theme.textMuted}>No tasks yet. Start the server and run inference to see tasks here.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" flexGrow={1} marginTop={1}>
          <Box>
            <Text color={theme.accent} bold>{headerRow}</Text>
          </Box>
          <Box>
            <Text color={theme.textMuted}>{sepRow}</Text>
          </Box>
          <Box flexDirection="column" flexGrow={1} overflow="hidden">
            {tasks.map((task) => (
              <TaskRow key={task.taskId + task.timestamp} task={task} />
            ))}
          </Box>
          <Box marginTop={1}>
            <Text color={theme.textMuted}>
              Avg prompt: {stats.avgPromptSpeed.toFixed(1)} t/s
            </Text>
            <Text> {" │ "} </Text>
            <Text color={theme.textMuted}>
              Avg output: {stats.avgOutputSpeed.toFixed(1)} t/s
            </Text>
            <Text> {" │ "} </Text>
            <Text color={theme.textMuted}>
              Total tokens: {formatNum(stats.totalTokens)}
            </Text>
            <Text> {" │ "} </Text>
            <Text color={theme.textMuted}>
              Draft: {formatDraftRate(stats.avgDraftAcceptance)}
            </Text>
            <Text> {" │ "} </Text>
            <Text color={theme.textMuted}>
              Tasks: {stats.count}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
