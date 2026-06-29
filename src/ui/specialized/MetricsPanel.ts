import { Scrollable } from "../../framework/widgets/Scrollable";
import { fg, fgBg } from "../../lib/theme";
import { getGlobal, getSlots, getDevices, onMetricsChange, type SlotMetrics, type DeviceMetrics } from "../../lib/metricstracker";
import { formatMs, formatDraftRate, formatNum, spinnerChar, SPINNER_INTERVAL } from "../../lib/utils";
import type { Color } from "../../lib/theme";
import type { RenderContext, Size } from "../../framework/types";
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
    const devices = getDevices();
    const numSlots = slots.length;
    const deviceLines = devices.length > 0 ? devices.length + 1 : 0;
    const gapAfterDevices = (devices.length > 0 && (global !== null || numSlots > 0)) ? 1 : 0;
    const globalLines = global ? 2 : 1;
    const gapAfterGlobal = numSlots > 0 ? 1 : 0;
    const slotLines = slots.reduce((sum, s) => sum + slotHeight(s), 0);
    const gapBetweenSlots = Math.max(0, numSlots - 1);
    const totalHeight = deviceLines + gapAfterDevices + globalLines + gapAfterGlobal + slotLines + gapBetweenSlots;
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
    const devices = getDevices();
    const global = getGlobal();
    const slots = getSlots();
    const numSlots = slots.length;

    const deviceLines = devices.length > 0 ? devices.length + 1 : 0;
    const gapAfterDevices = (devices.length > 0 && (global !== null || numSlots > 0)) ? 1 : 0;
    const globalLines = global ? 2 : 1;
    const gapAfterGlobal = numSlots > 0 ? 1 : 0;
    const slotLines = slots.reduce((sum, s) => sum + slotHeight(s), 0);
    const gapBetweenSlots = Math.max(0, numSlots - 1);
    const contentH = deviceLines + gapAfterDevices + globalLines + gapAfterGlobal + slotLines + gapBetweenSlots;
    this.contentHeight = contentH;

    const scrollOff = this.scrollOffset;
    const bottom = y + viewportH;

    let cy = 0;

    // Device info header
    if (devices.length > 0 && cy - scrollOff + y < bottom) {
      canvas.moveTo(x, cy - scrollOff + y);
      fg(canvas, "textMuted", "Devices");
      cy++;
    }

    // Device rows
    for (let i = 0; i < devices.length; i++) {
      if (cy - scrollOff + y >= bottom) break;
      this.renderDevice(canvas, x, cy - scrollOff + y, devices[i]);
      cy++;
    }

    // Gap after devices
    if (gapAfterDevices > 0 && cy - scrollOff + y < bottom) {
      canvas.moveTo(x, cy - scrollOff + y);
      fg(canvas, "canvas", " ".repeat(cw));
      cy++;
    }

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

  renderDevice(
    canvas: FramebufferCanvas,
    x: number,
    y: number,
    device: DeviceMetrics
  ): void {
    const usageRatio = device.totalMiB > 0 ? device.usedMiB / device.totalMiB : 0;
    const barColor = usageRatio > 0.9 ? "danger" : usageRatio > 0.8 ? "warning" : usageRatio > 0 ? "success" : "textMuted";
    const isGpu = device.type.toLowerCase().startsWith("vulkan") || device.type.toLowerCase().startsWith("cuda");
    const typeLabel = isGpu ? "GPU" : "CPU";

    const maxNameLen = 32;
    const displayName = device.name.length > maxNameLen ? device.name.slice(0, maxNameLen - 3) + "..." : device.name;
    const namePadded = displayName.padEnd(maxNameLen);

    canvas.moveTo(x, y);
    fg(canvas, "textMuted", `  ${typeLabel}  `);
    fg(canvas, "text", namePadded);

    const barWidth = 36;
    const exactFilled = usageRatio * barWidth;
    const fullBlocks = Math.min(Math.floor(exactFilled), barWidth);
    const remainder = Math.round((exactFilled - fullBlocks) * 8);
    const empty = barWidth - fullBlocks - (remainder > 0 ? 1 : 0);

    const partialBlocks = ["", "\u258F", "\u258E", "\u258D", "\u258C", "\u258B", "\u258A", "\u2589", "\u2588"];

    fgBg(canvas, barColor, barColor, " ".repeat(fullBlocks));
    if (remainder > 0) {
      fgBg(canvas, barColor, "border", partialBlocks[remainder]);
    }
    fgBg(canvas, "border", "border", " ".repeat(empty));

    const totalStr = (device.totalMiB / 1024).toFixed(1);
    const usedStr = (device.usedMiB / 1024).toFixed(1);
    fgBg(canvas, "textMuted", "canvasSubtle", `  `);
    fg(canvas, "text", `${usedStr}/${totalStr} GiB`);
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
        const used = slot.cachedTokens ?? slot.contextSize;
        const usageRatio = used / limit;
        const barColor = usageRatio > 0.9 ? "danger" : usageRatio > 0.8 ? "warning" : isActive ? "success" : "textMuted";

        const exactFilled = usageRatio * CONTEXT_BAR_WIDTH;
        const fullBlocks = Math.min(Math.floor(exactFilled), CONTEXT_BAR_WIDTH);
        const remainder = Math.round((exactFilled - fullBlocks) * 8);
        const empty = CONTEXT_BAR_WIDTH - fullBlocks - (remainder > 0 ? 1 : 0);

        const partialBlocks = ["", "\u258F", "\u258E", "\u258D", "\u258C", "\u258B", "\u258A", "\u2589", "\u2588"];

        fgBg(canvas, barColor, barColor, " ".repeat(fullBlocks));
        if (remainder > 0) {
          fgBg(canvas, barColor, "border", partialBlocks[remainder]);
        }
        fgBg(canvas, "border", "border", " ".repeat(empty));

        fgBg(canvas, "textMuted", "canvasSubtle", `  Used `);
        fg(canvas, "text", `${formatCtxNum(used)} / ${formatCtxNum(limit)}`);
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
      if (ppSpeed !== null) {
        const ppText = slot.state === "prompting" && slot.promptProgress !== null
          ? `${ppSpeed.toFixed(1)} t/s (${(slot.promptProgress * 100).toFixed(0)}%)`
          : `${ppSpeed.toFixed(1)} t/s`;
        fg(canvas, "info", ppText);
      } else {
        fg(canvas, "textMuted", "-");
      }

      const leftLen = 7 + (ppSpeed !== null
        ? (slot.state === "prompting" && slot.promptProgress !== null
          ? `${ppSpeed.toFixed(1)} t/s (${(slot.promptProgress * 100).toFixed(0)}%)`.length
          : `${ppSpeed.toFixed(1)} t/s`.length)
        : 1);
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
      const totalChkMiB = slot.checkpoints.reduce((s, cp) => s + cp.sizeMiB, 0);
      fg(canvas, "textMuted", "  Chk  ");
      fg(canvas, "accent", `${slot.checkpoints.length}`);
      fg(canvas, "textMuted", `  ${totalChkMiB.toFixed(1)} MiB`);
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
