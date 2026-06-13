import { Control } from "../ui/Control.js";
import { fg, themeColors } from "../../lib/theme.js";
import { getGlobal, getSlots, getCache, onMetricsChange, type SlotMetrics, type SlotCheckpoint } from "../../lib/metricstracker.js";
import { formatNum, formatDraftRate, formatMs } from "../../lib/utils.js";
import type { RenderContext, Size } from "../ui/types.js";
import type { FramebufferCanvas } from "../../lib/framebuffer-canvas.js";

const STATE_DOT = {
  idle: "\u25cb",
  prompting: "\u25cf",
  generating: "\u25cf",
};

const STATE_COLOR = {
  idle: themeColors.textMuted,
  prompting: themeColors.warning,
  generating: themeColors.success,
};

const THINKING_ICON = "\u221e";
const SEP = "\u2502";

function progressBar(width: number, progress: number): string {
  const filled = Math.round(progress * width);
  const empty = width - filled;
  return "\u2588".repeat(filled) + "\u2591".repeat(empty);
}

function checkpointBar(contextSize: number, checkpoints: SlotCheckpoint[]): string {
  const segments = 10;
  let bar = "";
  for (let i = 0; i < segments; i++) {
    const lo = (i / segments) * contextSize;
    const hi = ((i + 1) / segments) * contextSize;
    const hasCp = checkpoints.some(cp => cp.pos >= lo && cp.pos < hi);
    bar += hasCp ? "\u2588" : "\u2591";
  }
  return bar;
}

function padLeft(n: number, w: number): string {
  return String(n).padStart(w);
}

function speedStr(speed: number): string {
  return speed.toFixed(1).padStart(7);
}

