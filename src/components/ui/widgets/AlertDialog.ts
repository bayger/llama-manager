import { Modal } from "./Modal";
import { Column, Row } from "../Layout";
import { Button } from "./Button";
import { Spacer } from "./Spacer";
import { StyledText } from "./StyledText";
import type { Size } from "../types";

export class AlertDialog extends Modal {
  protected _message = "";
  protected _messageLabel: StyledText;

  constructor() {
    super();
    this._messageLabel = new StyledText();

    const buttonRow = new Row();
    const spacer = new Spacer();
    spacer.flex = 1;
    const okBtn = new Button({ label: "OK" });
    okBtn.setAction(() => this.close());
    buttonRow.add(spacer);
    buttonRow.add(okBtn);

    const contentColumn = new Column();
    contentColumn.add(this._messageLabel);
    const spacer1 = new Spacer();
    spacer1.flex = 1;
    contentColumn.add(spacer1);
    contentColumn.add(buttonRow);
    contentColumn.flex = 1;

    this.add(contentColumn);
  }

  set message(v: string) {
    this._message = v;
    this._messageLabel.builder.text(v);
    this.markDirty();
  }

  measure(parentSize?: Size): Size {
    const msgLines = this._message.length > 0 ? Math.ceil(this._message.length / 50) : 0;
    const w = Math.max(this._minWidth, this._message.length + 8);
    const h = Math.max(this._minHeight, 9 + Math.max(0, msgLines - 3));
    return this._clampSize({ width: w, height: h });
  }
}

export function createAlertDialog(title: string, message: string): AlertDialog {
  const dialog = new AlertDialog();
  dialog.title = title;
  dialog.setMinSize(30, 9);
  dialog.setMaxSize(80, 25);
  dialog.message = message;
  return dialog;
}
