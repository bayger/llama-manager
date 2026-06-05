import type { Terminal } from "terminal-kit";
import { themeColors, fg, termWidth, termHeight, renderDivider, renderLine } from "../../lib/theme.js";
import { renderButtonBar, moveButtonIndex, ButtonItem } from "../shared/Button.js";
import { loadConfig, ConfigData, getActivePresets } from "../../lib/config.js";
import { getServerMetrics } from "../../lib/api.js";
import { getStatus, startServer, stopServer } from "../../lib/server.js";
import { fireAsync, formatDuration, formatUptime } from "../../lib/utils.js";
import { TabContext } from "../../lib/tabcontext.js";

const CONTROLS = ["Start", "Stop", "Restart"];

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
  serverState: "stopped" | "starting" | "running" | "stopping";
  pid: number | null;
  uptime: number;
  statusInterval: ReturnType<typeof setInterval> | null;
  spinnerIndex: number;
  focusArea: "controls" | "none";
  controlIndex: number;
  configLoaded: boolean;
}

export function createDashboardTab(ctx: TabContext) {
  let state: DashboardState = {
    metrics: null,
    connected: false,
    lastPoll: null,
    config: null,
    pollInterval: null,
    serverState: "stopped",
    pid: null,
    uptime: 0,
    statusInterval: null,
    spinnerIndex: 0,
    focusArea: "controls",
    controlIndex: 0,
    configLoaded: false,
  };

  const scheduleRender = ctx.scheduleRender.bind(ctx);
  const showMessage = ctx.showMessage.bind(ctx);

  function updateServerStatus(): void {
    const status = getStatus();
    if (status.running) {
      state.serverState = "running";
      state.pid = status.pid;
      state.uptime = status.uptime;
    } else {
      if (state.serverState === "starting" || state.serverState === "running") {
        state.serverState = "stopped";
      }
      state.pid = null;
      state.uptime = 0;
    }
    scheduleRender();
  }

  function startStatusPolling(): void {
    if (state.statusInterval) clearInterval(state.statusInterval);
    state.statusInterval = setInterval(updateServerStatus, 1000);
    updateServerStatus();
  }

  function stopStatusPolling(): void {
    if (state.statusInterval) {
      clearInterval(state.statusInterval);
      state.statusInterval = null;
    }
  }

  function renderServerStatus(term: Terminal, startY: number): number {
    const width = termWidth(term);
    const statusDot = state.serverState === "starting" || state.serverState === "stopping"
      ? ["-", "\\", "|", "/"][state.spinnerIndex % 4]
      : "\u25cf";

    const statusText =
      state.serverState === "running" ? "running" :
      state.serverState === "starting" ? "starting" :
      state.serverState === "stopping" ? "stopping" : "stopped";

    const pidText = state.pid ? `PID: ${state.pid}` : "";
    const uptimeText = state.uptime > 0 ? `Uptime: ${formatUptime(state.uptime)}` : "";

    const statusColor =
      state.serverState === "running" ? themeColors.success :
      state.serverState === "stopped" ? themeColors.danger :
      themeColors.warning;

    let y = startY;
    renderLine(term, y++, () => {
      term.bold();
      fg(term, themeColors.text, `  Server │ `);
      fg(term, statusColor, `${statusDot} ${statusText}`);
      term.styleReset();
      let rest = "";
      if (pidText) rest += ` │ ${pidText}`;
      if (uptimeText) rest += ` │ ${uptimeText}`;
      fg(term, themeColors.text, rest);
      const used = `  Server │ `.length + `${statusDot} ${statusText}`.length + rest.length;
      term(" ".repeat(Math.max(0, width - used)));
    });

    const version = state.config?.activeVersion || "none";
    let host = "127.0.0.1";
    let port = 8080;
    if (state.config) {
      const p = getActivePresets(state.config);
      host = String(p.server?.host || "127.0.0.1");
      port = Number(p.server?.port || 8080);
    }
    const url = `http://${host}:${port}`;
    const infoLine = ` Version: ${version} │ URL: ${url} `;

    renderLine(term, y++, () => {
      fg(term, themeColors.textMuted, infoLine);
      const pad = Math.max(0, width - infoLine.length);
      term(" ".repeat(pad));
    });

    renderDivider(term, y++, themeColors.border);
    return y;
  }

  function getControlItems(): ButtonItem[] {
    const running = state.serverState === "running";
    const starting = state.serverState === "starting";
    const stopping = state.serverState === "stopping";
    return [
      { label: "Start", disabled: running || starting },
      { label: "Stop", disabled: !running },
      { label: "Restart", disabled: !running || stopping },
    ];
  }

  function renderControlsBar(term: Terminal, startY: number): number {
    return renderButtonBar({
      term,
      startY,
      items: getControlItems(),
      selectedIndex: state.focusArea === "controls" ? state.controlIndex : -1,
    });
  }

  function executeControl(index: number): void {
    if (!state.config) {
      showMessage("No configuration loaded");
      return;
    }

    const control = CONTROLS[index];

    switch (control) {
      case "Start": {
        if (state.serverState === "running" || state.serverState === "starting") {
          showMessage("Server already running");
          return;
        }
        if (!state.config.activeVersion) {
          showMessage("No active version selected. Install one from the Versions tab.");
          return;
        }
        fireAsync(async () => {
          state.serverState = "starting";
          const pid = await startServer(state.config!);
          state.pid = pid;
          state.uptime = 0;
          state.serverState = "running";
          startStatusPolling();
          showMessage(`Server started (PID ${pid})`);
        }, ctx);
        break;
      }

      case "Stop": {
        if (state.serverState !== "running") {
          showMessage("Server not running");
          return;
        }
        fireAsync(async () => {
          state.serverState = "stopping";
          await stopServer();
          state.serverState = "stopped";
          state.pid = null;
          state.uptime = 0;
          stopStatusPolling();
          showMessage("Server stopped");
        }, ctx);
        break;
      }

      case "Restart": {
        if (state.serverState !== "running") {
          showMessage("Server not running");
          return;
        }
        if (!state.config.activeVersion) {
          showMessage("No active version selected");
          return;
        }
        fireAsync(async () => {
          state.serverState = "stopping";
          await stopServer();
          if (!state.config) return;
          state.serverState = "starting";
          const pid = await startServer(state.config);
          state.pid = pid;
          state.uptime = 0;
          state.serverState = "running";
          startStatusPolling();
          showMessage(`Server restarted (PID ${pid})`);
        }, ctx);
        break;
      }
    }
  }

  function renderMultiColumn(term: Terminal, startY: number, sections: ColSection[]): number {
    const maxRows = Math.max(...sections.map(s => s.rows.length + 1));

    for (let i = 0; i < maxRows; i++) {
      const y = startY + i;
      renderLine(term, y, () => {
        for (const sec of sections) {
          term.moveTo(sec.x, y);
          if (i === 0) {
            term.bold();
            fg(term, themeColors.accent, sec.title);
            term.styleReset();
          } else {
            const rowIdx = i - 1;
            if (rowIdx < sec.rows.length) {
              const [label, value, color] = sec.rows[rowIdx]!;
              fg(term, themeColors.textMuted, label);
              if (color) {
                fg(term, color, ` ${value}`);
              } else {
                fg(term, themeColors.text, ` ${value}`);
              }
            }
          }
        }
      });
    }

    return startY + maxRows;
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

  function ensureConfigLoaded(): void {
    if (state.configLoaded) return;
    state.configLoaded = true;
    loadConfig().then((cfg: ConfigData) => {
      state.config = cfg;
      startStatusPolling();
      initPoll();
    });
  }

  function render(): void {
    ensureConfigLoaded();

    const term = ctx.term;
    state.spinnerIndex = (state.spinnerIndex + 1) % 4;
    const { metrics, connected, lastPoll } = state;

    let y = 3;

    y = renderServerStatus(term, y);
    y = renderControlsBar(term, y);
    renderDivider(term, y++, themeColors.border);
    y++;

    if (!state.serverState || state.serverState === "stopped") {
      const midY = Math.floor(termHeight(term) / 2);
      renderLine(term, midY, () => {
        term.bold();
        fg(term, themeColors.warning, "Server not running");
        term.styleReset(true);
      });
      renderLine(term, midY + 1, () => {
        fg(term, themeColors.textMuted, "Use Start above to launch the server.");
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

    renderLine(term, y, () => {
      fg(term, themeColors.text, "Dashboard");
      term('  ');
      fg(term, themeColors.textMuted, lastPoll ? `Last update: ${new Date(lastPoll).toLocaleTimeString()}` : "-");
      term('  ');
      fg(term, connected ? themeColors.success : themeColors.danger, connected ? "\u25cf Connected" : "\u25cf Disconnected");
    });
    y++;
    renderDivider(term, y, themeColors.border);
    y++;

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

    renderMultiColumn(term, y, [
      { x: x1, title: "Token Stats", rows: tokenRows },
      { x: x2, title: "Processing", rows: procRows },
      { x: x3, title: "Queue", rows: queueRows },
    ]);
  }

  function handleKey(key: string): boolean {
    if (state.focusArea === "controls") {
     if (key === "h" || key === "LEFT") {
          state.controlIndex = moveButtonIndex(getControlItems(), state.controlIndex, -1);
          scheduleRender();
          return true;
        }
        if (key === "l" || key === "RIGHT") {
          state.controlIndex = moveButtonIndex(getControlItems(), state.controlIndex, 1);
          scheduleRender();
          return true;
        }
        if (key === "RETURN" || key === "ENTER") {
          const items = getControlItems();
          if (!items[state.controlIndex]?.disabled) {
            executeControl(state.controlIndex);
          }
          scheduleRender();
          return true;
        }
    }
    return false;
  }

  function dispose(): void {
    if (state.pollInterval) {
      clearInterval(state.pollInterval);
      state.pollInterval = null;
    }
    stopStatusPolling();
    state.metrics = null;
    state.connected = false;
    state.config = null;
    state.serverState = "stopped";
    state.pid = null;
    state.uptime = 0;
    state.spinnerIndex = 0;
    state.controlIndex = 0;
    state.configLoaded = false;
  }

  return {
    render,
    handleKey,
    dispose,
  };
}

interface ColSection {
  x: number;
  title: string;
  rows: [string, string, string?][];
}
