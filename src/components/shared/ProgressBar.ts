import type { Terminal } from "terminal-kit";
import { themeColors, fg, termWidth, renderLine } from "../../lib/theme.js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface ProgressBarOptions {
  term: Terminal;
  startY: number;
  progress: number;
  label: string;
  barWidth?: number;
  filledColor?: string;
  emptyColor?: string;
  labelColor?: string;
  extraLabel?: string;
}

export function renderProgressBar(opts: ProgressBarOptions): number {
  const {
    term,
    startY,
    progress,
    label,
    barWidth: barWidthOpt,
    filledColor = themeColors.accent,
    emptyColor = themeColors.border,
    labelColor = themeColors.warning,
    extraLabel,
  } = opts;

  const width = termWidth(term);
  const barWidth = barWidthOpt ?? Math.min(width - 10, 60);
  const filled = Math.round((progress / 100) * barWidth);
  const empty = barWidth - filled;

  const frame = SPINNER_FRAMES[Math.floor(Date.now() / 100) % SPINNER_FRAMES.length];

  let y = startY;

  renderLine(term, y++, () => {
    fg(term, labelColor, `${frame} ${label} ${progress}%`);
    if (extraLabel) {
      fg(term, themeColors.textMuted, ` ${extraLabel}`);
    }
  });

  renderLine(term, y++, () => {
    fg(term, filledColor, "█".repeat(filled));
    fg(term, emptyColor, "░".repeat(empty));
  });

  return y;
}
