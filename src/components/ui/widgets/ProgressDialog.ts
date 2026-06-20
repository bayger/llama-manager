import { Modal } from "./Modal";
import { modalManager } from "../ModalManager";
import type { Size } from "../types";

export interface ProgressDialogHandle {
  update(progress: number, message?: string): void;
  close(): void;
  cancel(): void;
  promise: Promise<void>;
}

export class ProgressDialog extends Modal {
  protected _message = "";
  protected _progress = 0;
  protected _cancellable = false;
  protected _resolve: ((value: void) => void) | null = null;

  setCancellable(value: boolean): void {
    this._cancellable = value;
  }

  set message(v: string) {
    this._message = v;
    this.markDirty();
  }

  set progress(v: number) {
    this._progress = Math.max(0, Math.min(100, v));
    this.markDirty();
  }

  get progress(): number {
    return this._progress;
  }

  setResolve(resolve: (value: void) => void): void {
    this._resolve = resolve;
  }

  getHandle(): ProgressDialogHandle {
    return {
      update: (progress: number, msg?: string) => {
        this.progress = progress;
        if (msg !== undefined) this.message = msg;
        modalManager.markDirty();
      },
      close: () => this.closeWithResult(),
      cancel: () => this.closeWithResult(),
      promise: new Promise<void>((r) => {
        const check = () => {
          if (this._resolve === null) {
            r();
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      }),
    };
  }

  measure(parentSize?: Size): Size {
    const base = super.measure(parentSize);
    const msgLines = this._message.length > 0 ? Math.ceil(this._message.length / 50) : 0;
    return { width: Math.max(base.width, 40), height: base.height + Math.max(0, msgLines - 1) + 1 };
  }

  draw(ctx: any): void {
    super.draw(ctx);
    const { canvas } = ctx;
    const { x, y, width, height } = this.rect;

    if (height < 6) return;

    const innerW = width - 4;

    if (this._message.length > 0) {
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

      const maxLines = height - 6;
      const msgStartY = y + 2;

      for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
        canvas.moveTo(x + 2, msgStartY + i);
        canvas.setForegroundColor("text");
        canvas.write(lines[i]!);
      }
    }

    const barY = y + height - 3;
    const barWidth = Math.max(10, innerW - 6);
    const filled = Math.round((this._progress / 100) * barWidth);
    const empty = barWidth - filled;

    canvas.moveTo(x + 2, barY);
    canvas.setForegroundColor("accent");
    canvas.write("\u2588".repeat(filled));
    canvas.setForegroundColor("border");
    canvas.write("\u2591".repeat(empty));
    canvas.setForegroundColor("textMuted");
    canvas.write(` ${Math.round(this._progress)}%`);

    canvas.styleReset();
  }

  public closeWithResult(): void {
    if (this._resolve) {
      this._resolve();
      this._resolve = null;
    }
    modalManager.close(this);
  }
}

export function createProgressDialog(
  title: string,
  message: string,
  opts?: { cancellable?: boolean },
): ProgressDialog {
  const dialog = new ProgressDialog();
  dialog.title = title;
  dialog.message = message;
  dialog.setCancellable(opts?.cancellable ?? false);
  dialog.setButtons([
    {
      label: (opts?.cancellable ?? false) ? "Cancel" : "Close",
      action: () => dialog.closeWithResult(),
    },
  ]);
  return dialog;
}
