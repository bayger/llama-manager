import type { Terminal } from "terminal-kit";
import { themeColors, fg, termWidth, termHeight } from "../../lib/theme.js";
import { loadConfig, ConfigData } from "../../lib/config.js";
import { getServerMetrics } from "../../lib/api.js";
import { getStatus } from "../../lib/server.js";

interface DashboardMetrics {
  promptTokensPerSec: number;
  predictedTokensPerSec: number;
  totalTokens: number;
  requestsProcessing: number;
  requestsDeferred: number;
  promptSecondsTotal: number;
  tokensPredictedSecondsTotal: number;
  nDecodeTotal: number;
  nTokensMax: number;
}

interface DashboardState {
  metrics: DashboardMetrics | null;
  connected: boolean;
  lastPoll: number | null;
  config: ConfigData | null;
  pollInterval: ReturnType<typeof setInterval> | null;
}

let state: DashboardState = {
  metrics: null,
  connected: false,
  lastPoll: null,
  config: null,
  pollInterval: null,
};

function formatTime(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s}s`;
}

function renderLine(term: Terminal, y: number, fn: () => void): void {
  term.moveTo(1, y);
  term.eraseLine();
  fn();
}

function metricRow(term: Terminal, x: number, y: number, label: string, value: string, color?: string): number {
  renderLine(term, y, () => {
    term.moveTo(x, y);
    fg(term, themeColors.textMuted, label);
    if (color) {
      fg(term, color, ` ${value}`);
    } else {
      fg(term, themeColors.text, ` ${value}`);
    }
  });
  return y + 1;
}

function section(term: Terminal, x: number, startY: number, title: string, rows: [string, string, string?][]): number {
  let y = startY;

  renderLine(term, y, () => {
    term.moveTo(x, y);
    term.bold();
    fg(term, themeColors.accent, title);
    term.styleReset(true);
  });
  y++;

  for (const [label, value, color] of rows) {
    y = metricRow(term, x, y, label, value, color);
  }

  return y + 1;
}

async function poll(): Promise<void> {
  const cfg = state.config;
  if (!cfg) return;
  try {
    const raw = await getServerMetrics(cfg);
    state.metrics = {
      promptTokensPerSec: raw.promptTokensPerSec,
      predictedTokensPerSec: raw.predictedTokensPerSec,
      totalTokens: raw.promptTokensTotal + raw.tokensPredictedTotal,
      requestsProcessing: raw.requestsProcessing,
      requestsDeferred: raw.requestsDeferred,
      promptSecondsTotal: raw.promptSecondsTotal,
      tokensPredictedSecondsTotal: raw.tokensPredictedSecondsTotal,
      nDecodeTotal: raw.nDecodeTotal,
      nTokensMax: raw.nTokensMax,
    };
    state.connected = true;
    state.lastPoll = Date.now();
  } catch {
    state.connected = false;
  }
}

function initPoll(): void {
  if (state.pollInterval) clearInterval(state.pollInterval);
  poll();
  const interval = (state.config?.dashboard?.pollIntervalMs ?? 2000);
  state.pollInterval = setInterval(poll, interval);
}

loadConfig().then((cfg: ConfigData) => {
  state.config = cfg;
  initPoll();
});

export function render(app: any): void {
  const term = app.term as Terminal;
  const { metrics, connected, lastPoll } = state;
  const serverStatus = getStatus();
  const serverRunning = serverStatus.running;

  if (!serverRunning && !connected) {
    const midY = Math.floor(termHeight(term) / 2);
    renderLine(term, midY, () => {
      term.bold();
      fg(term, themeColors.warning, "Server not running");
      term.styleReset(true);
    });
    renderLine(term, midY + 1, () => {
      fg(term, themeColors.textMuted, "Start the server from the ");
      fg(term, themeColors.accent, "[Server]");
      fg(term, themeColors.textMuted, " tab to see live metrics.");
    });
    return;
  }

  if (!metrics) {
    const midY = Math.floor(termHeight(term) / 2);
    renderLine(term, midY, () => {
      term.bold();
      fg(term, themeColors.text, "Connecting to server...");
      term.styleReset(true);
    });
    renderLine(term, midY + 1, () => {
      fg(term, themeColors.textMuted, "Fetching initial stats");
    });
    return;
  }

  let y = 3;

  // Header
  renderLine(term, y, () => {
    fg(term, themeColors.text, "Dashboard");
    term('  ');
    fg(term, themeColors.textMuted, lastPoll ? `Last update: ${new Date(lastPoll).toLocaleTimeString()}` : "-");
    term('  ');
    fg(term, connected ? themeColors.success : themeColors.danger, connected ? "\u25cf Connected" : "\u25cf Disconnected");
  });
  y++;

  // Three columns
  const colWidth = Math.floor((termWidth(term) - 6) / 3);
  const x1 = 1;
  const x2 = 1 + colWidth + 3;
  const x3 = 1 + 2 * (colWidth + 3);

  const tokenRows: [string, string, string?][] = [
    ["gen t/s", metrics.predictedTokensPerSec.toFixed(1), themeColors.success],
    ["prompt t/s", metrics.promptTokensPerSec.toFixed(1)],
    ["total tokens", metrics.totalTokens.toLocaleString()],
    ["prompt time", formatDuration(metrics.promptSecondsTotal)],
    ["gen time", formatDuration(metrics.tokensPredictedSecondsTotal)],
  ];

  const procRows: [string, string, string?][] = [
    ["n_decode", metrics.nDecodeTotal.toLocaleString()],
    ["n_tokens_max", metrics.nTokensMax.toLocaleString()],
  ];

  const queueRows: [string, string, string?][] = [
    ["Processing", String(metrics.requestsProcessing), metrics.requestsProcessing > 0 ? themeColors.success : themeColors.textMuted],
    ["Deferred", String(metrics.requestsDeferred), metrics.requestsDeferred > 0 ? themeColors.warning : themeColors.textMuted],
  ];

  const baseY = y;
  section(term, x1, baseY, "Token Stats", tokenRows);
  section(term, x2, baseY, "Processing", procRows);
  section(term, x3, baseY, "Queue", queueRows);
}

export function handleKey(_app: any, _key: string): boolean {
  return false;
}

export function dispose(): void {
  if (state.pollInterval) {
    clearInterval(state.pollInterval);
    state.pollInterval = null;
  }
  state.metrics = null;
  state.connected = false;
  state.config = null;
}
