import { Modal } from "./Modal";
import { modalManager } from "../ModalManager";
import type { Size } from "../types";

export type ExitResult = "cancel" | "exit" | "stop_and_exit";

export class ExitDialog extends Modal {
  protected _message = "";
  protected _resolve: ((value: ExitResult) => void) | null = null;

  set message(v: string) {
    this._message = v;
    this.markDirty();
  }

  setResolve(resolve: (value: ExitResult) => void): void {
    this._resolve = resolve;
  }

  measure(_parentSize?: Size): Size {
    return this._clampSize({ width: 52, height: 9 });
  }

  handleKey(key: string): boolean {
    if (key === "Escape") {
      this.closeWithResult("cancel");
      return true;
    }
    return super.handleKey(key);
  }

  draw(ctx: any): void {
    super.draw(ctx);
    const { canvas } = ctx;
    const { x, y, height } = this.rect;

    if (height < 5 || this._message.length === 0) return;

    const msgStartY = y + 3;
    canvas.moveTo(x + 2, msgStartY);
    canvas.setForegroundColor("text");
    canvas.write(this._message);

    canvas.styleReset();
  }

  public closeWithResult(result: ExitResult): void {
    if (this._resolve) {
      this._resolve(result);
      this._resolve = null;
    }
    if (modalManager.getTop() === this) {
      modalManager.close(this);
    }
  }
}

export function createExitDialog(message: string = "The server is still running. What would you like to do?"): ExitDialog {
  const dialog = new ExitDialog();
  dialog.title = "Exit";
  dialog.setMinSize(42, 9);
  dialog.setMaxSize(60, 15);
  dialog.message = message;
  dialog.setButtons([
    {
      label: "Cancel",
      action: () => dialog.closeWithResult("cancel"),
    },
    {
      label: "Exit Now",
      action: () => dialog.closeWithResult("exit"),
    },
    {
      label: "Stop & Exit",
      action: () => dialog.closeWithResult("stop_and_exit"),
    },
  ]);
  dialog.setDefaultButton(2);
  return dialog;
}