export class MetricsPanel extends Control {
  focusable = false;
  protected _unsub: (() => void) | null = null;
  protected _renderTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this._unsub = onMetricsChange(() => {
      if (this._renderTimer) clearTimeout(this._renderTimer);
      this._renderTimer = setTimeout(() => {
        this.markDirty();
      }, 100);
    });
  }

  measure(parentSize?: Size): Size {
    const slots = getSlots();
    const global = getGlobal();
    const cache = getCache();
    const numSlots = slots.length;
    const globalLines = global ? (cache ? 3 : 2) : 1;
    const gapAfterGlobal = numSlots > 0 ? 1 : 0;
    const slotLines = numSlots * 4;
    const gapBetweenSlots = Math.max(0, numSlots - 1);
    const totalHeight = globalLines + gapAfterGlobal + slotLines + gapBetweenSlots;
    return {
      width: parentSize?.width ?? this.rect.width,
      height: Math.min(totalHeight, parentSize?.height ?? 999),
    };
  }

  render(ctx: RenderContext): void {
    if (!this.visible || !this.needsRender) return;
    const { canvas } = ctx;
    const { x, y, width } = this.rect;

    canvas.colorRgbHex(themeColors.canvas);
    canvas.bgColorRgbHex(themeColors.canvas);
    canvas.clearRect(x, y, width, this.rect.height);

    const global = getGlobal();
    const slots = getSlots();
    const numSlots = slots.length;

    let cy = y;

    if (cy >= y + this.rect.height) {
      this.needsRender = false;
      return;
    }

    if (global) {
      canvas.moveTo(x, cy);
      fg(canvas, themeColors.textMuted, "Tasks ");
      fg(canvas, themeColors.accent, String(global.tasksCompleted));
      fg(canvas, themeColors.textMuted, `  ${SEP}  Avg prompt `);
      fg(canvas, themeColors.info, speedStr(global.avgPromptSpeed));
      fg(canvas, themeColors.textMuted, ` t/s  ${SEP}  Avg gen `);
      fg(canvas, themeColors.success, speedStr(global.avgGenSpeed));
      fg(canvas, themeColors.textMuted, " t/s");
      cy++;

      if (cy < y + this.rect.height) {
        canvas.moveTo(x, cy);
        fg(canvas, themeColors.textMuted, `  Tokens  ${formatNum(global.totalPromptTokens)}p / ${formatNum(global.totalOutputTokens)}o  ${SEP}  Draft `);
        fg(canvas, themeColors.accentColor, formatDraftRate(global.avgDraftAcceptance));
        if (global.activeSlots > 0) {
          fg(canvas, themeColors.textMuted, `  ${SEP}  Active `);
          fg(canvas, themeColors.warning, String(global.activeSlots));
        }
        cy++;
      }

      const cache = getCache();
      if (cache && cy < y + this.rect.height) {
        const barWidth = Math.max(10, Math.min(30, width - 50));
        const ratio = cache.limitMiB > 0 ? cache.usedMiB / cache.limitMiB : 0;
        const bar = progressBar(barWidth, Math.min(1, ratio));
        canvas.moveTo(x, cy);
        fg(canvas, themeColors.textMuted, "  Cache ");
        fg(canvas, ratio > 0.9 ? themeColors.danger : themeColors.accent, bar);
        fg(canvas, themeColors.textMuted, `  ${cache.usedMiB.toFixed(1)} / ${cache.limitMiB.toFixed(0)} MiB`);
        fg(canvas, themeColors.textMuted, `  ${SEP}  ${cache.numPrompts} prompts`);
        cy++;
      }
    } else {
      canvas.moveTo(x, cy);
      fg(canvas, themeColors.textMuted, "No tasks yet — start server and send a request");
      cy++;
    }

    if (cy >= y + this.rect.height) {
      this.needsRender = false;
      return;
    }

    for (let i = 0; i < numSlots; i++) {
      const slot = slots[i];

      if (i === 0 && cy < y + this.rect.height) {
        canvas.moveTo(x, cy);
        fg(canvas, themeColors.canvas, " ".repeat(width));
        cy++;
      }

      if (i > 0 && cy < y + this.rect.height) {
        canvas.moveTo(x, cy);
        fg(canvas, themeColors.canvas, " ".repeat(width));
        cy++;
      }

      if (cy >= y + this.rect.height) break;

      cy = this.renderSlot(canvas, x, cy, width, slot);
    }

    this.needsRender = false;
  }

  renderSlot(
    canvas: FramebufferCanvas,
    x: number,
    startY: number,
    width: number,
    slot: SlotMetrics
  ): number {
    let cy = startY;
    const stateColor = STATE_COLOR[slot.state as keyof typeof STATE_COLOR] || themeColors.textMuted;
    const dot = STATE_DOT[slot.state as keyof typeof STATE_DOT] || "\u25cb";

    // Line 1: Slot N  ● State  Task #N  Draft: X%  [thinking]
    if (cy < startY + 5) {
      canvas.moveTo(x, cy);
      fg(canvas, themeColors.textMuted, `Slot ${slot.slotId}  `);
      fg(canvas, stateColor, `${dot} ${slot.state}`);
      if (slot.taskId !== null) {
        fg(canvas, themeColors.textMuted, `  Task #`);
        fg(canvas, themeColors.text, String(slot.taskId));
      }
      if (slot.lastTask && slot.lastTask.draftGenerated > 0) {
        fg(canvas, themeColors.textMuted, `  ${SEP}  Draft `);
        fg(canvas, themeColors.accentColor, formatDraftRate(slot.lastTask.draftAcceptance));
      }
      if (slot.thinking) {
        fg(canvas, themeColors.accentColor, `  ${THINKING_ICON}`);
      }
      cy++;
    }

    // Line 2: Live speed + context
    if (cy < startY + 5) {
      canvas.moveTo(x, cy);
      fg(canvas, themeColors.textMuted, "  ");
      if (slot.generationSpeed !== null) {
        fg(canvas, themeColors.textMuted, "Gen ");
        fg(canvas, themeColors.success, `${slot.generationSpeed.toFixed(1)} t/s`);
      } else if (slot.promptSpeed !== null && slot.state === "prompting") {
        fg(canvas, themeColors.textMuted, "Prompt ");
        fg(canvas, themeColors.info, `${slot.promptSpeed.toFixed(0)} t/s`);
      } else {
        fg(canvas, themeColors.textMuted, "...");
      }
      fg(canvas, themeColors.textMuted, `  ${SEP}  Context `);
      fg(canvas, themeColors.text, `${formatNum(slot.contextSize)} tok`);
      if (slot.checkpoints.length > 0) {
        const bar = checkpointBar(slot.contextSize, slot.checkpoints);
        const totalChkMiB = slot.checkpoints.reduce((s, cp) => s + cp.sizeMiB, 0);
        fg(canvas, themeColors.textMuted, `  ${SEP}  Chk: `);
        fg(canvas, themeColors.accent, bar);
        fg(canvas, themeColors.textMuted, `  ${slot.checkpoints.length}/32  ${totalChkMiB.toFixed(1)} MiB`);
      }
      cy++;
    }

    // Line 3: Progress bar (if prompting) or last task summary
    if (cy < startY + 5) {
      canvas.moveTo(x, cy);
      if (slot.promptProgress !== null && slot.state === "prompting") {
        const barWidth = Math.max(10, Math.min(40, width - 40));
        const bar = progressBar(barWidth, Math.min(1, slot.promptProgress));
        fg(canvas, themeColors.textMuted, "  ");
        fg(canvas, themeColors.accent, bar);
        fg(canvas, themeColors.textMuted, ` ${(slot.promptProgress * 100).toFixed(0)}%`);
      } else if (slot.lastTask) {
        const lt = slot.lastTask;
        fg(canvas, themeColors.textMuted, "  Last: ");
        fg(canvas, themeColors.info, `${padLeft(lt.promptTokens, 5)}p`);
        fg(canvas, themeColors.textMuted, " / ");
        fg(canvas, themeColors.success, `${padLeft(lt.outputTokens, 5)}o`);
        fg(canvas, themeColors.textMuted, "  ");
        fg(canvas, themeColors.info, `${speedStr(lt.promptSpeed)}p`);
        fg(canvas, themeColors.textMuted, "/");
        fg(canvas, themeColors.success, `${speedStr(lt.outputSpeed)}o`);
        fg(canvas, themeColors.textMuted, `  ${SEP}  ${formatMs(lt.totalTimeMs)}`);
        if (lt.draftGenerated > 0) {
          fg(canvas, themeColors.textMuted, "  ");
          fg(canvas, themeColors.accentColor, `${lt.draftAccepted}/${lt.draftGenerated}d`);
        }
      } else {
        fg(canvas, themeColors.textMuted, "  No completed tasks");
      }
      cy++;
    }

    // Line 4-5: Additional context for last task or draft details
    if (cy < startY + 5 && slot.lastTask) {
      const lt = slot.lastTask;
      canvas.moveTo(x, cy);
      fg(canvas, themeColors.textMuted, "  ");
      if (lt.draftGenerated > 0) {
        fg(canvas, themeColors.textMuted, "Draft rate ");
        fg(canvas, themeColors.accentColor, formatDraftRate(lt.draftAcceptance));
        fg(canvas, themeColors.textMuted, `  ${SEP}  Truncated `);
        fg(canvas, lt.truncated ? themeColors.danger : themeColors.success, lt.truncated ? "yes" : "no");
      } else {
        fg(canvas, themeColors.textMuted, "No speculative decoding");
      }
      cy++;
    }

    if (cy < startY + 5) {
      cy++;
    }

    return cy;
  }

  onDestroy(): void {
    if (this._unsub) {
      this._unsub();
      this._unsub = null;
    }
    if (this._renderTimer) {
      clearTimeout(this._renderTimer);
      this._renderTimer = null;
    }
  }
}
