import { Control } from "../ui/Control";
import { Column } from "../ui/Layout";
import { Section } from "../ui/widgets/Section";
import { Row } from "../ui/Layout";
import { Button } from "../ui/widgets/Button";
import { Label } from "../ui/widgets/Label";
import { OptionsPanel } from "../specialized/OptionsPanel";
import { focusManager } from "../ui/FocusManager";
import { createAlertDialog } from "../ui/widgets/AlertDialog";
import { createConfirmDialog } from "../ui/widgets/ConfirmDialog";
import { createProgressDialog } from "../ui/widgets/ProgressDialog";
import { createDownloadDialog } from "../ui/widgets/DownloadDialog";
import { fireAsync } from "../../lib/utils";
import type { TabContext } from "../../lib/tabcontext";
import type { Size } from "../ui/types";

export class OptionsControl extends Column {
  protected _ctx: TabContext | null = null;
  protected _testRow: Row;
  protected _section: Section;
  protected _panel: OptionsPanel;

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;

    this._testRow = new Row();
    const testLabel = new Label();
    testLabel.text = "[SMOKE TEST] ";
    testLabel.color = "textMuted";
    this._testRow.add(testLabel);

    const alertBtn = new Button({ label: "Alert" });
    alertBtn.setAction(() => {
      fireAsync(async () => {
        await ctx.openModal(createAlertDialog("Test Alert", "This is a test alert dialog. Everything is working!"));
      }, ctx);
    });
    this._testRow.add(alertBtn);

    const confirmBtn = new Button({ label: "Confirm" });
    confirmBtn.setAction(() => {
      fireAsync(async () => {
        const result = await ctx.openModal<boolean>(createConfirmDialog("Test Confirm", "Are you sure you want to proceed?"));
        await ctx.openModal(createAlertDialog("Result", `You selected: ${result ? "Yes" : "No"}`));
      }, ctx);
    });
    this._testRow.add(confirmBtn);

    const progressBtn = new Button({ label: "Progress" });
    progressBtn.setAction(() => {
      fireAsync(async () => {
        const dialog = createProgressDialog("Test Progress", "Starting...", { cancellable: true });
        const handle = dialog.getHandle();
        ctx.openModal(dialog);
        let p = 0;
        const interval = setInterval(() => {
          p += 10;
          if (p >= 100) {
            clearInterval(interval);
            handle.update(100, "Complete!");
            setTimeout(() => handle.close(), 500);
          } else {
            handle.update(p, `Working... ${p}%`);
          }
        }, 200);
        await handle.promise;
        clearInterval(interval);
      }, ctx);
    });
    this._testRow.add(progressBtn);

    const downloadBtn = new Button({ label: "Download" });
    downloadBtn.setAction(() => {
      fireAsync(async () => {
        const dialog = createDownloadDialog("test-model.gguf", "Starting download...");
        const handle = dialog.getHandle();
        ctx.openModal(dialog);
        let p = 0;
        const interval = setInterval(() => {
          p += 5;
          if (p >= 100) {
            clearInterval(interval);
            handle.update(100, "Download complete!");
            setTimeout(() => handle.close(), 500);
          } else {
            handle.update(p, `Downloading... ${(p * 1.2).toFixed(1)} MB/s  ETA ${Math.round((100 - p) / 5)}s`);
          }
        }, 100);
        const cancelled = await handle.promise;
        clearInterval(interval);
        if (cancelled) {
          await ctx.openModal(createAlertDialog("Cancelled", "Download was cancelled."));
        }
      }, ctx);
    });
    this._testRow.add(downloadBtn);

    this._section = new Section();
    this._section.title = "Options";
    this._section.flex = 1;

    this._panel = new OptionsPanel(ctx);
    this._panel.flex = 1;
    this._section.add(this._panel);

    this.add(this._testRow);
    this.add(this._section);
  }

  measure(parentSize?: Size): Size {
    const ps = parentSize || { width: 80, height: 24 };
    return { width: ps.width, height: ps.height };
  }

  onFocus(): void {
    super.onFocus();
    focusManager.setFocus(this._panel);
  }

  onDestroy(): void {
    this._ctx = null;
  }
}

export function createOptionsTab(ctx: TabContext): Control {
  return new OptionsControl(ctx);
}
