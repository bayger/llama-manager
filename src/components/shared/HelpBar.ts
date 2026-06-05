import type { Terminal } from "terminal-kit";
import { themeColors, fg, termWidth, renderLine } from "../../lib/theme.js";

interface HelpBarOptions {
  term: Terminal;
  y: number;
  text: string;
  prefix?: string;
  prefixColor?: string;
  blankLineBefore?: boolean;
}

export function renderHelpBar(opts: HelpBarOptions): number {
  let y = opts.y;
  const { term, text, prefix, prefixColor = themeColors.success, blankLineBefore = true } = opts;

  if (blankLineBefore) {
    renderLine(term, y++, () => {});
  }

  const width = termWidth(term);
  const left = Math.floor((width - 2 - text.length) / 2);

  renderLine(term, y, () => {
    term(" ".repeat(left));
    fg(term, themeColors.textMuted, text);
    if (prefix) {
      fg(term, prefixColor, prefix);
    }
  });

  return y + 1;
}
