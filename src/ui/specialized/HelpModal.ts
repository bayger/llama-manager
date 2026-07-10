import { Modal } from "../../framework/widgets/Modal";
import { Control } from "../../framework/Control";
import { fg } from "../../lib/theme";
import { modalManager } from "../../framework/ModalManager";
import type { RenderContext, Size } from "../../framework/types";

const HELP_SECTIONS = [
  {
    title: "Navigation",
    keys: [
      ["F1-F7", "Switch tabs"],
      ["Tab / Shift+Tab", "Move focus"],
      ["Enter", "Confirm / select"],
      ["Esc", "Cancel / go back"],
    ],
  },
  {
    title: "Actions",
    keys: [
      ["?", "Toggle help"],
      ["Ctrl+T", "Open theme selector"],
      ["Ctrl+D", "Toggle dark/light mode"],
      ["Ctrl+U", "Check for updates"],
      ["q", "Quit application"],
    ],
  },
  {
    title: "Tab Shortcuts",
    keys: [
      ["F1", "Dashboard - metrics and server control"],
      ["F2", "Logs - live server log viewer"],
      ["F3", "Tasks - inference task history"],
      ["F4", "Profiles - preset editing and management"],
      ["F5", "Versions - install and switch llama.cpp builds"],
      ["F6", "Models - browse, download, and manage GGUF models"],
      ["F7", "Options - global application settings"],
    ],
  },
];

class HelpContent extends Control {
  focusable = false;

  draw(ctx: RenderContext): void {
    const { canvas } = ctx;
    const { x, y } = this.rect;

    const keyWidth = HELP_SECTIONS.flatMap((s) => s.keys.map(([k]) => k.length)).reduce((a, b) => Math.max(a, b), 0);
    const descOffset = 4 + keyWidth + 4;

    const contentLines: { text: string; key: string; desc: string; isTitle: boolean; isHeader: boolean }[] = [];
    contentLines.push({ text: "  KEYBOARD SHORTCUTS", key: "", desc: "", isTitle: true, isHeader: false });
    contentLines.push({ text: "", key: "", desc: "", isTitle: false, isHeader: false });

    for (let s = 0; s < HELP_SECTIONS.length; s++) {
      const section = HELP_SECTIONS[s]!;
      contentLines.push({ text: `  ${section.title}`, key: "", desc: "", isTitle: false, isHeader: true });
      for (const [key, desc] of section.keys) {
        contentLines.push({ text: `    ${key.padEnd(keyWidth)}   ${desc}`, key, desc, isTitle: false, isHeader: false });
      }
      if (s < HELP_SECTIONS.length - 1) {
        contentLines.push({ text: "", key: "", desc: "", isTitle: false, isHeader: false });
      }
    }

    for (let i = 0; i < this.rect.height && i < contentLines.length; i++) {
      const line = contentLines[i]!;
      canvas.moveTo(x, y + i);

      if (line.isTitle) {
        fg(canvas, "accent", line.text);
      } else if (line.isHeader) {
        fg(canvas, "accentColor", line.text);
      } else if (line.key) {
        fg(canvas, "accent", `    ${line.key.padEnd(keyWidth)}`);
        canvas.moveTo(x + descOffset, y + i);
        fg(canvas, "text", line.desc);
      } else {
        fg(canvas, "textMuted", line.text);
      }
    }
  }
}

export class HelpModal extends Modal {
  constructor() {
    super();
    this.title = "Help";
    this.hint = "? close";
    this.setMinSize(60, 22);
    this.setMaxSize(90, 30);

    const content = new HelpContent();
    content.flex = 1;
    this.add(content);
  }

  measure(_parentSize?: Size): Size {
    // header + blank + sections (header + keys) + blanks between sections + modal chrome (4)
    const contentLines = 2 + HELP_SECTIONS.reduce((acc, s) => acc + 1 + s.keys.length, 0) + (HELP_SECTIONS.length - 1);
    return this._clampSize({ width: 78, height: contentLines + 4 });
  }

  handleKey(key: string): boolean {
    if (key === "ESCAPE" || key === "?") {
      this.closeWithResult(false);
      return true;
    }
    return super.handleKey(key);
  }

  public closeWithResult(_result: boolean): void {
    super.closeWithResult(_result);
  }
}

export function createHelpModal(): HelpModal {
  const modal = new HelpModal();
  return modal;
}
