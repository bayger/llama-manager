import { Modal } from "./Modal";
import { modalManager } from "../ModalManager";
import type { Size } from "../types";

export class ConfirmDialog extends Modal {
  protected _message = "";
  protected _resolve: ((value: boolean) => void) | null = null;

  set message(v: string) {
    this._message = v;
    this.markDirty();
  }

  setResolve(resolve: (value: boolean) => void): void {
    this._resolve = resolve;
  }

  measure(parentSize?: Size): Size {
    const base = super.measure(parentSize);
    const msgLines = this._message.length > 0 ? Math.ceil(this._message.length / 50) : 0;
    return this._clampSize({ width: Math.max(base.width, this._message.length + 8), height: base.height + Math.max(0, msgLines - 2) });
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

    const maxLines = height - 5;
    const msgStartY = y + 2;

    for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
      canvas.moveTo(x + 2, msgStartY + i);
      canvas.setForegroundColor("text");
      canvas.write(lines[i]!);
    }

    canvas.styleReset();
  }

  public closeWithResult(result: boolean): void {
    if (this._resolve) {
      this._resolve(result);
      this._resolve = null;
    }
    if (modalManager.getTop() === this) {
      modalManager.close(this);
    }
  }
}

export function createConfirmDialog(title: string, message: string): ConfirmDialog {
  const dialog = new ConfirmDialog();
  dialog.title = title;
  dialog.setMinSize(30, 8);
  dialog.setMaxSize(80, 25);
  dialog.message = message;
  dialog.setButtons([
    {
      label: "Yes",
      action: () => dialog.closeWithResult(true),
    },
    {
      label: "No",
      action: () => dialog.closeWithResult(false),
    },
  ]);
  return dialog;
}
