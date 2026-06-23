import { Scrollable } from "../ui/widgets/Scrollable";
import { fg } from "../../lib/theme";
import { getGlobal, getSlots, onMetricsChange, type SlotMetrics, type SlotCheckpoint } from "../../lib/metricstracker";
import { formatNum, formatDraftRate, formatMs, spinnerChar, SPINNER_INTERVAL } from "../../lib/utils";
import type { Color } from "../../lib/theme";
import type { RenderContext, Size } from "../ui/types";
import type { FramebufferCanvas } from "../../lib/framebuffer-canvas";

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
    s.nCtxSlot === null
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

export class MetricsPanel extends Scrollable {
  focusable = false;
  protected _unsub: (() => void) | null = null;
  protected _renderTimer: ReturnType<typeof setTimeout> | null = null;
  protected _spinnerTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this._unsub = onMetricsChange(() => {
      if (this._renderTimer) clearTimeout(this._renderTimer);
      this._renderTimer = setTimeout(() => {
        this.markDirty();
      }, 100);
    });
    this._spinnerTimer = setInterval(() => {
      this.markDirty();
    }, SPINNER_INTERVAL);
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
    const { x, y } = this.rect;
    const viewportH = this.rect.height;
    const cw = this.contentWidth;
    const global = getGlobal();
    const slots = getSlots();
    const numSlots = slots.length;

    // Calculate content height
    const globalLines = global ? 2 : 1;
    const gapAfterGlobal = global && numSlots > 0 ? 1 : 0;
    const slotLines = slots.reduce((sum, s) => sum + slotHeight(s), 0);
    const gapBetweenSlots = Math.max(0, numSlots - 1);
    const contentH = globalLines + gapAfterGlobal + slotLines + gapBetweenSlots;
    this.contentHeight = contentH;

    const scrollOff = this.scrollOffset;
    const bottom = y + viewportH;

    let cy = 0;
    if (global) {
      if (cy - scrollOff + y < bottom) {
        canvas.moveTo(x, cy - scrollOff + y);
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
      }
      cy++;

      if (cy - scrollOff + y < bottom) {
        canvas.moveTo(x, cy - scrollOff + y);
        fg(canvas, "textMuted", "  Draft ");
        fg(canvas, "accentColor", formatDraftRate(global.avgDraftAcceptance));
        if (global.activeSlots > 0) {
          fg(canvas, "textMuted", `  ${SEP}  Active `);
          fg(canvas, "warning", String(global.activeSlots));
        }
      }
      cy++;
    } else {
      if (cy - scrollOff + y < bottom) {
        canvas.moveTo(x, cy - scrollOff + y);
        fg(canvas, "textMuted", "No finished tasks yet - start server and send a request");
      }
      cy++;
    }

    if (global && numSlots > 0) {
      cy += 1; // gap after global metrics
    }

    for (let i = 0; i < numSlots; i++) {
      const slot = slots[i];

      if (i > 0 && cy - scrollOff + y < bottom) {
        canvas.moveTo(x, cy - scrollOff + y);
        fg(canvas, "canvas", " ".repeat(cw));
        cy++;
      }

      if (cy - scrollOff + y >= bottom) break;

      const slotH = slotHeight(slot);
      this.renderSlot(canvas, x, cy - scrollOff + y, cw, slot);
      cy += slotH;
    }

    if (this.needsScrollbar) {
      this.drawScrollbar(canvas, x + cw, y, this._scrollbarWidth, viewportH);
    }
  }

  renderSlot(
    canvas: FramebufferCanvas,
    x: number,
    startY: number,
    width: number,
    slot: SlotMetrics
  ): void {
    let cy = startY;
    const stateColor = STATE_COLOR[slot.state as keyof typeof STATE_COLOR] || "textMuted";
    const dot = slot.state === "idle" ? "\u25cb" : spinnerChar();

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
      slot.nCtxSlot === null
    ) {
      return;
    }

    // Line 2: Live speed + decoded count + context bar + checkpoints
    const isActive = slot.state !== "idle";
    canvas.moveTo(x, cy);
    fg(canvas, "textMuted", "  ");
    if (slot.generationSpeed !== null) {
      fg(canvas, "textMuted", "TG ");
      fg(canvas, "success", `${slot.generationSpeed.toFixed(1)} t/s`);
      if (slot.decodedTokens !== null) {
        fg(canvas, "textMuted", ` (${slot.decodedTokens} tok)`);
      }
    } else if (slot.promptSpeed !== null && slot.state === "prompting") {
      fg(canvas, "textMuted", "PP ");
      fg(canvas, "info", `${slot.promptSpeed.toFixed(0)} t/s`);
    }

    // Context bar (always visible when limit known)
    // Green = already processed, Orange = waiting to be processed, Gray = free
    const limit = slot.nCtxSlot;
    if (limit !== null && limit > 0) {
      const cached = slot.cachedTokens ?? 0;
      const processed = slot.state === "prompting"
        ? cached
        : slot.state === "generating"
          ? ((slot.pendingTokens ?? 0) + (slot.decodedTokens ?? 0))
          : slot.contextSize;
      const pending = slot.state === "prompting"
        ? Math.max(0, (slot.pendingTokens ?? 0) - cached)
        : 0;
      const totalUsed = processed + pending;
      const totalLen = Math.min(Math.floor((totalUsed / limit) * CONTEXT_BAR_WIDTH), CONTEXT_BAR_WIDTH);
      const processedLen = Math.min(Math.floor((processed / limit) * CONTEXT_BAR_WIDTH), totalLen);
      const pendingLen = totalLen - processedLen;
      const freeLen = CONTEXT_BAR_WIDTH - totalLen;
      const usageRatio = totalUsed / limit;
      const freeColor = usageRatio > 0.9 ? "danger" : usageRatio > 0.8 ? "warning" : "textMuted";
      fg(canvas, "textMuted", `  ${SEP}  Ctx `);
      if (isActive) {
        fg(canvas, "success", "\u2588".repeat(processedLen));
        fg(canvas, "warning", "\u2593".repeat(pendingLen));
        fg(canvas, freeColor, "\u2591".repeat(freeLen));
      } else {
        fg(canvas, "textMuted", "\u2588".repeat(processedLen) + "\u2591".repeat(pendingLen + freeLen));
      }
      fg(canvas, "textMuted", `  ${formatNum(totalUsed)}/${formatNum(limit)}`);
    } else if (slot.contextSize > 0) {
      fg(canvas, "textMuted", `  ${SEP}  Context `);
      fg(canvas, "text", `${formatNum(slot.contextSize)} tok`);
    }

    if (slot.checkpoints.length > 0) {
      const bar = checkpointBar(slot.contextSize, slot.checkpoints);
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
    if (this._spinnerTimer) {
      clearInterval(this._spinnerTimer);
      this._spinnerTimer = null;
    }
  }
}
