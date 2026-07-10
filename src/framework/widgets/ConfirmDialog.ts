import { Modal } from "./Modal";
import { Column, Row } from "../Layout";
import { Button } from "./Button";
import { Spacer } from "./Spacer";
import { StyledText } from "./StyledText";
import { modalManager } from "../ModalManager";
import type { Size } from "../types";

export class ConfirmDialog extends Modal {
  protected _message = "";
  protected _contentColumn: Column;
  protected _messageLabel: StyledText;
  protected _buttonRow: Row;

  set message(v: string) {
    this._message = v;
    this._messageLabel.builder.text(v);
    this.markDirty();
  }

  constructor() {
    super();
    this._contentColumn = new Column();
    this._messageLabel = new StyledText();
    this._buttonRow = new Row();

    const spacer = new Spacer();
    spacer.flex = 1;

    const yesBtn = new Button({ label: "Yes" });
    const noBtn = new Button({ label: "No" });

    yesBtn.setAction(() => this.closeWithResult(true));
    noBtn.setAction(() => this.closeWithResult(false));

    this._buttonRow.add(spacer);
    this._buttonRow.add(yesBtn);
    this._buttonRow.add(noBtn);

    this._contentColumn.add(this._messageLabel);
    const spacer1 = new Spacer();
    spacer1.flex = 1;
    this._contentColumn.add(spacer1);
    this._contentColumn.add(this._buttonRow);
    this._contentColumn.flex = 1;

    this.add(this._contentColumn);
  }

  measure(parentSize?: Size): Size {
    const msgLines = this._message.length > 0 ? Math.ceil(this._message.length / 50) : 0;
    const w = Math.max(this._minWidth, this._message.length + 8);
    const h = Math.max(this._minHeight, 9 + Math.max(0, msgLines - 3));
    return this._clampSize({ width: w, height: h });
  }

  public closeWithResult(result: boolean): void {
    super.closeWithResult(result);
  }
}

export function createConfirmDialog(title: string, message: string): ConfirmDialog {
  const dialog = new ConfirmDialog();
  dialog.title = title;
  dialog.setMinSize(30, 9);
  dialog.setMaxSize(80, 25);
  dialog.message = message;
  return dialog;
}
