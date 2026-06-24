import { Scrollable } from "../ui/widgets/Scrollable";
import { fg, fgBg } from "../../lib/theme";
import { getGlobal, getSlots, onMetricsChange, type SlotMetrics, type SlotCheckpoint } from "../../lib/metricstracker";
import { formatMs, formatDraftRate, formatNum, spinnerChar, SPINNER_INTERVAL } from "../../lib/utils";
import type { Color } from "../../lib/theme";
import type { RenderContext, Size } from "../ui/types";
import type { FramebufferCanvas } from "../../lib/framebuffer-canvas";

const STATE_COLOR: Record<string, Color> = {
  idle: "textMuted",
  prompting: "warning",
  generating: "success",
};

const THINKING_ICON = "\u221e";
const CONTEXT_BAR_WIDTH = 33;

function formatCtxNum(n: number): string {
  return n.toLocaleString("en-US");
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

// Partial fill characters: index 0=none, 1-8=eighths
const partialBlocks = ["", "\u258F", "\u258E", "\u258D", "\u258C", "\u258B", "\u258A", "\u2589", "\u2588"];

function renderMultiStateBar(
  canvas: FramebufferCanvas,
  width: number,
  segments: { ratio: number; fgColor: Color; bgColor: Color }[]
): void {
  for (let i = 0; i < width; i++) {
    const cellStart = i / width;
    const cellEnd = (i + 1) / width;
    let maxOverlap = 0;
    let fgColor = segments[segments.length - 1].fgColor;
    let bgColor = segments[segments.length - 1].bgColor;

    for (let j = 0; j < segments.length; j++) {
      const segStart = j > 0 ? segments[j - 1].ratio : 0;
      const segEnd = segments[j].ratio;
      const overlapStart = Math.max(cellStart, segStart);
      const overlapEnd = Math.min(cellEnd, segEnd);
      const overlap = overlapEnd - overlapStart;
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        fgColor = segments[j].fgColor;
        bgColor = segments[j].bgColor;
      }
    }

    const fill = maxOverlap / (cellEnd - cellStart);
    const eighth = Math.round(fill * 8);
    if (eighth === 0) {
      fgBg(canvas, fgColor, bgColor, " ");
    } else if (eighth === 8) {
      fgBg(canvas, fgColor, bgColor, "\u2588");
    } else {
      fgBg(canvas, fgColor, bgColor, partialBlocks[eighth]);
    }
  }
}

function hasCtxData(s: SlotMetrics): boolean {
  return s.nCtxSlot !== null || s.contextSize > 0;
}

function hasSpeedData(s: SlotMetrics): boolean {
  if (s.state === "prompting") return true;
  if (s.state === "generating") return true;
  if (s.lastTask) return true;
  return false;
}

