// GitHub Dark theme palette mapped to terminal colors
// https://github.com/github/design/blob/main/docs/color-variables.md

export const theme = {
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

export type Theme = typeof theme;
