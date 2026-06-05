import type { Terminal } from "terminal-kit";
import { spawn } from "child_process";
import { themeColors, fg, termHeight } from "../../lib/theme.js";
import { onServerLog, serverLogLines, clearServerLogs, getStatus } from "../../lib/server.js";

function renderLine(term: Terminal, y: number, fn: () => void): void {
  term.moveTo(1, y);
  term.eraseLine();
  fn();
}

interface LogEntry {
  timestamp: string | null;
  level: string | null;
  component: string | null;
  message: string;
}

interface LiveLogsState {
  autoScroll: boolean;
  scrollOffset: number;
  copied: boolean;
  running: boolean;
  logUnsub: (() => void) | null;
  statusInterval: ReturnType<typeof setInterval> | null;
}

const state: LiveLogsState = {
  autoScroll: true,
  scrollOffset: 0,
  copied: false,
  running: false,
  logUnsub: null,
  statusInterval: null,
};

function severityColor(level: string): string {
  const l = level.toUpperCase();
  if (l === "E" || l === "F") return themeColors.danger;
  if (l === "W") return themeColors.warning;
  if (l === "I") return themeColors.accent;
  if (l === "D" || l === "T") return themeColors.textMuted;
  return themeColors.text;
}

function parseLogLine(line: string): LogEntry {
  const match = line.match(/^([\d.]+)\s+([A-Z])\s+(\S+)\s+(.*)$/);
  if (match) {
    return {
      timestamp: match[1],
      level: match[2],
      component: match[3],
      message: match[4],
    };
  }
  return {
    timestamp: null,
    level: null,
    component: null,
    message: line,
  };
}

function renderLogLine(term: Terminal, y: number, entry: LogEntry): number {
  renderLine(term, y, () => {
    fg(term, themeColors.textMuted, "> ");
    if (entry.timestamp) {
      fg(term, themeColors.textMuted, entry.timestamp);
      term(' ');
    }
    if (entry.level) {
      term.bold;
      fg(term, severityColor(entry.level), entry.level);
      term.styleReset(true);
      term(' ');
    }
    if (entry.component) {
      fg(term, themeColors.textMuted, entry.component);
      term(' ');
    }
    fg(term, themeColors.text, entry.message);
  });
  return y + 1;
}

state.logUnsub = onServerLog(() => {
  if (state.autoScroll) {
    state.scrollOffset = 0;
  }
});

state.statusInterval = setInterval(() => {
  state.running = getStatus().running;
}, 2000);

export function render(app: any): void {
  const term = app.term as Terminal;
  const lines = serverLogLines;
  const maxVisible = Math.max(1, termHeight(term) - 5);

  let y = 3;

  renderLine(term, y, () => {
    fg(term, themeColors.text, "Live Logs");
    term('  ');
    fg(term, themeColors.textMuted, "|");
    term('  ');
    fg(term, state.running ? themeColors.success : themeColors.danger, state.running ? "\u25cf Running" : "\u25d0 Stopped");
    term('  ');
    fg(term, themeColors.textMuted, "|");
    term('  ');
    fg(term, themeColors.textMuted, `${lines.length} lines`);
    term('  ');
    fg(term, themeColors.textMuted, "|");
    term('  ');
    fg(term, state.autoScroll ? themeColors.success : themeColors.textMuted, state.autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF");
  });
  y++;

  renderLine(term, y, () => {
    fg(term, themeColors.textMuted, "g auto-scroll | G top | u clear | y copy | arrows scroll");
    if (state.copied) {
      fg(term, themeColors.success, " | Copied to clipboard!");
    }
  });
  y++;

  if (lines.length === 0) {
    renderLine(term, y, () => {
      fg(term, themeColors.textMuted, "Waiting for server output...");
    });
    return;
  }

  const visibleStart = state.autoScroll ? Math.max(0, lines.length - maxVisible) : state.scrollOffset;
  const visibleLines = lines.slice(visibleStart, visibleStart + maxVisible);

  for (const line of visibleLines) {
    const entry = parseLogLine(line);
    y = renderLogLine(term, y, entry);
  }
}

export function handleKey(_app: any, key: string): boolean {
  const lines = serverLogLines;
  const maxVisible = Math.max(1, (_app.term as Terminal).height - 5);

  if (key === 'UP' || key === 'PAGE_UP') {
    state.autoScroll = false;
    state.scrollOffset = Math.max(0, state.scrollOffset - (key === 'PAGE_UP' ? maxVisible : 1));
    return true;
  }
  if (key === 'DOWN' || key === 'PAGE_DOWN') {
    state.autoScroll = false;
    state.scrollOffset = Math.min(lines.length - maxVisible, state.scrollOffset + (key === 'PAGE_DOWN' ? maxVisible : 1));
    return true;
  }
  if (key === 'G') {
    state.autoScroll = false;
    state.scrollOffset = 0;
    return true;
  }
  if (key === 'g') {
    state.autoScroll = true;
    state.scrollOffset = 0;
    return true;
  }
  if (key === 'u') {
    clearServerLogs();
    state.scrollOffset = 0;
    return true;
  }
  if (key === 'y') {
    if (lines.length === 0) return true;
    const text = lines.join("\n");
    try {
      const xclip = spawn("xclip", ["-selection", "clipboard"]);
      xclip.stdin.write(text + "\n");
      xclip.stdin.end();
    } catch {
      // xclip not available
    }
    state.copied = true;
    setTimeout(() => { state.copied = false; }, 2000);
    return true;
  }
  return false;
}

export function dispose(): void {
  if (state.logUnsub) {
    state.logUnsub();
    state.logUnsub = null;
  }
  if (state.statusInterval) {
    clearInterval(state.statusInterval);
    state.statusInterval = null;
  }
}
