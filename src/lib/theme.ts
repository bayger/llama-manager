// Theme resolution engine
// Loads theme JSONs from themes/ directory, resolves defs → theme references,
// maps to dashboard ThemeColors. Keeps backward-compatible themeColors export.

import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import type { FramebufferCanvas } from "./framebuffer-canvas";
import { setFramebufferDefaults } from "./framebuffer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THEMES_DIR = path.join(__dirname, "..", "..", "themes");

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ThemeColors {
  canvas: string;
  canvasSubtle: string;
  sidebar: string;
  border: string;
  borderMuted: string;
  borderActive: string;
  text: string;
  textMuted: string;
  textLink: string;
  accent: string;
  accentSubtle: string;
  accentColor: string;
  success: string;
  successText: string;
  successBg: string;
  danger: string;
  dangerText: string;
  dangerBg: string;
  warning: string;
  warningText: string;
  info: string;
  selected: string;
  selectedBg: string;
  selectedText: string;
}

export type Color = keyof ThemeColors | `#${string}` | "None";

interface OpencodeThemeRaw {
  defs: Record<string, string>;
  theme: Record<string, string | { dark: string; light: string }>;
}

// ─── Resolution ──────────────────────────────────────────────────────────────

function resolveRef(defs: Record<string, string>, value: string): string {
  if (value.startsWith("#")) return value;
  return defs[value] || "#000000";
}

function getDarkValue(entry: string | { dark: string; light: string }): string {
  if (typeof entry === "string") return entry;
  return entry.dark;
}

function resolveThemeToColors(raw: OpencodeThemeRaw): ThemeColors {
  const { defs, theme: t } = raw;

  const dark = (key: string) => resolveRef(defs, getDarkValue(t[key] || "#000000"));

  return {
    canvas: dark("background"),
    canvasSubtle: dark("backgroundPanel"),
    sidebar: dark("backgroundElement"),
    border: dark("border"),
    borderMuted: dark("borderSubtle"),
    borderActive: dark("borderActive"),
    text: dark("text"),
    textMuted: dark("textMuted"),
    textLink: dark("primary"),
    accent: dark("primary"),
    accentSubtle: dark("secondary"),
    accentColor: dark("accent"),
    success: dark("success"),
    successText: dark("success"),
    successBg: dark("diffAddedBg"),
    danger: dark("error"),
    dangerText: dark("error"),
    dangerBg: dark("diffRemovedBg"),
    warning: dark("warning"),
    warningText: dark("warning"),
    info: dark("info"),
    selected: dark("primary"),
    selectedBg: dark("border"),
    selectedText: dark("background"),
  };
}

// ─── themeColors (mutable, backward-compatible) ──────────────────────────────

export const themeColors: ThemeColors = {
  canvas: "#0d1117",
  canvasSubtle: "#161b22",
  sidebar: "#1e1e1e",
  border: "#30363d",
  borderMuted: "#21262d",
  borderActive: "#58a6ff",
  text: "#c9d1d9",
  textMuted: "#8b949e",
  textLink: "#58a6ff",
  accent: "#58a6ff",
  accentSubtle: "#1f6feb",
  accentColor: "#39c5cf",
  success: "#3fb950",
  successText: "#3fb950",
  successBg: "#033a16",
  danger: "#f85149",
  dangerText: "#f85149",
  dangerBg: "#67060c",
  warning: "#d29922",
  warningText: "#d29922",
  info: "#d29922",
  selected: "#ffffff",
  selectedBg: "#ffffff",
  selectedText: "#0d1117",
};

export function getThemeNames(): string[] {
  try {
    const files = fs.readdirSync(THEMES_DIR).filter((f) => f.endsWith(".json"));
    return files.map((f) => f.replace(/\.json$/, "")).sort();
  } catch {
    return [];
  }
}

export function loadTheme(name: string): ThemeColors | null {
  try {
    const filePath = path.join(THEMES_DIR, `${name}.json`);
    const raw = fs.readJsonSync(filePath) as OpencodeThemeRaw;
    return resolveThemeToColors(raw);
  } catch {
    return null;
  }
}

export function setActiveTheme(name: string): boolean {
  const resolved = loadTheme(name);
  if (!resolved) return false;
  Object.assign(themeColors, resolved);
  setFramebufferDefaults(resolved.text, resolved.canvas);
  themeChanged = true;
  return true;
}

let themeChanged = false;
export function popThemeChanged(): boolean {
  const v = themeChanged;
  themeChanged = false;
  return v;
}

// Keep backward compat for lib files that import theme colors
export const theme = themeColors;

// ─── Color resolution ────────────────────────────────────────────────────────

export function resolveColor(color: Color): string {
  if (color.startsWith("#")) return color;
  return (themeColors as unknown as Record<string, string>)[color] || "#000000";
}

// ─── Rendering helpers ───────────────────────────────────────────────────────

export function fg(target: FramebufferCanvas, color: Color, text: string): void {
  if (color !== "None") target.setForegroundColor(color);
  target.write(text);
}

export function bg(target: FramebufferCanvas, color: Color, text: string): void {
  if (color !== "None") target.setBackgroundColor(color);
  target.write(text);
}

export function fgBg(target: FramebufferCanvas, fgColor: Color, bgColor: Color, text: string): void {
  if (fgColor !== "None") target.setForegroundColor(fgColor);
  if (bgColor !== "None") target.setBackgroundColor(bgColor);
  target.write(text);
}

export function termWidth(target: FramebufferCanvas): number {
  const w = target.width;
  if (typeof w === "number" && isFinite(w) && w > 0) return w;
  return process.stdout.columns || 80;
}

export function termHeight(target: FramebufferCanvas): number {
  const h = target.height;
  if (typeof h === "number" && isFinite(h) && h > 0) return h;
  return process.stdout.rows || 24;
}

export function renderLine(target: FramebufferCanvas, y: number, fn: () => void): void {
  target.moveTo(1, y);
  target.eraseLine();
  fn();
}

export function renderDivider(target: FramebufferCanvas, y: number, color: Color): void {
  const width = termWidth(target);
  renderLine(target, y, () => {
    fg(target, color, "\u2500".repeat(width));
  });
}

// ─── Box drawing ─────────────────────────────────────────────────────────────

const TL = "\u250c";
const TR = "\u2510";
const BL = "\u2514";
const BR = "\u2518";
const H = "\u2500";
const V = "\u2502";
const L = "\u251c";
const R = "\u2524";

export interface BoxLine {
  render: () => void;
}

export interface BoxOptions {
  target: FramebufferCanvas;
  width: number;
  borderColor: Color;
  startY: number;
}

function hBorder(target: FramebufferCanvas, width: number, color: Color, left: string, right: string): void {
  const inner = Math.max(0, width - 2);
  fg(target, color, left);
  fg(target, color, H.repeat(inner));
  fg(target, color, right);
}

function vBorder(target: FramebufferCanvas, color: Color): void {
  fg(target, color, V);
}

export function renderBox(opts: BoxOptions, lines: BoxLine[]): number {
  const { target, width, borderColor, startY } = opts;
  let y = startY;

  renderLine(target, y++, () => hBorder(target, width, borderColor, TL, TR));

  for (const line of lines) {
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
