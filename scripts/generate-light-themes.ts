#!/usr/bin/env node
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THEMES_DIR = path.join(__dirname, "..", "themes");

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function mixColors(hex1: string, hex2: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

function generateLightFromDark(dark: Record<string, string>): Record<string, string> {
  const canvas = "#fafafa";
  const surface = "#f0f0f0";
  const text = "#2c2c2c";
  const textMuted = "#7a7a7a";
  const border = "#d4d4d4";
  const borderMuted = "#e0e0e0";
  const borderActive = darken(dark.borderActive, 0.35);

  const accent = darken(dark.accent, 0.3);
  const secondary = darken(dark.secondary, 0.3);
  const accentColor = darken(dark.accentColor, 0.3);
  const success = darken(dark.success, 0.35);
  const danger = darken(dark.danger, 0.3);
  const warning = darken(dark.warning, 0.3);
  const info = darken(dark.info, 0.3);

  const successBg = mixColors(success, "#ffffff", 0.82);
  const dangerBg = mixColors(danger, "#ffffff", 0.82);

  return {
    canvas,
    surface,
    border,
    borderMuted,
    borderActive,
    text,
    textMuted,
    accent,
    secondary,
    accentColor,
    success,
    successBg,
    danger,
    dangerBg,
    warning,
    info,
    selectionBg: accent,
    selectionText: surface,
  };
}

const files = fs.readdirSync(THEMES_DIR).filter((f) => f.endsWith(".json")).sort();

for (const file of files) {
  const filePath = path.join(THEMES_DIR, file);
  const raw = fs.readJsonSync(filePath);

  if (raw.light) {
    continue;
  }

  const light = generateLightFromDark(raw);
  const output = { dark: raw, light };
  fs.writeJsonSync(filePath, output, { spaces: 2 });
  console.log(`Generated light variant for ${file}`);
}
