import { Modal } from "./Modal";
import { modalManager } from "../ModalManager";
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
  protected _resolve: ((value: boolean) => void) | null = null;

  set fileName(v: string) {
    this._fileName = v;
    this.markDirty();
    modalManager.markDirty();
  }

  set status(v: string) {
    this._status = v;
    this.markDirty();
    modalManager.markDirty();
  }

  set progress(v: number) {
    this._progress = Math.max(0, Math.min(100, v));
    this.markDirty();
    modalManager.markDirty();
  }

  get progress(): number {
    return this._progress;
  }

  setResolve(resolve: (value: boolean) => void): void {
    this._resolve = resolve;
  }

  getHandle(): DownloadDialogHandle {
    return {
      update: (progress: number, status?: string) => {
        this.progress = progress;
        if (status !== undefined) this.status = status;
      },
      close: () => this.closeWithResult(false),
      cancel: () => this.closeWithResult(true),
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

  measure(parentSize?: Size): Size {
    const base = super.measure(parentSize);
    return this._clampSize({ width: base.width, height: base.height + 1 });
  }

  draw(ctx: any): void {
    super.draw(ctx);
    const { canvas } = ctx;
    const { x, y, width, height } = this.rect;

    if (height < 5) return;

    const innerW = width - 4;

    // File name (row 3)
    canvas.moveTo(x + 2, y + 3);
    canvas.setForegroundColor("accentColor");
    canvas.write(this._fileName);

    // Status line (row 4)
    if (this._status) {
      canvas.moveTo(x + 2, y + 4);
      canvas.setForegroundColor("textMuted");
      canvas.write(this._status);
    }

    // Progress bar (row height-4)
    const barY = y + height - 4;
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

  public closeWithResult(cancelled: boolean): void {
    if (this._resolve) {
      this._resolve(cancelled);
      this._resolve = null;
    }
    if (modalManager.getTop() === this) {
      modalManager.close(this);
    }
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
  dialog.setButtons([{
    label: "Cancel",
    action: () => dialog.closeWithResult(true),
  }]);
  return dialog;
}
