import type { Terminal } from "terminal-kit";
import { themeColors, fg, fgBg, termWidth, renderBox, renderLine } from "../../lib/theme.js";

export interface ButtonItem {
  label: string;
}

export interface ButtonBarOptions {
  term: Terminal;
  startY: number;
  items: ButtonItem[];
  selectedIndex: number;
  label?: string;
  bordered?: boolean;
}

function formatButton(label: string): string {
  return `[ ${label} ]`;
}

function renderButtonsInline(term: Terminal, items: ButtonItem[], selectedIndex: number): void {
  const formatted = items.map(item => formatButton(item.label));
  const separator = "  ";

  for (let i = 0; i < formatted.length; i++) {
    if (i > 0) {
      fg(term, themeColors.textMuted, separator);
    }
    if (i === selectedIndex) {
      term.bold();
      fgBg(term, themeColors.selectedText, themeColors.selectedBg, formatted[i]);
      term.styleReset();
    } else {
      fg(term, themeColors.border, formatted[i]);
    }
  }
}

export function renderButtonBar(opts: ButtonBarOptions): number {
  const { term, startY, items, selectedIndex, label, bordered } = {
    ...opts,
    bordered: opts.bordered !== false,
  };

  if (!bordered) {
    renderLine(term, startY, () => {
      renderButtonsInline(term, items, selectedIndex);
    });
    return startY + 1;
  }

  const width = termWidth(term);
  const labelText = label ? ` ${label}` : "";

  return renderBox({ term, width, borderColor: themeColors.border, startY }, [
    {
      render: () => {
        fg(term, themeColors.textMuted, labelText);
        if (label) term(" ");
        renderButtonsInline(term, items, selectedIndex);
        const btnLen = items.reduce((acc, item, idx) => {
          const formatted = formatButton(item.label);
          return acc + formatted.length + (idx < items.length - 1 ? 2 : 0);
        }, 0);
        const prefixLen = labelText.length + (label ? 1 : 0);
        const used = prefixLen + btnLen;
        term(" ".repeat(Math.max(0, width - 2 - used)));
      },
    },
  ]);
}
