import type { Terminal } from "terminal-kit";
import { themeColors, fg } from "./theme.js";

export interface LogSegment {
  text: string;
  color: string;
}

const mainLineRegex = /^(\d+\.\d+\.\d+\.\d+)\s+([IEW])\s+(.*?):\s+(.*)$/;

export function parseLogLine(line: string): LogSegment[] {
  if (line.includes("ERROR") || line.includes("FATAL")) {
    return [{ text: line, color: themeColors.danger }];
  }

  const match = line.match(mainLineRegex);
  if (!match) {
    return [{ text: line, color: themeColors.text }];
  }

  const [, timestamp, severity, component, rest] = match;

  const sevColor =
    severity === "E" ? themeColors.danger :
    severity === "W" ? themeColors.warning :
    themeColors.accentSubtle;

  return [
    { text: timestamp, color: themeColors.textMuted },
    { text: " ", color: themeColors.canvas },
    { text: severity, color: sevColor },
    { text: " ", color: themeColors.canvas },
    { text: component, color: themeColors.textMuted },
    { text: ": ", color: themeColors.textMuted },
    { text: rest, color: themeColors.text },
  ];
}

export function renderLogLine(term: Terminal, x: number, y: number, width: number, line: string): void {
  term.moveTo(x, y);
  const segments = parseLogLine(line);
  let remainingWidth = width;

  for (const seg of segments) {
    if (remainingWidth <= 0) break;
    const truncated = seg.text.substring(0, remainingWidth);
    fg(term, seg.color, truncated);
    remainingWidth -= truncated.length;
  }

  if (remainingWidth > 0) {
    fg(term, themeColors.canvas, " ".repeat(remainingWidth));
  }
}