function slotHeight(s: SlotMetrics): number {
  let h = 1;
  if (hasCtxData(s)) h++;
  if (hasSpeedData(s)) h++;
  if (s.lastTask) h++;
  if (s.checkpoints.length > 0) h++;
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
        fg(canvas, "textMuted", `  |  PP `);
        fg(canvas, "info", `${global.avgPromptSpeed.toFixed(1)} t/s`);
        fg(canvas, "textMuted", `  |  TG `);
        fg(canvas, "success", `${global.avgGenSpeed.toFixed(1)} t/s`);
        fg(canvas, "textMuted", `  |  Tokens `);
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
          fg(canvas, "textMuted", `  |  Active `);
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
      cy += 1;
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
    const stateColor = STATE_COLOR[slot.state] || "textMuted";
    const dot = slot.state === "idle" ? "\u25cb" : spinnerChar();
    const isActive = slot.state !== "idle";
    const rightCol = 42;

    // 1. Header
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

    // 2. Ctx bar
    if (hasCtxData(slot)) {
      canvas.moveTo(x, cy);
      fg(canvas, "textMuted", "  Ctx  ");

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
        const usageRatio = totalUsed / limit;
        const freeColor = usageRatio > 0.9 ? "danger" : usageRatio > 0.8 ? "warning" : "textMuted";

        if (isActive) {
          const processedRatio = Math.min(processed / limit, 1);
          const totalRatio = Math.min(totalUsed / limit, 1);
          renderMultiStateBar(canvas, CONTEXT_BAR_WIDTH, [
            { ratio: processedRatio, fgColor: "success", bgColor: "success" },
            { ratio: totalRatio, fgColor: "warning", bgColor: "warning" },
            { ratio: 1, fgColor: freeColor, bgColor: freeColor },
          ]);
        } else {
          const processedRatio = Math.min(processed / limit, 1);
          renderMultiStateBar(canvas, CONTEXT_BAR_WIDTH, [
            { ratio: processedRatio, fgColor: "textMuted", bgColor: "textMuted" },
            { ratio: 1, fgColor: "textMuted", bgColor: "textMuted" },
          ]);
        }

        fg(canvas, "textMuted", `  Used `);
        fg(canvas, "text", `${formatCtxNum(totalUsed)} / ${formatCtxNum(limit)}`);
      } else if (slot.contextSize > 0) {
        fg(canvas, "text", `${formatCtxNum(slot.contextSize)} tok`);
      }
      cy++;
    }

    // 3. Speeds
    if (hasSpeedData(slot)) {
      canvas.moveTo(x, cy);
      const lt = slot.lastTask;

      const ppSpeed = slot.state === "prompting" ? slot.promptSpeed : lt?.promptSpeed ?? null;
      const tgSpeed = slot.state === "generating" ? slot.generationSpeed : lt?.outputSpeed ?? null;

      fg(canvas, "textMuted", "  PP   ");
      fg(canvas, ppSpeed !== null ? "info" : "textMuted", ppSpeed !== null ? `${ppSpeed.toFixed(1)} t/s` : "-");

      const leftLen = 7 + (ppSpeed !== null ? `${ppSpeed.toFixed(1)} t/s`.length : 1);
      const rightPad = Math.max(2, rightCol - leftLen);

      fg(canvas, "canvas", " ".repeat(rightPad));
      fg(canvas, "textMuted", "TG   ");
      if (tgSpeed !== null) {
        fg(canvas, "success", `${tgSpeed.toFixed(1)} t/s`);
        if (slot.state === "generating" && slot.decodedTokens !== null) {
          fg(canvas, "textMuted", ` (${slot.decodedTokens} tok)`);
        }
      } else {
        fg(canvas, "textMuted", "-");
      }
      cy++;
    }

    // 4. Last task
    if (slot.lastTask) {
      canvas.moveTo(x, cy);
      const lt = slot.lastTask;

      fg(canvas, "textMuted", "  Time ");
      fg(canvas, "text", formatMs(lt.totalTimeMs));

      const leftLen = 7 + formatMs(lt.totalTimeMs).length;
      const rightPad = Math.max(2, rightCol - leftLen);

      fg(canvas, "canvas", " ".repeat(rightPad));
      fg(canvas, "textMuted", "Draft");
      if (lt.draftGenerated > 0) {
        fg(canvas, "accentColor", ` ${formatDraftRate(lt.draftAcceptance)} (${lt.draftAccepted}/${lt.draftGenerated})`);
        fg(canvas, "textMuted", "  Trunc ");
        fg(canvas, lt.truncated ? "danger" : "success", lt.truncated ? "yes" : "no");
      } else {
        fg(canvas, "textMuted", " No speculative decoding");
      }
      cy++;
    }

    // 5. Checkpoints
    if (slot.checkpoints.length > 0) {
      canvas.moveTo(x, cy);
      const bar = checkpointBar(slot.contextSize, slot.checkpoints);
      const totalChkMiB = slot.checkpoints.reduce((s, cp) => s + cp.sizeMiB, 0);
      fg(canvas, "textMuted", "  Chk  ");
      fg(canvas, "accent", bar);
      fg(canvas, "textMuted", `  ${slot.checkpoints.length}/32  ${totalChkMiB.toFixed(1)} MiB`);
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
