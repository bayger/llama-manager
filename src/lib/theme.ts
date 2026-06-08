// GitHub Dark theme palette mapped to terminal colors
// https://github.com/github/design/blob/main/docs/color-variables.md

import type { Terminal } from "terminal-kit";
import type { FramebufferCanvas } from "./framebuffer-canvas.js";

type WriteTarget = Terminal | FramebufferCanvas;

export const themeColors = {
  // GitHub dark surface colors
  canvas: "#0d1117",
  canvasSubtle: "#161b22",
  border: "#30363d",
  borderMuted: "#21262d",

  // Text
  text: "#c9d1d9",
  textMuted: "#8b949e",
  textLink: "#58a6ff",

  // Accents
  accent: "#58a6ff",
  accentSubtle: "#1f6feb",

  // Success
  success: "#3fb950",
  successText: "#3fb950",

  // Danger
  danger: "#f85149",
  dangerText: "#f85149",

  // Warning
  warning: "#d29922",
  warningText: "#d29922",

  // Selection / focus
  selected: "#ffffff",
  selectedBg: "#ffffff",
  selectedText: "#0d1117",
};

export type ThemeColors = typeof themeColors;

// Output text with a hex foreground color
export function fg(target: WriteTarget, hex: string, text: string): void {
  target.colorRgbHex(hex, text);
}

// Output text with a hex background color
export function bg(target: WriteTarget, hex: string, text: string): void {
  target.bgColorRgbHex(hex, text);
}

// Output text with both fg and bg colors
export function fgBg(target: WriteTarget, fgHex: string, bgHex: string, text: string): void {
  target.colorRgbHex(fgHex).bgColorRgbHex(bgHex, text);
}

// Create a styled output function for a given hex color
export function fgFn(target: WriteTarget, hex: string): (text: string) => WriteTarget {
  return (text) => target.colorRgbHex(hex, text);
}

// Create a styled output function for a given bg color
export function bgFn(target: WriteTarget, hex: string): (text: string) => WriteTarget {
  return (text) => target.bgColorRgbHex(hex, text);
}

// Keep backward compat for lib files that import theme colors
export const theme = themeColors;

// Safe terminal dimension getters (fallback to stdout when term is not ready)
export function termWidth(target: WriteTarget): number {
  const w = target.width;
  if (typeof w === 'number' && isFinite(w) && w > 0) return w;
  return process.stdout.columns || 80;
}

export function termHeight(target: WriteTarget): number {
  const h = target.height;
  if (typeof h === 'number' && isFinite(h) && h > 0) return h;
  return process.stdout.rows || 24;
}

/**
 * Renders a single line at (1, y) with erase, then runs fn.
 */
export function renderLine(target: WriteTarget, y: number, fn: () => void): void {
  target.moveTo(1, y);
  target.eraseLine();
  fn();
}

/**
 * Render a full-width horizontal divider line.
 */
export function renderDivider(target: WriteTarget, y: number, color: string): void {
  const width = termWidth(target);
  renderLine(target, y, () => {
    fg(target, color, "\u2500".repeat(width));
  });
}

/**
 * Box-drawing characters.
 */
const TL = "\u250c"; // ┌
const TR = "\u2510"; // ┐
const BL = "\u2514"; // └
const BR = "\u2518"; // ┘
const H = "\u2500";  // ─
const V = "\u2502";  // │
const L = "\u251c";  // ├
const R = "\u2524";  // ┤

export interface BoxLine {
  /** Content renderer — outputs between the side borders. */
  render: () => void;
}

export interface BoxOptions {
  target: WriteTarget;
  width: number;
  borderColor: string;
  startY: number;
}

function hBorder(target: WriteTarget, width: number, color: string, left: string, right: string): void {
  const inner = Math.max(0, width - 2);
  fg(target, color, left);
  fg(target, color, H.repeat(inner));
  fg(target, color, right);
}

function vBorder(target: WriteTarget, color: string): void {
  fg(target, color, V);
}

/**
 * Render a simple bordered box: top border, content lines, bottom border.
 * Each content line is wrapped with side borders (│).
 * Returns the next available Y position.
 */
export function renderBox(opts: BoxOptions, lines: BoxLine[]): number {
  const { target, width, borderColor, startY } = opts;
  let y = startY;

  renderLine(target, y++, () => hBorder(target, width, borderColor, TL, TR));

  for (const line of lines) {
    renderLine(target, y, () => {
      vBorder(target, borderColor);
      line.render();
      // Pad remaining space to right border
      // (content renderers should handle their own padding, but we ensure right border draws)
      vBorder(target, borderColor);
    });
    y++;
  }

  renderLine(target, y++, () => hBorder(target, width, borderColor, BL, BR));

  return y;
}

/**
 * Render a bordered box with a header section and a body section separated by ├─────┤.
 * Returns the next available Y position.
 */
export function renderBoxWithSeparator(opts: BoxOptions, headerLines: BoxLine[], bodyLines: BoxLine[]): number {
  const { target, width, borderColor } = opts;
  let y = opts.startY;

  renderLine(target, y++, () => hBorder(target, width, borderColor, TL, TR));

  for (const line of headerLines) {
    renderLine(target, y, () => {
      vBorder(target, borderColor);
      line.render();
      vBorder(target, borderColor);
    });
    y++;
  }

  renderLine(target, y++, () => hBorder(target, width, borderColor, L, R));

  for (const line of bodyLines) {
    renderLine(target, y, () => {
      vBorder(target, borderColor);
      line.render();
      vBorder(target, borderColor);
    });
    y++;
  }

  renderLine(target, y++, () => hBorder(target, width, borderColor, BL, BR));

  return y;
}
