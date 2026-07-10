import { Modal } from "./Modal";
import { Column, Row, createButtonRow } from "../Layout";
import { Button } from "./Button";
import { Spacer } from "./Spacer";
import { StyledText } from "./StyledText";
import { modalManager } from "../ModalManager";
import type { Size } from "../types";

export type ExitResult = "cancel" | "exit" | "stop_and_exit";

export class ExitDialog extends Modal {
  protected _message = "";
  protected _messageLabel: StyledText;

  set message(v: string) {
    this._message = v;
    this._messageLabel.builder.text(v);
    this.markDirty();
  }

  constructor() {
    super();
    this._messageLabel = new StyledText();

    const cancelBtn = new Button({ label: "Cancel" });
    const exitBtn = new Button({ label: "Exit Now" });
    const stopExitBtn = new Button({ label: "Stop & Exit" });

    cancelBtn.setAction(() => this.closeWithResult("cancel"));
    exitBtn.setAction(() => this.closeWithResult("exit"));
    stopExitBtn.setAction(() => this.closeWithResult("stop_and_exit"));

    const buttonRow = createButtonRow(cancelBtn, exitBtn, stopExitBtn);

    const contentColumn = new Column();
    contentColumn.add(this._messageLabel);
    const spacer1 = new Spacer();
    spacer1.flex = 1;
    contentColumn.add(spacer1);
    contentColumn.add(buttonRow);
    contentColumn.flex = 1;

    this.add(contentColumn);
  }

  measure(_parentSize?: Size): Size {
    return this._clampSize({ width: 52, height: 9 });
  }

  public closeWithResult(result: ExitResult): void {
    super.closeWithResult(result);
  }
}

export function createExitDialog(message: string = "The server is still running. What would you like to do?"): ExitDialog {
  const dialog = new ExitDialog();
  dialog.title = "Exit";
  dialog.setMinSize(60, 9);
  dialog.setMaxSize(60, 15);
  dialog.message = message;
  return dialog;
}
