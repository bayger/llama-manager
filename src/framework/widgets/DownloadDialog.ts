import { Modal } from "./Modal";
import { Column, Row, createButtonRow } from "../Layout";
import { Button } from "./Button";
import { Spacer } from "./Spacer";
import { StyledText } from "./StyledText";
import { ProgressBar } from "./ProgressBar";
import { modalManager } from "../ModalManager";
import { spinnerChar, startSpinner } from "../../lib/utils";
import type { Size } from "../types";

export interface DownloadDialogHandle {
  update(progress: number, status?: string): void;
  close(): void;
  cancel(): void;
  promise: Promise<boolean>;
}

export class DownloadDialog extends Modal {
  protected _fileName = "";
  protected _status = "";
  protected _progress = 0;
  protected _fileNameLabel: StyledText;
  protected _statusLabel: StyledText;
  protected _progressBar: ProgressBar;

  set fileName(v: string) {
    this._fileName = v;
    this._fileNameLabel.builder.accentColor(v);
    this.markDirty();
    modalManager.markDirty();
  }

  updateStatus(): void {
    const prefix = this._progress < 100 ? `${spinnerChar()} ` : "";
    this._statusLabel.builder.success(`${prefix}${this._progress.toFixed(1)}%`).muted(` ${this._status}`);
    this.markDirty();
    modalManager.markDirty();
  }

  set status(v: string) {
    this._status = v;
    this.updateStatus();
  }

  set progress(v: number) {
    this._progress = Math.max(0, Math.min(100, v));
    this._progressBar.progress = v;
    this.updateStatus();
  }

  get progress(): number {
    return this._progress;
  }

  constructor() {
    super();
    this._fileNameLabel = new StyledText();
    this._statusLabel = new StyledText();
    this._progressBar = new ProgressBar();

    const cancelBtn = new Button({ label: "Cancel" });
    cancelBtn.setAction(() => this.closeWithResult(true));
    const buttonRow = createButtonRow(cancelBtn);

    const contentColumn = new Column();
    contentColumn.add(this._fileNameLabel);
    const spacer0 = new Spacer();
    spacer0.flex = 1;
    contentColumn.add(spacer0);
    contentColumn.add(this._statusLabel);
    contentColumn.add(this._progressBar);
    const spacer1 = new Spacer();
    spacer1.flex = 1;
    contentColumn.add(spacer1);
    contentColumn.add(buttonRow);
    contentColumn.flex = 1;

    this.add(contentColumn);

    this.disposeOnDestroy(startSpinner(() => this.updateStatus()));
  }

  measure(parentSize?: Size): Size {
    const base = super.measure(parentSize);
    return this._clampSize({ width: base.width, height: base.height + 1 });
  }

  getHandle(): DownloadDialogHandle {
    return {
      update: (progress: number, status?: string) => {
        this.progress = progress;
        if (status !== undefined) this.status = status;
      },
      close: () => {
        this.closeWithResult(false);
      },
      cancel: () => {
        this.closeWithResult(true);
      },
      promise: new Promise<boolean>((r) => {
        const check = () => {
          if (this._resolve === null) {
            r(false);
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      }),
    };
  }

  public closeWithResult(cancelled: boolean): void {
    super.closeWithResult(cancelled);
  }
}

export function createDownloadDialog(fileName: string, status: string = "Preparing..."): DownloadDialog {
  const dialog = new DownloadDialog();
  dialog.title = "Download";
  dialog.setMinSize(60, 10);
  dialog.setMaxSize(60, 10);
  dialog.fileName = fileName;
  dialog.status = status;
  dialog.progress = 0;
  return dialog;
}
