import { Modal } from "./Modal";
import { Column, Row } from "../Layout";
import { Button } from "./Button";
import { Spacer } from "./Spacer";
import { StyledText } from "./StyledText";
import { ProgressBar } from "./ProgressBar";
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
  protected _messageLabel: StyledText;
  protected _progressBar: ProgressBar;

  setCancellable(value: boolean): void {
    this._cancellable = value;
  }

  set message(v: string) {
    this._message = v;
    this._messageLabel.builder.text(v);
    this.markDirty();
  }

  set progress(v: number) {
    this._progress = Math.max(0, Math.min(100, v));
    this._progressBar.progress = v;
    this._progressBar.extraLabel = `${Math.round(v)}%`;
    this.markDirty();
  }

  get progress(): number {
    return this._progress;
  }

  setResolve(resolve: (value: void) => void): void {
    this._resolve = resolve;
  }

  constructor() {
    super();
    this._messageLabel = new StyledText();
    this._progressBar = new ProgressBar();
    this._progressBar.filledColor = "accent";
    this._progressBar.emptyColor = "border";
    this._progressBar.labelColor = "textMuted";

    const buttonRow = new Row();
    const spacer = new Spacer();
    spacer.flex = 1;
    const closeBtn = new Button({ label: this._cancellable ? "Cancel" : "Close" });
    closeBtn.setAction(() => this.closeWithResult());
    buttonRow.add(spacer);
    buttonRow.add(closeBtn);

    const contentColumn = new Column();
    contentColumn.add(this._messageLabel);
    contentColumn.add(this._progressBar);
    const spacer1 = new Spacer();
    spacer1.flex = 1;
    contentColumn.add(spacer1);
    contentColumn.add(buttonRow);
    contentColumn.flex = 1;

    this.add(contentColumn);
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
  dialog.setMinSize(40, 10);
  dialog.setMaxSize(80, 20);
  dialog.message = message;
  dialog.setCancellable(opts?.cancellable ?? false);
  return dialog;
}
