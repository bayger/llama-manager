import { Modal } from "./Modal";
import type { Size } from "../types";

export class AlertDialog extends Modal {
  protected _message = "";

  set message(v: string) {
    this._message = v;
    this.markDirty();
  }

  measure(parentSize?: Size): Size {
    const base = super.measure(parentSize);
    const msgLines = this._message.length > 0 ? Math.ceil(this._message.length / 50) : 0;
    return { width: Math.max(base.width, this._message.length + 8), height: base.height + Math.max(0, msgLines - 3) };
  }

  draw(ctx: any): void {
    super.draw(ctx);
    const { canvas } = ctx;
    const { x, y, width, height } = this.rect;

    if (height < 4 || this._message.length === 0) return;

    const innerW = width - 4;
    const words = this._message.split(" ");
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      const test = currentLine ? `${currentLine} ${word}` : word;
      if (test.length > innerW && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = test;
      }
    }
    if (currentLine) lines.push(currentLine);

    const maxLines = height - 3;
    const msgStartY = y + 2;

    for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
      canvas.moveTo(x + 2, msgStartY + i);
      canvas.setForegroundColor("text");
      canvas.write(lines[i]!);
    }

    canvas.styleReset();
  }
}

export function createAlertDialog(title: string, message: string): AlertDialog {
  const dialog = new AlertDialog();
  dialog.title = title;
  dialog.message = message;
  dialog.setButtons([{
    label: "OK",
    action: () => dialog.close(),
  }]);
  return dialog;
}
