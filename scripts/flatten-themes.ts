#!/usr/bin/env node
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THEMES_DIR = path.join(__dirname, "..", "themes");

interface OpencodeThemeRaw {
  defs: Record<string, string>;
  theme: Record<string, string | { dark: string; light: string }>;
}

function resolveRef(defs: Record<string, string>, value: string): string {
  if (value.startsWith("#")) return value;
  return defs[value] || "#000000";
}

function flattenTheme(raw: OpencodeThemeRaw, mode: "dark" | "light") {
  const { defs, theme: t } = raw;
  const pick = (entry: string | { dark: string; light: string }) => {
    if (typeof entry === "string") return entry;
    return mode === "light" ? entry.light : entry.dark;
  };
  const c = (key: string) => resolveRef(defs, pick(t[key] || "#000000"));

  return {
    canvas: c("background"),
    surface: c("backgroundPanel"),
    border: c("border"),
    borderMuted: c("borderSubtle"),
    borderActive: c("borderActive"),
    text: c("text"),
    textMuted: c("textMuted"),
    accent: c("primary"),
    secondary: c("secondary"),
    accentColor: c("accent"),
    success: c("success"),
    successBg: c("diffAddedBg"),
    danger: c("error"),
    dangerBg: c("diffRemovedBg"),
    warning: c("warning"),
    info: c("info"),
    selectionBg: c("primary"),
    selectionText: c("backgroundPanel"),
  };
}

function hasLightVariant(raw: OpencodeThemeRaw): boolean {
  for (const v of Object.values(raw.theme)) {
    if (typeof v === "object" && v.dark !== v.light) return true;
  }
  return false;
}

const files = fs.readdirSync(THEMES_DIR).filter((f) => f.endsWith(".json")).sort();

for (const file of files) {
  const filePath = path.join(THEMES_DIR, file);
  const raw = fs.readJsonSync(filePath) as OpencodeThemeRaw;

  const dark = flattenTheme(raw, "dark");
  const hasLight = hasLightVariant(raw);

  const output = hasLight ? { dark, light: flattenTheme(raw, "light") } : dark;

  fs.writeJsonSync(filePath, output, { spaces: 2 });
  console.log(`Flattened ${file}`);
}
