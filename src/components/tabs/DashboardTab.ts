import { Control } from "../ui/Control";
import { Column, Row } from "../ui/Layout";
import { Button } from "../ui/widgets/Button";
import { Label } from "../ui/widgets/Label";
import { Section } from "../ui/widgets/Section";
import { MetricsPanel } from "../specialized/MetricsPanel";
import { LoadedModelPanel } from "../specialized/LoadedModelPanel";
import { TaskChartsSection } from "../specialized/TaskChartsSection";
import { fg } from "../../lib/theme";
import { focusManager } from "../ui/FocusManager";
import { modalManager } from "../ui/ModalManager";
import { getStatus, startServer, stopServer, onServerStatusChange } from "../../lib/server";
import { fireAsync } from "../../lib/utils";
import { BACKEND_LABELS } from "../../lib/versions";
import { detectForkFromFolder } from "../../lib/forks";
import { createStoppingServerModal } from "../ui/widgets/StoppingServerModal";
import type { TabContext } from "../../lib/tabcontext";
import type { Size, RenderContext } from "../ui/types";

export class DashboardControl extends Control {
  protected _ctx: TabContext | null = null;
  protected _column: Column;
  protected _buttonRow: Row;
  protected _buttons: Button[];
  protected _profileLabel: Label;
  protected _versionLabel: Label;
  protected _modelSection: Section;
  protected _metricsSection: Section;
  protected _chartsSection: TaskChartsSection;
  protected _modelPanel: LoadedModelPanel;
  protected _metricsPanel: MetricsPanel;
  protected _statusUnsub: (() => void) | null = null;

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;

    this._buttonRow = new Row();
    this._buttons = [
      new Button({ label: "Start" }),
      new Button({ label: "Stop" }),
      new Button({ label: "Restart" }),
    ];
    for (const btn of this._buttons) {
      this._buttonRow.add(btn);
    }

    const sep1 = new Label();
    sep1.text = "│";
    sep1.color = "borderMuted";
    sep1.focusable = false;
    this._buttonRow.add(sep1);

    this._profileLabel = new Label();
    this._profileLabel.text = "";
    this._profileLabel.color = "textMuted";
    this._profileLabel.focusable = false;
    const profileLbl = this._profileLabel;
    this._profileLabel.measure = () => ({ width: "Profile: ".length + profileLbl.text.length, height: 1 });
    profileLbl.draw = (ctx: RenderContext) => {
      const canvas = ctx.canvas;
      canvas.moveTo(profileLbl.rect.x, profileLbl.rect.y);
      fg(canvas, "textMuted", "Profile ");
      fg(canvas, "accentColor", profileLbl.text);
    };
    this._buttonRow.add(this._profileLabel);

    const sep2 = new Label();
    sep2.text = "│";
    sep2.color = "borderMuted";
    sep2.focusable = false;
    this._buttonRow.add(sep2);

    this._versionLabel = new Label();
    this._versionLabel.text = "";
    this._versionLabel.color = "textMuted";
    this._versionLabel.focusable = false;
    const versionLbl = this._versionLabel;
    this._versionLabel.measure = () => ({ width: Math.max("Version: ".length + versionLbl.text.length, 1), height: 1 });
    versionLbl.draw = (ctx: RenderContext) => {
      const canvas = ctx.canvas;
      canvas.moveTo(versionLbl.rect.x, versionLbl.rect.y);
      fg(canvas, "textMuted", "Version ");
      fg(canvas, "text", versionLbl.text);
    };
    this._buttonRow.add(this._versionLabel);

    this._modelPanel = new LoadedModelPanel();
    this._metricsPanel = new MetricsPanel();

    this._modelSection = new Section();
    this._modelSection.title = "Loaded Model";
    this._modelSection.add(this._modelPanel);

    this._metricsSection = new Section();
    this._metricsSection.title = "Realtime Metrics";
    this._metricsSection.add(this._metricsPanel);
    this._metricsSection.flex = 1;

    this._chartsSection = new TaskChartsSection();

    this._column = new Column();
    this._column.add(this._buttonRow);
    this._column.add(this._modelSection);
    this._column.add(this._metricsSection);
    this._column.add(this._chartsSection);

    this.add(this._column);
  }

  measure(parentSize?: Size): Size {
    return parentSize ? { width: parentSize.width, height: parentSize.height } : super.measure(parentSize);
  }

  onInit(): void {
    if (!this._ctx) return;
    const ctx = this._ctx;
    const buttons = this._buttons;

    buttons[0]?.setAction(() => {
      fireAsync(async () => {
        const config = ctx.getConfig();
        if (!config) throw new Error("No config loaded");
        await startServer(config);
      }, ctx);
      this.markDirty();
    });

    buttons[1]?.setAction(() => {
      fireAsync(async () => {
        const stoppingModal = createStoppingServerModal();
        modalManager.open(stoppingModal);
        await stopServer();
        modalManager.close();
        ctx.forceRender();
      }, ctx);
      this.markDirty();
    });

    buttons[2]?.setAction(() => {
      fireAsync(async () => {
        const config = ctx.getConfig();
        if (!config) throw new Error("No config loaded");
        const stoppingModal = createStoppingServerModal();
        modalManager.open(stoppingModal);
        await stopServer();
        modalManager.close();
        ctx.forceRender();
        await startServer(config);
      }, ctx);
      this.markDirty();
    });

    this.updateProfileLabel();

    this._statusUnsub = onServerStatusChange(() => {
      this.markDirty();
      this._ctx?.showCursor();
    });

    this.markDirty();
  }

  onDestroy(): void {
    if (this._statusUnsub) {
      this._statusUnsub();
      this._statusUnsub = null;
    }
    this._ctx = null;
  }

  draw(ctx: RenderContext): void {
    this.updateProfileLabel();
    this.updateButtons();
  }

  onFocus(): void {
    super.onFocus();
    this.updateButtons();
    const firstEnabled = this._buttons.find(b => !b.disabled);
    if (firstEnabled) {
      focusManager.setFocus(firstEnabled);
    }
  }

  updateProfileLabel(): void {
    const config = this._ctx?.getConfig();
    this._profileLabel.text = config ? config.server.activeProfile : "";

    if (config && config.activeVersion) {
      const version = config.activeVersion;
      const fork = detectForkFromFolder(version);
      const forkSuffix = fork.id !== "llama.cpp" ? ` [${fork.label}]` : "";
      const backend = version.split("-").slice(1).join("-");
      const label = BACKEND_LABELS[backend] || backend || "CPU";
      this._versionLabel.text = `${version} ${label}${forkSuffix}`;
    } else {
      this._versionLabel.text = "";
    }
  }

  updateButtons(): void {
    const status = getStatus();
    this._buttons[0].disabled = status.running;
    this._buttons[1].disabled = !status.running;
    this._buttons[2].disabled = !status.running;
  }
}

export function createDashboardTab(ctx: TabContext): Control {
  return new DashboardControl(ctx);
}
