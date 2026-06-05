import type { Terminal } from "terminal-kit";
import { themeColors, fg, fgBg, renderLine } from "../../lib/theme.js";

export interface ButtonItem {
  label: string;
  disabled?: boolean;
}

export interface ButtonBarOptions {
  term: Terminal;
  startY: number;
  items: ButtonItem[];
  selectedIndex: number;
}

function formatButton(label: string): string {
  return `[ ${label} ]`;
}

function renderButtonsInline(term: Terminal, items: ButtonItem[], selectedIndex: number): void {
  const separator = "  ";

  for (let i = 0; i < items.length; i++) {
    if (i > 0) {
      fg(term, themeColors.textMuted, separator);
    }
    const item = items[i]!;
    const text = formatButton(item.label);

    if (item.disabled) {
      fg(term, themeColors.borderMuted, text);
    } else if (i === selectedIndex) {
      term.bold();
      fgBg(term, themeColors.selectedText, themeColors.selectedBg, text);
      term.styleReset();
    } else {
      fg(term, themeColors.border, text);
    }
  }
}

export function renderButtonBar(opts: ButtonBarOptions): number {
  const { term, startY, items, selectedIndex } = opts;

  renderLine(term, startY, () => {
    renderButtonsInline(term, items, selectedIndex);
  });

  return startY + 1;
}

export function moveButtonIndex(items: ButtonItem[], currentIndex: number, direction: -1 | 1): number {
  const next = currentIndex + direction;
  if (next < 0 || next >= items.length) return currentIndex;
  if (!items[next]?.disabled) return next;
  const step = direction > 0 ? 1 : -1;
  for (let i = currentIndex + step; i >= 0 && i < items.length; i += step) {
    if (!items[i]?.disabled) return i;
  }
  return currentIndex;
}
