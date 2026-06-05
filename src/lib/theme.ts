// GitHub Dark theme palette mapped to terminal colors
// https://github.com/github/design/blob/main/docs/color-variables.md

import type { Terminal } from "terminal-kit";

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
export function fg(term: Terminal, hex: string, text: string): void {
  term.colorRgbHex(hex, text);
}

// Output text with a hex background color
export function bg(term: Terminal, hex: string, text: string): void {
  term.bgColorRgbHex(hex, text);
}

// Output text with both fg and bg colors
export function fgBg(term: Terminal, fgHex: string, bgHex: string, text: string): void {
  term.colorRgbHex(fgHex).bgColorRgbHex(bgHex)(text);
}

// Create a styled output function for a given hex color
export function fgFn(term: Terminal, hex: string): (text: string) => Terminal {
  return (text) => term.colorRgbHex(hex)(text);
}

// Create a styled output function for a given bg color
export function bgFn(term: Terminal, hex: string): (text: string) => Terminal {
  return (text) => term.bgColorRgbHex(hex)(text);
}

// Keep backward compat for lib files that import theme colors
export const theme = themeColors;

// Safe terminal dimension getters (fallback to stdout when term is not ready)
export function termWidth(term: Terminal): number {
  const w = term.width;
  if (typeof w === 'number' && isFinite(w) && w > 0) return w;
  return process.stdout.columns || 80;
}

export function termHeight(term: Terminal): number {
  const h = term.height;
  if (typeof h === 'number' && isFinite(h) && h > 0) return h;
  return process.stdout.rows || 24;
}
