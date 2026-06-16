import { fg } from "./theme";
import type { Color } from "./theme";
import type { FramebufferCanvas } from "./framebuffer-canvas";

export interface LogSegment {
  text: string;
  color: Color;
}

const mainLineRegex = /^(\d+\.\d+\.\d+\.\d+)\s+([IEW])\s+(.*?):\s+(.*)$/;

export function parseLogLine(line: string): LogSegment[] {
  if (line.includes("ERROR") || line.includes("FATAL")) {
    return [{ text: line, color: "danger" }];
  }

  const match = line.match(mainLineRegex);
  if (!match) {
    return [{ text: line, color: "text" }];
  }

  const [, timestamp, severity, component, rest] = match;

  const sevColor: Color =
    severity === "E" ? "danger" :
    severity === "W" ? "warning" :
    "info";

  return [
    { text: timestamp, color: "textMuted" },
    { text: " ", color: "canvas" },
    { text: severity, color: sevColor },
    { text: " ", color: "canvas" },
    { text: component, color: "textMuted" },
    { text: ": ", color: "textMuted" },
    { text: rest, color: "text" },
  ];
}

export function renderLogLine(canvas: FramebufferCanvas, x: number, y: number, width: number, line: string): void {
  canvas.moveTo(x, y);
  const segments = parseLogLine(line);
  let remainingWidth = width;

  for (const seg of segments) {
    if (remainingWidth <= 0) break;
    const truncated = seg.text.substring(0, remainingWidth);
    fg(canvas, seg.color, truncated);
    remainingWidth -= truncated.length;
  }
}
