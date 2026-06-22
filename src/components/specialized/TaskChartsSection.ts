import { Section } from "../ui/widgets/Section";
import { Row } from "../ui/Layout";
import { BarChart } from "../ui/widgets/BarChart";
import { taskStore } from "../../lib/tasks";
import type { Size, RenderContext } from "../ui/types";

// Y-axis + separator takes ~5 chars (label width + border), leaving rest for bars.
const AXIS_OVERHEAD = 5;

export class TaskChartsSection extends Section {
  protected _outputRow: Row;
  protected _inputRow: Row;
  protected _outputSpeedChart: BarChart;
  protected _outputTokensChart: BarChart;
  protected _inputSpeedChart: BarChart;
  protected _inputTokensChart: BarChart;
  protected _refreshHandler: (() => void) | null = null;
  protected _lastCapacity = 0;
  protected _chartWidth = 0;

  constructor() {
    super();
    this.title = "Recent Tasks";

    this._outputSpeedChart = new BarChart();
    this._outputSpeedChart.title = "Output Speed (t/s)";
    this._outputSpeedChart.color = "accentColor";
    this._outputSpeedChart.yTickCount = 4;
    this._outputSpeedChart.showXAxis = false;
    this._outputSpeedChart.flex = 1;

    this._outputTokensChart = new BarChart();
    this._outputTokensChart.title = "Generated Tokens";
    this._outputTokensChart.color = "success";
    this._outputTokensChart.yTickCount = 4;
    this._outputTokensChart.showXAxis = false;
    this._outputTokensChart.flex = 1;

    this._inputSpeedChart = new BarChart();
    this._inputSpeedChart.title = "Input Speed (t/s)";
    this._inputSpeedChart.color = "warning";
    this._inputSpeedChart.yTickCount = 4;
    this._inputSpeedChart.showXAxis = false;
    this._inputSpeedChart.flex = 1;

    this._inputTokensChart = new BarChart();
    this._inputTokensChart.title = "Prompt Tokens";
    this._inputTokensChart.color = "danger";
    this._inputTokensChart.yTickCount = 4;
    this._inputTokensChart.showXAxis = false;
    this._inputTokensChart.flex = 1;

    this._outputRow = new Row();
    this._outputRow.add(this._outputSpeedChart);
    this._outputRow.add(this._outputTokensChart);

    this._inputRow = new Row();
    this._inputRow.add(this._inputSpeedChart);
    this._inputRow.add(this._inputTokensChart);

    this.add(this._outputRow);
    this.add(this._inputRow);
  }

  measure(parentSize?: Size): Size {
    const p = parentSize || { width: this.rect.width || 80, height: this.rect.height || 20 };
    return { width: p.width, height: 20 };
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
    this._chartWidth = this._outputSpeedChart.rect.width;
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

    const outputSpeedData: number[] = [];
    const outputTokensData: number[] = [];
    const inputSpeedData: number[] = [];
    const inputTokensData: number[] = [];
    const labels: string[] = [];

    for (let i = tasks.length - 1; i >= 0; i--) {
      const t = tasks[i]!;
      outputSpeedData.push(t.outputSpeed);
      outputTokensData.push(t.outputTokens);
      inputSpeedData.push(t.promptSpeed);
      inputTokensData.push(t.promptTokens);
      labels.push(`T${t.taskId}`);
    }

    this._outputSpeedChart.setData(outputSpeedData, labels);
    this._outputTokensChart.setData(outputTokensData, labels);
    this._inputSpeedChart.setData(inputSpeedData, labels);
    this._inputTokensChart.setData(inputTokensData, labels);
  }

  refreshData(): void {
    this._lastCapacity = 0;
    this.markDirty();
  }
}
