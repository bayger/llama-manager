import { Modal } from "./Modal";
import { Column, Row } from "../Layout";
import { Button } from "./Button";
import { Spacer } from "./Spacer";
import { TextInput } from "./TextInput";
import { modalManager } from "../ModalManager";
import type { Size } from "../types";

export class InputDialog extends Modal {
  protected _textInput: TextInput;
  protected _resolve: ((value: string | null) => void) | null = null;

  set value(v: string) {
    this._textInput.value = v;
    this._textInput.cursorPos = v.length;
  }

  get value(): string {
    return this._textInput.value;
  }

  set placeholder(v: string) {
    this._textInput.placeholder = v;
  }

  setResolve(resolve: (value: string | null) => void): void {
    this._resolve = resolve;
  }

  constructor() {
    super();
    this._textInput = new TextInput();
    this._textInput.prefix = "> ";

    const okBtn = new Button({ label: "OK" });
    const cancelBtn = new Button({ label: "Cancel" });

    okBtn.setAction(() => this.closeWithResult(this._textInput.value.trim() || null));
    cancelBtn.setAction(() => this.closeWithResult(null));

    const buttonRow = new Row();
    const spacer = new Spacer();
    spacer.flex = 1;
    buttonRow.add(spacer);
    buttonRow.add(okBtn);
    buttonRow.add(cancelBtn);

    const contentColumn = new Column();
    contentColumn.add(this._textInput);
    const spacer1 = new Spacer();
    spacer1.flex = 1;
    contentColumn.add(spacer1);
    contentColumn.add(buttonRow);
    contentColumn.flex = 1;

    this.add(contentColumn);
  }

  public closeWithResult(result: string | null): void {
    if (this._resolve) {
      this._resolve(result);
      this._resolve = null;
    }
    modalManager.close();
  }
}

export function createInputDialog(title: string, placeholder: string, initialValue: string = ""): InputDialog {
  const dialog = new InputDialog();
  dialog.title = title;
  dialog.placeholder = placeholder;
  dialog.value = initialValue;
  dialog.setMinSize(30, 8);
  dialog.setMaxSize(80, 15);
  return dialog;
}
