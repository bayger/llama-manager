import type { Terminal } from "terminal-kit";
import { themeColors, fg, termWidth, renderBox, renderLine } from "../../lib/theme.js";

interface ActionBarOptions {
  term: Terminal;
  startY: number;
  items: string[];
  selectedIndex: number;
  label?: string;
  bordered?: boolean;
}

export function renderActionBar(opts: ActionBarOptions): number {
  const { term, startY, items, selectedIndex, label, bordered } = {
    ...opts,
    bordered: opts.bordered !== false,
  };

  if (!bordered) {
    renderLine(term, startY + 1, () => {
      fg(term, themeColors.textMuted, "  ");
      for (let i = 0; i < items.length; i++) {
        if (i > 0) fg(term, themeColors.textMuted, " \u2502");
        if (i === selectedIndex) {
          term.bold();
          fg(term, themeColors.selected, ` ${items[i]} `);
          term.styleReset();
        } else {
          fg(term, themeColors.text, items[i]);
        }
      }
    });
    return startY + 2;
  }

  const width = termWidth(term);
  const innerW = width - 2;
  const labelText = label ? ` ${label}` : "";

  return renderBox({ term, width, borderColor: themeColors.border, startY }, [
    {
      render: () => {
        fg(term, themeColors.textMuted, labelText);
        term(" ");
        for (let i = 0; i < items.length; i++) {
          if (i === selectedIndex) {
            term.bold();
            fg(term, themeColors.selected, ` ${items[i]} `);
            term.styleReset();
          } else {
            fg(term, themeColors.text, items[i]);
          }
          if (i < items.length - 1) {
            fg(term, themeColors.textMuted, " \u2502");
            term(" ");
          }
        }
        const itemLen = items.reduce((acc, item, idx) => {
          const sel = idx === selectedIndex;
          return acc + item.length + (sel ? 2 : 0) + (idx < items.length - 1 ? 3 : 0);
        }, 0);
        const prefixLen = labelText.length + 1;
        const used = prefixLen + itemLen;
        term(" ".repeat(Math.max(0, innerW - used)));
      },
    },
  ]);
}
