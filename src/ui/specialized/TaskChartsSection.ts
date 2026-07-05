import { Section } from "../../framework/widgets/Section";
import { Row } from "../../framework/Layout";
import { BarChart } from "../../framework/widgets/BarChart";
import { taskStore } from "../../lib/tasks";
import type { Size, RenderContext } from "../../framework/types";

// Y-axis + separator takes ~5 chars (label width + border), leaving rest for bars.
const AXIS_OVERHEAD = 5;

export type ChartMode = "speed" | "tokens" | "dense";

export class TaskChartsSection extends Section {
  public chartMode: ChartMode = "speed";
  protected _row: Row;
  protected _inputSpeedChart: BarChart;
  protected _outputSpeedChart: BarChart;
  protected _inputTokenChart: BarChart;
  protected _outputTokenChart: BarChart;
  protected _refreshHandler: (() => void) | null = null;
  protected _lastCapacity = 0;
  protected _chartWidth = 0;

  constructor() {
    super();
    this.title = "Recent Tasks";

    this._inputSpeedChart = new BarChart();
    this._inputSpeedChart.title = "PP Speed (t/s)";
    this._inputSpeedChart.color = "warning";
    this._inputSpeedChart.yTickCount = 4;
    this._inputSpeedChart.showXAxis = false;
    this._inputSpeedChart.flex = 1;

    this._outputSpeedChart = new BarChart();
    this._outputSpeedChart.title = "TG Speed (t/s)";
    this._outputSpeedChart.color = "accentColor";
    this._outputSpeedChart.yTickCount = 4;
    this._outputSpeedChart.showXAxis = false;
    this._outputSpeedChart.flex = 1;

    this._inputTokenChart = new BarChart();
    this._inputTokenChart.title = "Prompt Tokens";
    this._inputTokenChart.color = "warning";
    this._inputTokenChart.yTickCount = 4;
    this._inputTokenChart.showXAxis = false;
    this._inputTokenChart.flex = 1;

    this._outputTokenChart = new BarChart();
    this._outputTokenChart.title = "Output Tokens";
    this._outputTokenChart.color = "accentColor";
    this._outputTokenChart.yTickCount = 4;
    this._outputTokenChart.showXAxis = false;
    this._outputTokenChart.flex = 1;

    this._row = new Row();
    this._row.add(this._inputSpeedChart);
    this._row.add(this._outputSpeedChart);
    this._row.add(this._inputTokenChart);
    this._row.add(this._outputTokenChart);

    this.add(this._row);
  }

  cycleChartMode(): void {
    const modes: ChartMode[] = ["speed", "tokens", "dense"];
    const idx = (modes.indexOf(this.chartMode) + 1) % modes.length;
    this.chartMode = modes[idx]!;
    this.updateCharts();
  }

  updateCharts(): void {
    this._row.remove(this._inputSpeedChart);
    this._row.remove(this._outputSpeedChart);
    this._row.remove(this._inputTokenChart);
    this._row.remove(this._outputTokenChart);
    if (this.chartMode === "speed") {
      this._row.add(this._inputSpeedChart);
      this._row.add(this._outputSpeedChart);
    } else if (this.chartMode === "tokens") {
      this._row.add(this._inputTokenChart);
      this._row.add(this._outputTokenChart);
    } else {
      this._row.add(this._inputSpeedChart);
      this._row.add(this._outputSpeedChart);
      this._row.add(this._inputTokenChart);
      this._row.add(this._outputTokenChart);
    }
    const titles = { speed: "Recent Tasks (speed)", tokens: "Recent Tasks (tokens)", dense: "Recent Tasks (all)" };
    this.title = titles[this.chartMode]!;
    this.hint = "t";
    this._lastCapacity = 0;
    this.markDirty();
  }

  measure(parentSize?: Size): Size {
    const p = parentSize || { width: this.rect.width || 80, height: this.rect.height || 12 };
    return { width: p.width, height: 12 };
  }

  onInit(): void {
    this._refreshHandler = () => this.refreshData();
    taskStore.on("updated", this._refreshHandler);
    this.refreshData();
  }

  onDestroy(): void {
    if (this._refreshHandler) {
      taskStore.off("updated", this._refreshHandler);
      this._refreshHandler = null;
    }
  }

  onLayout(): void {
    super.onLayout();
    const activeChart = this.chartMode === "speed" ? this._inputSpeedChart : this._inputTokenChart;
    this._chartWidth = activeChart.rect.width;
  }

  draw(ctx: RenderContext): void {
    super.draw(ctx);

    if (this._chartWidth <= AXIS_OVERHEAD) return;

    const barCols = this._chartWidth - AXIS_OVERHEAD;
    const capacity = barCols * 2;

    if (capacity === this._lastCapacity) return;

    this._lastCapacity = capacity;
    this.fetchData(capacity);
  }

  fetchData(capacity: number): void {
    const tasks = taskStore.getRange(0, capacity, undefined, "timestamp", "desc");

    const inputSpeedData: number[] = [];
    const outputSpeedData: number[] = [];
    const inputTokenData: number[] = [];
    const outputTokenData: number[] = [];
    const labels: string[] = [];

    for (let i = tasks.length - 1; i >= 0; i--) {
      const t = tasks[i]!;
      inputSpeedData.push(t.promptSpeed);
      outputSpeedData.push(t.outputSpeed);
      inputTokenData.push(t.promptTokens);
      outputTokenData.push(t.outputTokens);
      labels.push(`T${t.taskId}`);
    }

    this._inputSpeedChart.setData(inputSpeedData, labels);
    this._outputSpeedChart.setData(outputSpeedData, labels);
    this._inputTokenChart.setData(inputTokenData, labels);
    this._outputTokenChart.setData(outputTokenData, labels);
  }

  refreshData(): void {
    this._lastCapacity = 0;
    this.markDirty();
  }
}
