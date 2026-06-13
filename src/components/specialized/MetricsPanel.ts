import { Control } from "../ui/Control.js";
import { fg, themeColors } from "../../lib/theme.js";
import { getGlobal, getSlots, onMetricsChange, type SlotMetrics, type SlotCheckpoint } from "../../lib/metricstracker.js";
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
  for (let i = segments - 1; i >= 0; i--) {
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
    const numSlots = slots.length;
    const globalLines = global ? 2 : 1;
    const gapAfterGlobal = numSlots > 0 ? 1 : 0;
    // Each slot is 4 lines. Idle slots with no tasks are 1 line.
    const slotLines = slots.reduce((sum, s) => sum + (s.lastTask ? 4 : 1), 0);
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
      fg(canvas, themeColors.textMuted, `  ${SEP}  Prompt `);
      fg(canvas, themeColors.info, `${global.avgPromptSpeed.toFixed(1)} t/s`);
      fg(canvas, themeColors.textMuted, `  ${SEP}  Gen `);
      fg(canvas, themeColors.success, `${global.avgGenSpeed.toFixed(1)} t/s`);
      fg(canvas, themeColors.textMuted, `  ${SEP}  Tokens `);
      fg(canvas, themeColors.info, `${formatNum(global.totalPromptTokens)}p`);
      fg(canvas, themeColors.textMuted, " / ");
      fg(canvas, themeColors.success, `${formatNum(global.totalOutputTokens)}o`);
      cy++;

      if (cy < y + this.rect.height) {
        canvas.moveTo(x, cy);
        fg(canvas, themeColors.textMuted, "  Draft ");
        fg(canvas, themeColors.accentColor, formatDraftRate(global.avgDraftAcceptance));
        if (global.activeSlots > 0) {
          fg(canvas, themeColors.textMuted, `  ${SEP}  Active `);
          fg(canvas, themeColors.warning, String(global.activeSlots));
        }
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

    cy += 1; // gap after global metrics
    for (let i = 0; i < numSlots; i++) {
      const slot = slots[i];

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

    // Line 1: Slot N  ● State  Task #N  ∞
    canvas.moveTo(x, cy);
    fg(canvas, themeColors.textMuted, `Slot ${slot.slotId}  `);
    fg(canvas, stateColor, `${dot} ${slot.state}`);
    if (slot.taskId !== null) {
      fg(canvas, themeColors.textMuted, `  Task #`);
      fg(canvas, themeColors.text, String(slot.taskId));
    }
    if (slot.thinking) {
      fg(canvas, themeColors.accentColor, `  ${THINKING_ICON}`);
    }
    cy++;

    // Compact idle slot with no tasks and no live data — stop here
    if (
      !slot.lastTask &&
      slot.generationSpeed === null &&
      slot.promptSpeed === null &&
      slot.contextSize === 0 &&
      slot.checkpoints.length === 0
    ) {
      return cy;
    }

    // Line 2: Live speed + context + checkpoints
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

    // Line 3: Prompt progress bar or last task summary
    if (slot.promptProgress !== null && slot.state === "prompting") {
      const barWidth = Math.max(10, Math.min(40, width - 40));
      const bar = progressBar(barWidth, Math.min(1, slot.promptProgress));
      canvas.moveTo(x, cy);
      fg(canvas, themeColors.textMuted, "  ");
      fg(canvas, themeColors.accent, bar);
      fg(canvas, themeColors.textMuted, ` ${(slot.promptProgress * 100).toFixed(0)}%`);
      cy++;
    } else if (slot.lastTask) {
      canvas.moveTo(x, cy);
      fg(canvas, themeColors.textMuted, "  ");
      fg(canvas, themeColors.textMuted, "P ");
      fg(canvas, themeColors.info, `${padLeft(slot.lastTask.promptTokens, 5)}t @ ${slot.lastTask.promptSpeed.toFixed(1)}t/s`);
      fg(canvas, themeColors.textMuted, `  ${SEP}  G `);
      fg(canvas, themeColors.success, `${padLeft(slot.lastTask.outputTokens, 5)}t @ ${slot.lastTask.outputSpeed.toFixed(1)}t/s`);
      fg(canvas, themeColors.textMuted, `  ${SEP}  ${formatMs(slot.lastTask.totalTimeMs)}`);
      cy++;
    }

    // Line 4: Draft + truncation (last task data only)
    if (slot.lastTask) {
      canvas.moveTo(x, cy);
      fg(canvas, themeColors.textMuted, "  ");
      if (slot.lastTask.draftGenerated > 0) {
        fg(canvas, themeColors.textMuted, "Draft ");
        fg(canvas, themeColors.accentColor, `${formatDraftRate(slot.lastTask.draftAcceptance)} (${slot.lastTask.draftAccepted}/${slot.lastTask.draftGenerated})`);
        fg(canvas, themeColors.textMuted, `  ${SEP}  Truncated `);
        fg(canvas, slot.lastTask.truncated ? themeColors.danger : themeColors.success, slot.lastTask.truncated ? "yes" : "no");
      } else {
        fg(canvas, themeColors.textMuted, "No speculative decoding");
      }
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
