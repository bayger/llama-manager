import { Modal } from "../../framework/widgets/Modal";
import { Column, Row, createSplitButtonRow } from "../../framework/Layout";
import { Button } from "../../framework/widgets/Button";
import { Spacer } from "../../framework/widgets/Spacer";
import { StyledText } from "../../framework/widgets/StyledText";
import { RELEASES_URL } from "../../lib/updates";
import { modalManager } from "../../framework/ModalManager";
import type { Size } from "../../framework/types";
import { spawn } from "child_process";
import os from "os";
import type { TabContext } from "../../lib/tabcontext";

export class UpdateInfoModal extends Modal {
  protected _latestVersion: string;
  protected _currentVersion: string;
  protected _ctx: TabContext | null = null;

  setContext(ctx: TabContext | null): void {
    this._ctx = ctx;
  }

  constructor(currentVersion: string, latestVersion: string) {
    super();
    this._currentVersion = currentVersion;
    this._latestVersion = latestVersion;
    this.title = "Update Available";
    this.hint = "enter copy URL";
    this.setMinSize(50, 14);
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

    const spacer3 = new Spacer();
    spacer3.flex = 1;
    contentColumn.add(spacer3);

    const instructionLabel = new StyledText();
    instructionLabel.builder.text("To update, run:");
    contentColumn.add(instructionLabel);

    const spacer4 = new Spacer();
    spacer4.flex = 1;
    contentColumn.add(spacer4);

    const updateLabel = new StyledText();
    updateLabel.builder.accent(`npm update -g llama-manager`);
    contentColumn.add(updateLabel);

    const spacer2 = new Spacer();
    spacer2.flex = 1;
    contentColumn.add(spacer2);

    const copyBtn = new Button({ label: "Copy" });
    const openBtn = new Button({ label: "Open Releases" });
    const dismissBtn = new Button({ label: "Dismiss" });

    copyBtn.setAction(() => this.copyCommand());
    openBtn.setAction(() => {
      this.openReleasesPage();
      this.closeWithResult(true);
    });
    dismissBtn.setAction(() => this.closeWithResult(false));

    const buttonRow = createSplitButtonRow(copyBtn, openBtn, dismissBtn);
    contentColumn.add(buttonRow);

    this.add(contentColumn);
  }

  measure(parentSize?: Size): Size {
    return this._clampSize({ width: 55, height: 14 });
  }

  protected copyCommand(): void {
    const cmd = "npm update -g llama-manager";
    const platform = os.platform();
    let copyCmd: string, copyArgs: string[];
    if (platform === "darwin") {
      copyCmd = "pbcopy";
      copyArgs = [];
    } else if (platform === "win32") {
      copyCmd = "clip";
      copyArgs = [];
    } else {
      copyCmd = "xclip";
      copyArgs = ["-selection", "clipboard"];
    }
    const child = spawn(copyCmd, copyArgs);
    child.stdin.write(cmd);
    child.stdin.end();
    child.on("error", () => {
      this._ctx?.showMessage("Could not copy to clipboard");
    });
    this._ctx?.showMessage("Update command copied to clipboard");
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
    super.closeWithResult(result);
  }
}

export function createUpdateInfoModal(currentVersion: string, latestVersion: string, ctx: TabContext | null): UpdateInfoModal {
  const modal = new UpdateInfoModal(currentVersion, latestVersion);
  modal.setContext(ctx);
  return modal;
}
