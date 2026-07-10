import { Modal } from "../../framework/widgets/Modal";
import { Column, Row } from "../../framework/Layout";
import { Button } from "../../framework/widgets/Button";
import { Spacer } from "../../framework/widgets/Spacer";
import { List } from "../../framework/widgets/List";
import { StyledText } from "../../framework/widgets/StyledText";
import { modalManager } from "../../framework/ModalManager";
import { listDevices } from "../../lib/server";
import { spinnerChar, startSpinner } from "../../lib/utils";
import type { ConfigData } from "../../lib/config";
import type { Size } from "../../framework/types";

export class DeviceSelectorModal extends Modal {
  protected _config: ConfigData | null = null;
  protected _isScanning = false;
  protected _scanButton: Button;
  protected _list: List<string, string>;
  protected _closeButton: Button;
  protected _statusLabel: StyledText;

  setConfig(config: ConfigData): void {
    this._config = config;
  }

  constructor() {
    super();
    this._list = new List<string, string>();
    this._list.flex = 1;
    this._list.visible = false;
    this._list.itemHeight = 1;
    this._list.setOnSelect((item) => {
      this.closeWithResult(item.id);
    });

    this._statusLabel = new StyledText();

    this._scanButton = new Button({ label: "Scan" });
    this._closeButton = new Button({ label: "Close" });

    this._scanButton.setAction(() => {
      this.scanDevices();
    });

    this._closeButton.setAction(() => {
      this.closeWithResult(null);
    });

    const buttonRow = new Row();
    const spacer = new Spacer();
    spacer.flex = 1;
    buttonRow.add(spacer);
    buttonRow.add(this._closeButton);

    const contentColumn = new Column();
    contentColumn.add(this._scanButton);
    contentColumn.add(this._statusLabel);
    contentColumn.add(this._list);
    const spacer1 = new Spacer();
    spacer1.flex = 1;
    contentColumn.add(spacer1);
    contentColumn.add(buttonRow);
    contentColumn.flex = 1;

    this.add(contentColumn);

    this.disposeOnDestroy(startSpinner(() => {
      if (this._isScanning) {
        this._statusLabel.builder.text(`${spinnerChar()} Scanning devices...`);
        this.markDirty();
        modalManager.markDirty();
      }
    }));
  }

  async scanDevices(): Promise<void> {
    if (!this._config) return;

    this._isScanning = true;
    this._scanButton.label = "Scanning...";
    this._scanButton.disabled = true;
    this._list.visible = false;
    this._statusLabel.builder.text(`${spinnerChar()} Scanning devices...`);
    this.markDirty();
    modalManager.markDirty();

    try {
      const info = listDevices(this._config);
      const lines = info.split("\n").filter((line: string) => line.trim().length > 0);
      const items = lines.slice(1).map((line: string) => {
        const parts = line.split(":");
        const id = parts[0]?.trim() || "";
        const label = parts.slice(1).join(":").trim() || id;
        return { id, label };
      }).filter((item) => item.id.length > 0);
      if (items.length === 0) {
        this._list.visible = false;
        this._statusLabel.builder.muted("No devices found");
      } else {
        this._list.items = items;
        this._list.visible = true;
        this._statusLabel.builder.text("");
      }
    } catch (e) {
      this._list.visible = false;
      this._statusLabel.builder.danger(`Error: ${e}`);
    }

    this._isScanning = false;
    this._scanButton.label = "Scan";
    this._scanButton.disabled = false;
    this.markDirty();
    modalManager.markDirty();
  }

  handleKey(key: string): boolean {
    if (key === "ESCAPE") {
      this.closeWithResult(null);
      return true;
    }
    return super.handleKey(key);
  }

  public closeWithResult(result: string | null): void {
    super.closeWithResult(result);
  }
}

export function createDeviceSelectorModal(config: ConfigData): DeviceSelectorModal {
  const modal = new DeviceSelectorModal();
  modal.title = "Select Device";
  modal.hint = "enter confirm";
  modal.setMinSize(60, 12);
  modal.setMaxSize(100, 30);
  modal.setConfig(config);
  return modal;
}
