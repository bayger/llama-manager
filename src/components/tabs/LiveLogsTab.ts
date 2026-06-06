import { Column } from "../ui/Layout.js";
import { spawn } from "child_process";
import { themeColors, fg, termHeight, renderLine } from "../../lib/theme.js";
import { Divider } from "../ui/widgets/Divider.js";
import { HelpBar } from "../ui/widgets/HelpBar.js";
import { Label } from "../ui/widgets/Label.js";
import { onServerLog, serverLogLines, clearServerLogs, getStatus } from "../../lib/server.js";
import type { TabContext } from "../../lib/tabcontext.js";
import type { RenderContext, Size } from "../ui/types.js";

interface LogEntry {
  timestamp: string | null;
  level: string | null;
  component: string | null;
  message: string;
}

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

export class LiveLogsControl extends Column {
  protected _ctx: TabContext | null = null;
  protected _autoScroll = true;
  protected _scrollOffset = 0;
  protected _copied = false;
  protected _running = false;
  protected _logUnsub: (() => void) | null = null;
  protected _statusInterval: ReturnType<typeof setInterval> | null = null;
  protected _helpBar: HelpBar;
  protected _divider: Divider;
  protected _emptyLabel: Label;

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;
    this._helpBar = new HelpBar();
    this._divider = new Divider();
    this._emptyLabel = new Label();
    this._emptyLabel.color = themeColors.textMuted;
  }

  measure(_parentSize?: Size): Size {
    return { width: _parentSize?.width || 80, height: _parentSize?.height || 20 };
  }

  attach(renderContext: RenderContext): void {
    super.attach(renderContext);
    this._helpBar.attach(renderContext);
    this._divider.attach(renderContext);
    this._emptyLabel.attach(renderContext);
  }

  detach(): void {
    this._helpBar.detach();
    this._divider.detach();
    this._emptyLabel.detach();
    super.detach();
  }

  onAttach(): void {
    super.onAttach();
    const ctx = this._ctx!;
    this._logUnsub = onServerLog(() => {
      if (this._autoScroll) {
        this._scrollOffset = 0;
      }
      ctx.scheduleRender();
    });

    this._statusInterval = setInterval(() => {
      this._running = getStatus().running;
      ctx.scheduleRender();
    }, 2000);
  }

  onDetach(): void {
    if (this._logUnsub) {
      this._logUnsub();
      this._logUnsub = null;
    }
    if (this._statusInterval) {
      clearInterval(this._statusInterval);
      this._statusInterval = null;
    }
    super.onDetach();
  }

  render(): void {
    if (!this.visible || !this.needsRender || !this._ctx) return;
    const term = this.term;
    const lines = serverLogLines;
    const maxVisible = Math.max(1, termHeight(term) - 5);

    let y = this.rect.y;

    renderLine(term, y, () => {
      fg(term, themeColors.text, "Live Logs");
      term("  ");
      fg(term, themeColors.textMuted, "|");
      term("  ");
      fg(term, this._running ? themeColors.success : themeColors.danger, this._running ? "\u25cf Running" : "\u25d0 Stopped");
      term("  ");
      fg(term, themeColors.textMuted, "|");
      term("  ");
      fg(term, themeColors.textMuted, `${lines.length} lines`);
      term("  ");
      fg(term, themeColors.textMuted, "|");
      term("  ");
      fg(term, this._autoScroll ? themeColors.success : themeColors.textMuted, this._autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF");
    });
    y++;

    this._helpBar.text = "g auto-scroll | G top | u clear | y copy | arrows scroll";
    if (this._copied) {
      this._helpBar.prefix = " | Copied to clipboard!";
      this._helpBar.prefixColor = themeColors.success;
    } else {
      this._helpBar.prefix = "";
    }
    this._helpBar.rect = { x: 0, y: y, width: this.rect.width, height: 1 };
    this._helpBar.needsRender = true;
    this._helpBar.render();
    y++;

    this._divider.rect = { x: 0, y: y, width: this.rect.width, height: 1 };
    this._divider.needsRender = true;
    this._divider.render();
    y++;

    if (lines.length === 0) {
      this._emptyLabel.text = "Waiting for server output...";
      this._emptyLabel.rect = { x: 0, y: y, width: this.rect.width, height: 1 };
      this._emptyLabel.needsRender = true;
      this._emptyLabel.render();
      this.needsRender = false;
      return;
    }

    const visibleStart = this._autoScroll ? Math.max(0, lines.length - maxVisible) : this._scrollOffset;
    const visibleLines = lines.slice(visibleStart, visibleStart + maxVisible);

    for (const line of visibleLines) {
      const entry = parseLogLine(line);
      y = this._renderLogLine(term, y, entry);
    }

    this.needsRender = false;
  }

  handleKey(key: string): boolean {
    const lines = serverLogLines;
    const maxVisible = Math.max(1, this.term.height - 5);

    if (key === "UP" || key === "PAGE_UP") {
      this._autoScroll = false;
      this._scrollOffset = Math.max(0, this._scrollOffset - (key === "PAGE_UP" ? maxVisible : 1));
      return true;
    }
    if (key === "DOWN" || key === "PAGE_DOWN") {
      this._autoScroll = false;
      this._scrollOffset = Math.min(lines.length - maxVisible, this._scrollOffset + (key === "PAGE_DOWN" ? maxVisible : 1));
      return true;
    }
    if (key === "G") {
      this._autoScroll = false;
      this._scrollOffset = 0;
      return true;
    }
    if (key === "g") {
      this._autoScroll = true;
      this._scrollOffset = 0;
      return true;
    }
    if (key === "u") {
      clearServerLogs();
      this._scrollOffset = 0;
      return true;
    }
    if (key === "y") {
      if (lines.length === 0) return true;
      const text = lines.join("\n");
      try {
        const xclip = spawn("xclip", ["-selection", "clipboard"]);
        xclip.stdin.write(text + "\n");
        xclip.stdin.end();
      } catch {
        // xclip not available
      }
      this._copied = true;
      setTimeout(() => { this._copied = false; }, 2000);
      return true;
    }
    return false;
  }

  _renderLogLine(term: any, y: number, entry: LogEntry): number {
    renderLine(term, y, () => {
      fg(term, themeColors.textMuted, "> ");
      if (entry.timestamp) {
        fg(term, themeColors.textMuted, entry.timestamp);
        term(" ");
      }
      if (entry.level) {
        term.bold;
        fg(term, severityColor(entry.level), entry.level);
        term.styleReset(true);
        term(" ");
      }
      if (entry.component) {
        fg(term, themeColors.textMuted, entry.component);
        term(" ");
      }
      fg(term, themeColors.text, entry.message);
    });
    return y + 1;
  }
}

export function createLiveLogsTab(ctx: TabContext) {
  return new LiveLogsControl(ctx);
}
