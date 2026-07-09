import { Control } from "../../framework/Control";
import { Column, Row } from "../../framework/Layout";
import { Button } from "../../framework/widgets/Button";
import { Label } from "../../framework/widgets/Label";
import { Section } from "../../framework/widgets/Section";
import { Spacer } from "../../framework/widgets/Spacer";
import { SelectorLabel } from "../../framework/widgets/SelectorLabel";
import { MetricsPanel } from "../specialized/MetricsPanel";
import { LoadedModelPanel } from "../specialized/LoadedModelPanel";
import type { ModelDetailLevel } from "../specialized/LoadedModelPanel";
import type { MetricsDetailLevel } from "../specialized/MetricsPanel";
import { TaskChartsSection } from "../specialized/TaskChartsSection";
import { focusManager } from "../../framework/FocusManager";
import { modalManager } from "../../framework/ModalManager";
import { getStatus, startServer, stopServer, onServerStatusChange } from "../../lib/server";
import { fireAsync } from "../../lib/utils";
import { BACKEND_LABELS, listVersions, switchVersion } from "../../lib/versions";
import { detectForkFromFolder } from "../../lib/forks";
import { createStoppingServerModal } from "../specialized/StoppingServerModal";
import { createSelectorModal } from "../../framework/widgets/SelectorModal";
import type { SelectorItem } from "../../framework/widgets/SelectorModal";
import { saveConfig } from "../../lib/config";
import type { TabContext } from "../../lib/tabcontext";
import type { Size, RenderContext } from "../../framework/types";

export class DashboardControl extends Control {
  protected _ctx: TabContext | null = null;
  protected _column: Column;
  protected _buttonRow: Row;
  protected _buttons: Button[];
  protected _profileSelector: SelectorLabel;
  protected _versionSelector: SelectorLabel;
  protected _hintLabel: Label;
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

    const spacer = new Spacer();
    spacer.flex = 1;
    this._buttonRow.add(spacer);

    this._profileSelector = new SelectorLabel({
      prefix: "Profile",
      valueColor: "accentColor",
      onActivate: () => this.openProfileSelector(),
    });
    this._buttonRow.add(this._profileSelector);

    this._versionSelector = new SelectorLabel({
      prefix: "Version",
      valueColor: "text",
      onActivate: () => this.openVersionSelector(),
    });
    this._buttonRow.add(this._versionSelector);

    this._hintLabel = new Label();
    this._hintLabel.text = "";
    this._hintLabel.color = "warning";
    this._hintLabel.focusable = false;
    const hintLbl = this._hintLabel;
    this._hintLabel.measure = () => ({ width: hintLbl.text.length, height: 1 });
    this._buttonRow.add(this._hintLabel);

    this._modelPanel = new LoadedModelPanel();
    this._metricsPanel = new MetricsPanel();

    this._modelSection = new Section();
    this._modelSection.title = "Loaded Model";
        this._modelSection.hint = "m";
    this._modelSection.add(this._modelPanel);

    this._metricsSection = new Section();
    this._metricsSection.title = "Session Metrics";
    this._metricsSection.hint = "s";
    this._metricsSection.add(this._metricsPanel);
    this._metricsSection.flex = 1;

    this._chartsSection = new TaskChartsSection();

    this._column = new Column();
    this._column.add(this._buttonRow);
    this._column.add(new Spacer());
    this._column.add(this._modelSection);
    this._column.add(new Spacer());
    this._column.add(this._metricsSection);
    this._column.add(new Spacer());
    this._column.add(this._chartsSection);
    this._column.add(new Spacer());

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
        focusManager.setFocus(buttons[1]!);
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

