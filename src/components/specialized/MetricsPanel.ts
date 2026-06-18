import { Control } from "../ui/Control";
import { fg } from "../../lib/theme";
import { getGlobal, getSlots, onMetricsChange, type SlotMetrics, type SlotCheckpoint } from "../../lib/metricstracker";
import { formatNum, formatDraftRate, formatMs } from "../../lib/utils";
import type { Color } from "../../lib/theme";
import type { RenderContext, Size } from "../ui/types";
import type { FramebufferCanvas } from "../../lib/framebuffer-canvas";

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

const CONTEXT_BAR_WIDTH = 32;

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
  // Early return if truly idle (no lastTask, no live data, no context info)
  if (
    !s.lastTask &&
    s.generationSpeed === null &&
    s.promptSpeed === null &&
    s.contextSize === 0 &&
    s.checkpoints.length === 0 &&
    s.ctxLimit === null
  ) {
    return h;
  }
  // Line 2: speed + context bar + checkpoints
  h++;
  // Line 3: last task summary
  if (s.lastTask) {
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
      slot.checkpoints.length === 0 &&
      slot.ctxLimit === null
    ) {
      return cy;
    }

    // Line 2: Live speed + context bar + checkpoints
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

    // Context bar (3-color: processed, to-be-processed, free)
    const currentTokens = slot.evaluatedTokens ?? slot.contextSize;
    const hasContext = slot.ctxLimit !== null || slot.contextSize > 0 || slot.evaluatedTokens !== null;
    if (hasContext) {
      const limit = slot.ctxLimit ?? 0;
      const toBeProcessed = slot.state === "prompting" && slot.promptTotalTokens !== null
        ? Math.max(0, slot.promptTotalTokens - currentTokens)
        : 0;
      if (limit > 0) {
        const processedLen = Math.round((currentTokens / limit) * CONTEXT_BAR_WIDTH);
        const pendingLen = Math.round((toBeProcessed / limit) * CONTEXT_BAR_WIDTH);
        const freeLen = Math.max(0, CONTEXT_BAR_WIDTH - processedLen - pendingLen);
        fg(canvas, "textMuted", `  ${SEP}  `);
        fg(canvas, "success", "\u2588".repeat(processedLen));
        fg(canvas, "warning", "\u2593".repeat(pendingLen));
        fg(canvas, "textMuted", "\u2591".repeat(freeLen));
        fg(canvas, "textMuted", `  ${formatNum(currentTokens)}/${formatNum(limit)}`);
      } else {
        fg(canvas, "textMuted", `  ${SEP}  Context `);
        fg(canvas, "text", `${formatNum(currentTokens)} tok`);
      }
    }

    if (slot.checkpoints.length > 0) {
      const bar = checkpointBar(slot.contextSize || currentTokens, slot.checkpoints);
      const totalChkMiB = slot.checkpoints.reduce((s, cp) => s + cp.sizeMiB, 0);
      fg(canvas, "textMuted", `  ${SEP}  Chk: `);
      fg(canvas, "accent", bar);
      fg(canvas, "textMuted", `  ${slot.checkpoints.length}/32  ${totalChkMiB.toFixed(1)} MiB`);
    }
    cy++;

    // Line 3: last task summary
    if (slot.lastTask) {
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
