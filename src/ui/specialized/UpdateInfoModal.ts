import { Modal } from "../../framework/widgets/Modal";
import { Column, Row } from "../../framework/Layout";
import { Button } from "../../framework/widgets/Button";
import { Spacer } from "../../framework/widgets/Spacer";
import { StyledText } from "../../framework/widgets/StyledText";
import { RELEASES_URL } from "../../lib/updates";
import { modalManager } from "../../framework/ModalManager";
import type { Size } from "../../framework/types";
import { spawn } from "child_process";
import os from "os";

export class UpdateInfoModal extends Modal {
  protected _resolve: ((value: boolean) => void) | null = null;
  protected _latestVersion: string;
  protected _currentVersion: string;

  setResolve(resolve: (value: boolean) => void): void {
    this._resolve = resolve;
  }

  constructor(currentVersion: string, latestVersion: string) {
    super();
    this._currentVersion = currentVersion;
    this._latestVersion = latestVersion;
    this.title = "Update Available";
    this.setMinSize(50, 10);
    this.setMaxSize(70, 15);

    const contentColumn = new Column();
    contentColumn.flex = 1;

    const currentLabel = new StyledText();
    currentLabel.builder.text(`Current version:  v${currentVersion}`);
    contentColumn.add(currentLabel);

    const latestLabel = new StyledText();
    latestLabel.builder.warning(`Latest version:   v${latestVersion}`);
    contentColumn.add(latestLabel);

    const spacer1 = new Spacer();
    spacer1.flex = 1;
    contentColumn.add(spacer1);

    const urlLabel = new StyledText();
    urlLabel.builder.accent(RELEASES_URL);
    contentColumn.add(urlLabel);

    const spacer2 = new Spacer();
    spacer2.flex = 1;
    contentColumn.add(spacer2);

    const buttonRow = new Row();
    const openBtn = new Button({ label: "Open Releases" });
    const dismissBtn = new Button({ label: "Dismiss" });

    openBtn.setAction(() => {
      this.openReleasesPage();
      this.closeWithResult(true);
    });
    dismissBtn.setAction(() => this.closeWithResult(false));

    const btnSpacer = new Spacer();
    btnSpacer.flex = 1;
    buttonRow.add(btnSpacer);
    buttonRow.add(openBtn);
    buttonRow.add(dismissBtn);
    contentColumn.add(buttonRow);

    this.add(contentColumn);
  }

  measure(parentSize?: Size): Size {
    return this._clampSize({ width: 55, height: 10 });
  }

  protected openReleasesPage(): void {
    const platform = os.platform();
    let cmd: string, args: string[];
    if (platform === "darwin") {
      cmd = "open";
      args = [RELEASES_URL];
    } else if (platform === "win32") {
      cmd = "cmd";
      args = ["/c", "start", RELEASES_URL];
    } else {
      cmd = "xdg-open";
      args = [RELEASES_URL];
    }
    spawn(cmd, args, { detached: true, stdio: "ignore" });
  }

  public closeWithResult(result: boolean): void {
    if (this._resolve) {
      this._resolve(result);
      this._resolve = null;
    }
    if (modalManager.getTop() === this) {
      modalManager.close();
    }
  }
}

export function createUpdateInfoModal(currentVersion: string, latestVersion: string): UpdateInfoModal {
  return new UpdateInfoModal(currentVersion, latestVersion);
}
