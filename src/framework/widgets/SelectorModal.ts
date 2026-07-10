import { Modal } from "./Modal";
import { Column, Row } from "../Layout";
import { Button } from "./Button";
import { List, ListItem } from "./List";
import { Spacer } from "./Spacer";
import { modalManager } from "../ModalManager";
import { focusManager } from "../FocusManager";
import type { Size } from "../types";

export interface SelectorItem {
  id: string;
  label: string;
  sublabel?: string;
}

export class SelectorModal extends Modal {
  protected _items: SelectorItem[] = [];
  protected _selectedId: string | null = null;
  protected _list: List<string, SelectorItem>;
  protected _buttonRow: Row;

  setItems(items: SelectorItem[], selectedId: string | null): void {
    this._items = items;
    this._selectedId = selectedId;
    this._list.items = items.map((item) => ({
      id: item.id,
      label: item.label,
      sublabel: item.sublabel,
      data: item,
    }));
    this._list.selectedId = selectedId;
    const idx = items.findIndex((i) => i.id === selectedId);
    this._list.selectedIndex = idx >= 0 ? idx : 0;
  }

  constructor() {
    super();
    this._list = new List();
    this._list.flex = 1;
    this._list.setOnSelect(() => this.confirm());
    this._buttonRow = new Row();

    const okBtn = new Button({ label: "OK" });
    const cancelBtn = new Button({ label: "Cancel" });

    okBtn.setAction(() => this.confirm());
    cancelBtn.setAction(() => this.closeWithResult(null));

    const spacer = new Spacer();
    spacer.flex = 1;
    this._buttonRow.add(spacer);
    this._buttonRow.add(cancelBtn);
    this._buttonRow.add(okBtn);

    const column = new Column();
    column.add(this._list);
    const bottomSpacer = new Spacer();
    column.add(bottomSpacer);
    column.add(this._buttonRow);
    column.flex = 1;
    this.add(column);
  }

  measure(parentSize?: Size): Size {
    const w = Math.max(this._minWidth, 40);
    const h = Math.max(this._minHeight, Math.min(this._items.length + 6, 22));
    return this._clampSize({ width: w, height: h });
  }

  onFocus(): void {
    super.onFocus();
    focusManager.setFocus(this._list);
  }

  handleKey(key: string): boolean {
    if (key === "RETURN" || key === "ENTER") {
      this.confirm();
      return true;
    }
    if (key === "ESCAPE") {
      this.closeWithResult(null);
      return true;
    }
    return super.handleKey(key);
  }

  protected confirm(): void {
    const item = this._list.getSelectedItem();
    this.closeWithResult(item ? item.id : null);
  }

  public closeWithResult(result: string | null): void {
    super.closeWithResult(result);
  }
}

export function createSelectorModal(
  title: string,
  items: SelectorItem[],
  selectedId: string | null,
): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = new SelectorModal();
    modal.title = title;
    modal.setMinSize(30, 8);
    modal.setMaxSize(80, 22);
    modal.setItems(items, selectedId);
    modal.setResolve(resolve);
    modal.setOnClose(() => modal.closeWithResult(null));
    modalManager.open(modal);
  });
}
