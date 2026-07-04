import { Control } from "../../framework/Control";
import { List, ListItem } from "../../framework/widgets/List";
import { ConfigData } from "../../lib/config";
import type { Size } from "../../framework/types";

export class ProfileList extends Control {
  focusable = true;
  protected _config: ConfigData | null = null;
  protected _list: List<string, string>;
  protected _onSelect: ((name: string) => void) | null = null;
  protected _onEdit: ((name: string) => void) | null = null;
  protected _onCancel: (() => void) | null = null;

  setSelectCallback(cb: (name: string) => void): void {
    this._onSelect = cb;
  }

  setEditCallback(cb: (name: string) => void): void {
    this._onEdit = cb;
  }

  setCancelCallback(cb: () => void): void {
    this._onCancel = cb;
  }

  constructor() {
    super();
    this._list = new List();
    this._list.flex = 1;
    this.add(this._list);

    const listHandleKey = this._list.handleKey.bind(this._list);
    this._list.handleKey = (key: string) => {
      if (key === "RETURN" || key === "ENTER") {
        const selected = this._list.getSelectedItem();
        if (selected && selected.data && this._onEdit) this._onEdit(selected.data);
        return true;
      }
      if (key === "SPACE" || key === " ") {
        const selected = this._list.getSelectedItem();
        if (selected && selected.data && this._onSelect) this._onSelect(selected.data);
        return true;
      }
      return listHandleKey(key);
    };
  }

  setConfig(config: ConfigData, preserveIndex?: boolean): void {
    this._config = config;
    const names = Object.keys(config.server.profiles).sort();
    const items: ListItem<string, string>[] = names.map(name => ({
      id: name,
      label: name === config.server.activeProfile ? `✓ ${name}` : `  ${name}`,
      data: name,
    }));

    this._list.items = items;
    this._list.selectedId = config.server.activeProfile;

    if (!preserveIndex) {
      const idx = names.indexOf(config.server.activeProfile);
      this._list.selectedIndex = idx !== -1 ? idx : 0;
    } else {
      this._list.selectedIndex = Math.max(0, Math.min(this._list.selectedIndex, names.length - 1));
    }
    this.markDirty();
  }

  measure(parentSize?: Size): Size {
    return parentSize ? { width: parentSize.width, height: parentSize.height } : super.measure(parentSize);
  }

  onFocus(): void {
    super.onFocus();
    this.markDirty();
  }

  onBlur(): void {
    super.onBlur();
    this.markDirty();
  }
}