    this.updateSelectors();

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
    this.updateSelectors();
    this.updateButtons();
    this.updateModelDetailLevel();
    this.updateMetricsDetailLevel();
    this.updateChartMode();
  }

  onFocus(): void {
    super.onFocus();
    this.updateButtons();
    const firstEnabled = this._buttons.find(b => !b.disabled);
    if (firstEnabled) {
      focusManager.setFocus(firstEnabled);
    }
  }

  handleKey(key: string): boolean {
    if (key === "m" && !focusManager.isTextInputActive() && !modalManager.isOpen()) {
      this._modelPanel.cycleDetailLevel();
      const config = this._ctx?.getConfig();
      if (config) {
        config.dashboard.modelDetailLevel = this._modelPanel.detailLevel;
        fireAsync(async () => {
          const cfg = this._ctx!.getConfig();
          if (cfg) await saveConfig(cfg);
        }, this._ctx!);
      }
      return true;
    }
    if (key === "s" && !focusManager.isTextInputActive() && !modalManager.isOpen()) {
      this._metricsPanel.cycleDetailLevel();
      const config = this._ctx?.getConfig();
      if (config) {
        config.dashboard.metricsDetailLevel = this._metricsPanel.detailLevel;
        fireAsync(async () => {
          const cfg = this._ctx!.getConfig();
          if (cfg) await saveConfig(cfg);
        }, this._ctx!);
      }
      return true;
    }
    if (key === "t" && !focusManager.isTextInputActive() && !modalManager.isOpen()) {
      this._chartsSection.cycleChartMode();
      const config = this._ctx?.getConfig();
      if (config) {
        config.dashboard.chartMode = this._chartsSection.chartMode;
        fireAsync(async () => {
          const cfg = this._ctx!.getConfig();
          if (cfg) await saveConfig(cfg);
        }, this._ctx!);
      }
      return true;
    }
    return super.handleKey(key);
  }

  updateSelectors(): void {
    const config = this._ctx?.getConfig();
    this._profileSelector.value = config ? config.server.activeProfile : "";

    if (config && config.activeVersion) {
      const version = config.activeVersion;
      const fork = detectForkFromFolder(version);
      const forkSuffix = fork.id !== "llama.cpp" ? ` [${fork.label}]` : "";
      const backend = version.split("-").slice(1).join("-");
      const label = BACKEND_LABELS[backend] || backend || "CPU";
      this._versionSelector.value = `${version} ${label}${forkSuffix}`;
    } else {
      this._versionSelector.value = "";
    }

    if (!getStatus().running) {
      this._hintLabel.text = "";
    }
  }

  updateButtons(): void {
    const status = getStatus();
    this._buttons[0].disabled = status.running;
    this._buttons[1].disabled = !status.running;
    this._buttons[2].disabled = !status.running;
  }

  markHint(): void {
    if (getStatus().running) {
      this._hintLabel.text = " Restart to apply";
    }
    this.markDirty();
  }

  updateModelDetailLevel(): void {
    const config = this._ctx?.getConfig();
    if (config && config.dashboard.modelDetailLevel !== this._modelPanel.detailLevel) {
      this._modelPanel.detailLevel = config.dashboard.modelDetailLevel;
    }
  }

  updateMetricsDetailLevel(): void {
    const config = this._ctx?.getConfig();
    if (config && config.dashboard.metricsDetailLevel !== this._metricsPanel.detailLevel) {
      this._metricsPanel.detailLevel = config.dashboard.metricsDetailLevel;
    }
  }

  updateChartMode(): void {
    const config = this._ctx?.getConfig();
    if (config && config.dashboard.chartMode !== this._chartsSection.chartMode) {
      this._chartsSection.chartMode = config.dashboard.chartMode;
      this._chartsSection.updateCharts();
    }
  }

  protected async openSelector(
    title: string,
    selectedId: string | null,
    buildItems: (config: NonNullable<ReturnType<TabContext['getConfig']>>) => Promise<SelectorItem[]>,
    apply: (config: NonNullable<ReturnType<TabContext['getConfig']>>, id: string) => Promise<void>,
  ): Promise<string | null> {
    const config = this._ctx?.getConfig();
    if (!config) return null;

    const items = await buildItems(config);
    const result = await createSelectorModal(title, items, selectedId);
    if (result) {
      const cfg = this._ctx!.getConfig();
      if (!cfg) return null;
      await apply(cfg, result);
      await saveConfig(cfg);
      this._ctx!.setConfig(cfg);
      this.markHint();
    }
    return result;
  }

  async openProfileSelector(): Promise<string | null> {
    const config = this._ctx?.getConfig();
    if (!config) return null;
    return this.openSelector(
      "Select Profile",
      config.server.activeProfile,
      async (cfg) => Object.keys(cfg.server.profiles).map((name) => ({
        id: name,
        label: name === cfg.server.activeProfile ? `✓ ${name}` : name,
      })),
      async (cfg, id) => { cfg.server.activeProfile = id; },
    );
  }

  async openVersionSelector(): Promise<string | null> {
    const config = this._ctx?.getConfig();
    if (!config) return null;
    return this.openSelector(
      "Select Version",
      config.activeVersion || null,
      async (cfg) => {
        const versions = await listVersions(cfg);
        return versions.map((v) => ({
          id: v.version,
          label: v.active ? `✓ ${v.version}` : v.version,
          sublabel: BACKEND_LABELS[v.backend] || v.backend,
        }));
      },
      async (cfg, id) => {
        await switchVersion(cfg, id);
        cfg.activeVersion = id;
      },
    );
  }
}

export function createDashboardTab(ctx: TabContext): Control {
  return new DashboardControl(ctx);
}
