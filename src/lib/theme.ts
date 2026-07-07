// Theme resolution engine
// Loads flat theme JSONs from themes/ directory. Each file contains
// { dark: ThemeColors, light?: ThemeColors } with resolved hex colors.

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
  surface: string;
  border: string;
  borderMuted: string;
  borderActive: string;
  text: string;
  textMuted: string;
  accent: string;
  secondary: string;
  accentColor: string;
  success: string;
  successBg: string;
  danger: string;
  dangerBg: string;
  warning: string;
  info: string;
  selectionBg: string;
  selectionText: string;
}

export type Color = keyof ThemeColors | `#${string}` | "None";

interface ThemeFile {
  dark: ThemeColors;
  light?: ThemeColors;
}

export type ThemeMode = "dark" | "light";

let themeMode: ThemeMode = "dark";

export function getThemeMode(): ThemeMode {
  return themeMode;
}

// ─── themeColors (mutable, backward-compatible) ──────────────────────────────

export const themeColors: ThemeColors = {
  canvas: "#0d1117",
  surface: "#161b22",
  border: "#30363d",
  borderMuted: "#21262d",
  borderActive: "#58a6ff",
  text: "#c9d1d9",
  textMuted: "#8b949e",
  accent: "#58a6ff",
  secondary: "#1f6feb",
  accentColor: "#39c5cf",
  success: "#3fb950",
  successBg: "#033a16",
  danger: "#f85149",
  dangerBg: "#67060c",
  warning: "#d29922",
  info: "#d29922",
  selectionBg: "#58a6ff",
  selectionText: "#161b22",
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
    const raw = fs.readJsonSync(filePath) as ThemeFile;
    return themeMode === "light" && raw.light ? raw.light : raw.dark;
  } catch {
    return null;
  }
}

export function loadThemeWithMode(name: string, mode: ThemeMode): ThemeColors | null {
  try {
    const filePath = path.join(THEMES_DIR, `${name}.json`);
    const raw = fs.readJsonSync(filePath) as ThemeFile;
    return mode === "light" && raw.light ? raw.light : raw.dark;
  } catch {
    return null;
  }
}

export function themeHasLightVariant(name: string): boolean {
  try {
    const filePath = path.join(THEMES_DIR, `${name}.json`);
    const raw = fs.readJsonSync(filePath) as ThemeFile;
    return raw.light !== undefined;
  } catch {
    return false;
  }
}

let _currentThemeName: string = "opencode";

function loadThemeByName(): ThemeColors | null {
  return loadTheme(_currentThemeName);
}

export function setActiveTheme(name: string): boolean {
  const resolved = loadTheme(name);
  if (!resolved) return false;
  _currentThemeName = name;
  Object.assign(themeColors, resolved);
  setFramebufferDefaults(resolved.text, resolved.canvas);
  themeChanged = true;
  return true;
}

export function setThemeMode(mode: ThemeMode): void {
  themeMode = mode;
  const resolved = loadThemeByName();
  if (resolved) {
    Object.assign(themeColors, resolved);
    setFramebufferDefaults(resolved.text, resolved.canvas);
    themeChanged = true;
  }
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
