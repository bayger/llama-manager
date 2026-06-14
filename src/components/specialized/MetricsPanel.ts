import { Control } from "../ui/Control.js";
import { fg } from "../../lib/theme.js";
import { getGlobal, getSlots, onMetricsChange, type SlotMetrics, type SlotCheckpoint } from "../../lib/metricstracker.js";
import { formatNum, formatDraftRate, formatMs } from "../../lib/utils.js";
import type { Color } from "../../lib/theme.js";
import type { RenderContext, Size } from "../ui/types.js";
import type { FramebufferCanvas } from "../../lib/framebuffer-canvas.js";

const STATE_DOT = {
  idle: "\u25cb",
  prompting: "\u25cf",
  generating: "\u25cf",
};

const STATE_COLOR: Record<string, Color> = {
  idle: "textMuted",
  prompting: "warning",
  generating: "success",
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

function slotHeight(s: SlotMetrics): number {
  // Line 1: header (always)
  let h = 1;
  // Early return if truly idle (no lastTask, no live data)
  if (
    !s.lastTask &&
    s.generationSpeed === null &&
    s.promptSpeed === null &&
    s.contextSize === 0 &&
    s.checkpoints.length === 0
  ) {
    return h;
  }
  // Line 2: speed + context + checkpoints
  h++;
  // Line 3: prompt progress (if prompting) or last task summary
  if (s.promptProgress !== null && s.state === "prompting") {
    h++;
  } else if (s.lastTask) {
    h++;
  }
  // Line 4: draft + truncation (only with lastTask)
  if (s.lastTask) {
    h++;
  }
  return h;
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
    const slotLines = slots.reduce((sum, s) => sum + slotHeight(s), 0);
    const gapBetweenSlots = Math.max(0, numSlots - 1);
    const totalHeight = globalLines + gapAfterGlobal + slotLines + gapBetweenSlots;
    return {
      width: parentSize?.width ?? this.rect.width,
      height: Math.min(totalHeight, parentSize?.height ?? 999),
    };
  }

  draw(ctx: RenderContext): void {
    const { canvas } = ctx;
    const { x, y, width } = this.rect;

    const global = getGlobal();
    const slots = getSlots();
    const numSlots = slots.length;

    let cy = y;

    if (cy >= y + this.rect.height) {
      return;
    }

    if (global) {
      canvas.moveTo(x, cy);
      fg(canvas, "textMuted", "Tasks ");
      fg(canvas, "accent", String(global.tasksCompleted));
      fg(canvas, "textMuted", `  ${SEP}  PP `);
      fg(canvas, "info", `${global.avgPromptSpeed.toFixed(1)} t/s`);
      fg(canvas, "textMuted", `  ${SEP}  TG `);
      fg(canvas, "success", `${global.avgGenSpeed.toFixed(1)} t/s`);
      fg(canvas, "textMuted", `  ${SEP}  Tokens `);
      fg(canvas, "info", `${formatNum(global.totalPromptTokens)}p`);
      fg(canvas, "textMuted", " / ");
      fg(canvas, "success", `${formatNum(global.totalOutputTokens)}o`);
      cy++;

      if (cy < y + this.rect.height) {
        canvas.moveTo(x, cy);
        fg(canvas, "textMuted", "  Draft ");
        fg(canvas, "accentColor", formatDraftRate(global.avgDraftAcceptance));
        if (global.activeSlots > 0) {
          fg(canvas, "textMuted", `  ${SEP}  Active `);
          fg(canvas, "warning", String(global.activeSlots));
        }
        cy++;
      }
    } else {
      canvas.moveTo(x, cy);
      fg(canvas, "textMuted", "No finished tasks yet - start server and send a request");
      cy++;
    }

    if (cy >= y + this.rect.height) {
      return;
    }

    cy += 1; // gap after global metrics
    for (let i = 0; i < numSlots; i++) {
      const slot = slots[i];

      if (i > 0 && cy < y + this.rect.height) {
        canvas.moveTo(x, cy);
        fg(canvas, "canvas", " ".repeat(width));
        cy++;
      }

      if (cy >= y + this.rect.height) break;

      cy = this.renderSlot(canvas, x, cy, width, slot);
    }
  }

  renderSlot(
    canvas: FramebufferCanvas,
    x: number,
    startY: number,
    width: number,
    slot: SlotMetrics
  ): number {
    let cy = startY;
    const stateColor = STATE_COLOR[slot.state as keyof typeof STATE_COLOR] || "textMuted";
    const dot = STATE_DOT[slot.state as keyof typeof STATE_DOT] || "\u25cb";

    // Line 1: Slot N  ● State  Task #N  ∞
    canvas.moveTo(x, cy);
    fg(canvas, "textMuted", `Slot ${slot.slotId}  `);
    fg(canvas, stateColor, `${dot} ${slot.state}`);
    if (slot.taskId !== null) {
      fg(canvas, "textMuted", `  Task #`);
      fg(canvas, "text", String(slot.taskId));
    }
    if (slot.thinking) {
      fg(canvas, "accentColor", `  ${THINKING_ICON}`);
    }
    cy++;

    // Compact idle slot with no tasks and no live data - stop here
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
    fg(canvas, "textMuted", "  ");
    if (slot.generationSpeed !== null) {
      fg(canvas, "textMuted", "TG ");
      fg(canvas, "success", `${slot.generationSpeed.toFixed(1)} t/s`);
    } else if (slot.promptSpeed !== null && slot.state === "prompting") {
      fg(canvas, "textMuted", "PP ");
      fg(canvas, "info", `${slot.promptSpeed.toFixed(0)} t/s`);
    } else {
      fg(canvas, "textMuted", "...");
    }
    fg(canvas, "textMuted", `  ${SEP}  Context `);
    fg(canvas, "text", `${formatNum(slot.contextSize)} tok`);
    if (slot.checkpoints.length > 0) {
      const bar = checkpointBar(slot.contextSize, slot.checkpoints);
      const totalChkMiB = slot.checkpoints.reduce((s, cp) => s + cp.sizeMiB, 0);
      fg(canvas, "textMuted", `  ${SEP}  Chk: `);
      fg(canvas, "accent", bar);
      fg(canvas, "textMuted", `  ${slot.checkpoints.length}/32  ${totalChkMiB.toFixed(1)} MiB`);
    }
    cy++;

    // Line 3: Prompt progress bar or last task summary
    if (slot.promptProgress !== null && slot.state === "prompting") {
      const barWidth = Math.max(10, Math.min(40, width - 40));
      const bar = progressBar(barWidth, Math.min(1, slot.promptProgress));
      canvas.moveTo(x, cy);
      fg(canvas, "textMuted", "  ");
      fg(canvas, "accent", bar);
      fg(canvas, "textMuted", ` ${(slot.promptProgress * 100).toFixed(0)}%`);
      cy++;
    } else if (slot.lastTask) {
      canvas.moveTo(x, cy);
      fg(canvas, "textMuted", "  ");
      fg(canvas, "textMuted", "PP ");
      fg(canvas, "info", `${padLeft(slot.lastTask.promptTokens, 5)}t @ ${slot.lastTask.promptSpeed.toFixed(1)}t/s`);
      fg(canvas, "textMuted", `  ${SEP}  TG `);
      fg(canvas, "success", `${padLeft(slot.lastTask.outputTokens, 5)}t @ ${slot.lastTask.outputSpeed.toFixed(1)}t/s`);
      fg(canvas, "textMuted", `  ${SEP}  ${formatMs(slot.lastTask.totalTimeMs)}`);
      cy++;
    }

    // Line 4: Draft + truncation (last task data only)
    if (slot.lastTask) {
      canvas.moveTo(x, cy);
      fg(canvas, "textMuted", "  ");
      if (slot.lastTask.draftGenerated > 0) {
        fg(canvas, "textMuted", "Draft ");
        fg(canvas, "accentColor", `${formatDraftRate(slot.lastTask.draftAcceptance)} (${slot.lastTask.draftAccepted}/${slot.lastTask.draftGenerated})`);
        fg(canvas, "textMuted", `  ${SEP}  Truncated `);
        fg(canvas, slot.lastTask.truncated ? "danger" : "success", slot.lastTask.truncated ? "yes" : "no");
      } else {
        fg(canvas, "textMuted", "No speculative decoding");
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
