import { Column } from "../ui/Layout.js";
import { ButtonBar } from "../ui/widgets/ButtonBar.js";
import { Button } from "../ui/widgets/Button.js";
import { fg, themeColors, termWidth, renderDivider, renderLine } from "../../lib/theme.js";
import { loadConfig, ConfigData, getActivePresets } from "../../lib/config.js";
import { getServerMetrics } from "../../lib/api.js";
import { getStatus, startServer, stopServer } from "../../lib/server.js";
import { fireAsync, formatDuration, formatUptime } from "../../lib/utils.js";
import type { TabContext } from "../../lib/tabcontext.js";
import type { RenderContext, Size } from "../ui/types.js";

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

interface ColSection {
  x: number;
  title: string;
  rows: [string, string, string?][];
}

export class DashboardControl extends Column {
  protected _ctx: TabContext | null = null;
  protected _metrics: DashboardMetrics | null = null;
  protected _connected = false;
  protected _lastPoll: number | null = null;
  protected _config: ConfigData | null = null;
  protected _pollInterval: ReturnType<typeof setInterval> | null = null;
  protected _serverState: "stopped" | "starting" | "running" | "stopping" = "stopped";
  protected _pid: number | null = null;
  protected _uptime = 0;
  protected _statusInterval: ReturnType<typeof setInterval> | null = null;
  protected _spinnerIndex = 0;
  protected _buttonBar: ButtonBar;
  protected _configLoaded = false;

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;
    this.enabled = true;
    this._buttonBar = new ButtonBar();
    this._buttonBar.add(new Button({ label: "Start", action: () => this._onStart() }));
    this._buttonBar.add(new Button({ label: "Stop", action: () => this._onStop() }));
    this._buttonBar.add(new Button({ label: "Restart", action: () => this._onRestart() }));
  }

  get metrics(): DashboardMetrics | null {
    return this._metrics;
  }

  measure(_parentSize?: Size): Size {
    return { width: _parentSize?.width || 80, height: _parentSize?.height || 20 };
  }

  attach(renderContext: RenderContext): void {
    super.attach(renderContext);
    this._buttonBar.attach(renderContext);
  }

  detach(): void {
    this._buttonBar.detach();
    super.detach();
  }

  onAttach(): void {
    super.onAttach();
    this._ensureConfigLoaded();
  }

  onDetach(): void {
    this._stopPolling();
    this._stopStatusPolling();
    super.onDetach();
  }

  render(): void {
    if (!this.visible || !this.needsRender || !this._ctx) return;
    this._spinnerIndex = (this._spinnerIndex + 1) % 4;
    const term = this.term;
    const { x, y, width, height } = this.rect;

    let cy = y;

    cy = this._renderServerStatus(term, cy);
    cy = this._renderControls(term, cy);
    renderDivider(term, cy++, themeColors.border);
    cy++;

    if (this._serverState === "stopped") {
      const midY = Math.floor((y + cy) / 2);
      renderLine(term, midY, () => {
        term.bold();
        fg(term, themeColors.warning, "Server not running");
        term.styleReset(true);
      });
      renderLine(term, midY + 1, () => {
        fg(term, themeColors.textMuted, "Use Start above to launch the server.");
      });
      this.needsRender = false;
      return;
    }

    if (!this._metrics) {
      const midY = Math.floor((y + cy) / 2);
      renderLine(term, midY, () => {
        term.bold();
        fg(term, themeColors.text, "Connecting to server...");
        term.styleReset(true);
      });
      renderLine(term, midY + 1, () => {
        fg(term, themeColors.textMuted, "Fetching initial stats");
      });
      this.needsRender = false;
      return;
    }

    cy = this._renderDashboard(term, cy);
    this.needsRender = false;
  }

  handleKey(key: string): boolean {
    const handled = this._buttonBar.handleKey(key);
    if (handled) {
      this.needsRender = true;
      this._ctx?.scheduleRender();
      return true;
    }
    return false;
  }

  // — Private methods —

  _updateButtons(): void {
    const buttons = this._buttonBar.getButtons();
    buttons[0].disabled = false;
    buttons[1].disabled = false;
    buttons[2].disabled = false;
  }

  _onStart(): void {
    if (!this._ctx) return;
    const ctx = this._ctx;
    const cfg = this._config;
    if (!cfg) {
      ctx.showMessage("No configuration loaded");
      return;
    }
    if (this._serverState === "running") {
      ctx.showMessage("Server already running");
      return;
    }
    if (this._serverState === "starting") {
      ctx.showMessage("Server already starting");
      return;
    }
    if (!cfg.activeVersion) {
      ctx.showMessage("No active version selected. Install one from the Versions tab.");
      return;
    }
    fireAsync(async () => {
      this._serverState = "starting";
      const pid = await startServer(cfg);
      this._pid = pid;
      this._uptime = 0;
      this._serverState = "running";
      this._startStatusPolling();
      ctx.showMessage(`Server started (PID ${pid})`);
    }, ctx);
  }

  _onStop(): void {
    if (!this._ctx) return;
    const ctx = this._ctx;
    if (this._serverState !== "running") {
      ctx.showMessage("Server not running");
      return;
    }
    fireAsync(async () => {
      this._serverState = "stopping";
      await stopServer();
      this._serverState = "stopped";
      this._pid = null;
      this._uptime = 0;
      this._stopStatusPolling();
      ctx.showMessage("Server stopped");
    }, ctx);
  }

  _onRestart(): void {
    if (!this._ctx) return;
    const ctx = this._ctx;
    const cfg = this._config;
    if (!cfg) {
      ctx.showMessage("No configuration loaded");
      return;
    }
    if (this._serverState !== "running") {
      ctx.showMessage("Server not running");
      return;
    }
    if (!cfg.activeVersion) {
      ctx.showMessage("No active version selected");
      return;
    }
    fireAsync(async () => {
      this._serverState = "stopping";
      await stopServer();
      if (!this._config) return;
      this._serverState = "starting";
      const pid = await startServer(this._config);
      this._pid = pid;
      this._uptime = 0;
      this._serverState = "running";
      this._startStatusPolling();
      ctx.showMessage(`Server restarted (PID ${pid})`);
    }, ctx);
  }

  _renderServerStatus(term: any, startY: number): number {
    const width = termWidth(term);
    const statusDot = this._serverState === "starting" || this._serverState === "stopping"
      ? ["-", "\\", "|", "/"][this._spinnerIndex % 4]
      : "\u25cf";

    const statusText =
      this._serverState === "running" ? "running" :
      this._serverState === "starting" ? "starting" :
      this._serverState === "stopping" ? "stopping" : "stopped";

    const pidText = this._pid ? `PID: ${this._pid}` : "";
    const uptimeText = this._uptime > 0 ? `Uptime: ${formatUptime(this._uptime)}` : "";

    const statusColor =
      this._serverState === "running" ? themeColors.success :
      this._serverState === "stopped" ? themeColors.danger :
      themeColors.warning;

    let cy = startY;
    renderLine(term, cy++, () => {
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

    const version = this._config?.activeVersion || "none";
    let host = "127.0.0.1";
    let port = 8080;
    if (this._config) {
      const p = getActivePresets(this._config);
      host = String(p.server?.host || "127.0.0.1");
      port = Number(p.server?.port || 8080);
    }
    const url = `http://${host}:${port}`;
    const infoLine = ` Version: ${version} │ URL: ${url} `;

    renderLine(term, cy++, () => {
      fg(term, themeColors.textMuted, infoLine);
      const pad = Math.max(0, width - infoLine.length);
      term(" ".repeat(pad));
    });

    renderDivider(term, cy++, themeColors.border);
    return cy;
  }

  _renderControls(term: any, startY: number): number {
    this._updateButtons();
    const buttons = this._buttonBar.getButtons();
    let totalWidth = 0;
    for (let i = 0; i < buttons.length; i++) {
      totalWidth += buttons[i]!.label.length + 4;
      if (i < buttons.length - 1) totalWidth += 2;
    }
    const rect = { x: 0, y: startY, width: totalWidth, height: 1 };
    this._buttonBar.rect = rect;
    this._buttonBar.onLayout();
    this._buttonBar.needsRender = true;
    this._buttonBar.render();

    let y = startY + 1;

    const noVersion = !this._config?.activeVersion;
    if (noVersion) {
      renderLine(term, y++, () => {
        fg(term, themeColors.warning, "  No version installed");
      });
    }

    return y;
  }

  _renderDashboard(term: any, startY: number): number {
    let cy = startY;
    const { metrics, connected, _lastPoll } = { metrics: this._metrics, connected: this._connected, _lastPoll: this._lastPoll };
    if (!metrics) return cy;

    renderLine(term, cy, () => {
      fg(term, themeColors.text, "Dashboard");
      term("  ");
      fg(term, themeColors.textMuted, _lastPoll ? `Last update: ${new Date(_lastPoll).toLocaleTimeString()}` : "-");
      term("  ");
      fg(term, connected ? themeColors.success : themeColors.danger, connected ? "\u25cf Connected" : "\u25cf Disconnected");
    });
    cy++;
    renderDivider(term, cy, themeColors.border);
    cy++;

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

    cy = this._renderMultiColumn(term, cy, [
      { x: x1, title: "Token Stats", rows: tokenRows },
      { x: x2, title: "Processing", rows: procRows },
      { x: x3, title: "Queue", rows: queueRows },
    ]);

    return cy;
  }

  _renderMultiColumn(term: any, startY: number, sections: ColSection[]): number {
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

  // — Polling —

  _ensureConfigLoaded(): void {
    if (this._configLoaded) return;
    this._configLoaded = true;
    const ctx = this._ctx!;
    loadConfig().then((cfg: ConfigData) => {
      this._config = cfg;
      this._startStatusPolling();
      this._initPoll();
    });
  }

  _startStatusPolling(): void {
    if (this._statusInterval) clearInterval(this._statusInterval);
    const ctx = this._ctx!;
    this._updateServerStatus();
    this._statusInterval = setInterval(() => {
      this._updateServerStatus();
    }, 1000);
  }

  _stopStatusPolling(): void {
    if (this._statusInterval) {
      clearInterval(this._statusInterval);
      this._statusInterval = null;
    }
  }

  _updateServerStatus(): void {
    const status = getStatus();
    if (status.running) {
      this._serverState = "running";
      this._pid = status.pid;
      this._uptime = status.uptime;
    } else {
      if (this._serverState === "starting" || this._serverState === "running") {
        this._serverState = "stopped";
      }
      this._pid = null;
      this._uptime = 0;
    }
    this.needsRender = true;
    if (this._ctx) this._ctx.scheduleRender();
  }

  _initPoll(): void {
    if (this._pollInterval) clearInterval(this._pollInterval);
    this._poll();
    const interval = (this._config?.dashboard?.pollIntervalMs ?? 2000);
    this._pollInterval = setInterval(() => this._poll(), interval);
  }

  _stopPolling(): void {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }

  async _poll(): Promise<void> {
    const cfg = this._config;
    if (!cfg) return;
    const ctx = this._ctx!;
    try {
      const raw = await getServerMetrics(cfg);
      this._metrics = {
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
      this._connected = true;
      this._lastPoll = Date.now();
    } catch {
      this._connected = false;
    }
    this.needsRender = true;
    ctx.scheduleRender();
  }
}

export function createDashboardTab(ctx: TabContext) {
  return new DashboardControl(ctx);
}
