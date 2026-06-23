import { Section } from "../ui/widgets/Section";
import { Row } from "../ui/Layout";
import { BarChart } from "../ui/widgets/BarChart";
import { taskStore } from "../../lib/tasks";
import type { Size, RenderContext } from "../ui/types";

// Y-axis + separator takes ~5 chars (label width + border), leaving rest for bars.
const AXIS_OVERHEAD = 5;

export class TaskChartsSection extends Section {
  protected _row: Row;
  protected _inputSpeedChart: BarChart;
  protected _outputSpeedChart: BarChart;
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

    this._row = new Row();
    this._row.add(this._inputSpeedChart);
    this._row.add(this._outputSpeedChart);

    this.add(this._row);
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
    this._chartWidth = this._inputSpeedChart.rect.width;
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
    const labels: string[] = [];

    for (let i = tasks.length - 1; i >= 0; i--) {
      const t = tasks[i]!;
      inputSpeedData.push(t.promptSpeed);
      outputSpeedData.push(t.outputSpeed);
      labels.push(`T${t.taskId}`);
    }

    this._inputSpeedChart.setData(inputSpeedData, labels);
    this._outputSpeedChart.setData(outputSpeedData, labels);
  }

  refreshData(): void {
    this._lastCapacity = 0;
    this.markDirty();
  }
}
