import { Section } from "../ui/widgets/Section";
import { Row } from "../ui/Layout";
import { BarChart } from "../ui/widgets/BarChart";
import { taskStore } from "../../lib/tasks";
import type { Size, RenderContext } from "../ui/types";

// Y-axis + separator takes ~5 chars (label width + border), leaving rest for bars.
const AXIS_OVERHEAD = 5;

export class TaskChartsSection extends Section {
  protected _row: Row;
  protected _speedChart: BarChart;
  protected _tokensChart: BarChart;
  protected _refreshHandler: (() => void) | null = null;
  protected _lastCapacity = 0;
  protected _chartWidth = 0;

  constructor() {
    super();
    this.title = "Recent Tasks";

    this._speedChart = new BarChart();
    this._speedChart.title = "Output Speed (t/s)";
    this._speedChart.color = "accent";
    this._speedChart.yTickCount = 4;
    this._speedChart.flex = 1;

    this._tokensChart = new BarChart();
    this._tokensChart.title = "Generated Tokens";
    this._tokensChart.color = "success";
    this._tokensChart.yTickCount = 4;
    this._tokensChart.flex = 1;

    this._row = new Row();
    this._row.add(this._speedChart);
    this._row.add(this._tokensChart);

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
    this._chartWidth = this._speedChart.rect.width;
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

    const speedData: number[] = [];
    const tokensData: number[] = [];
    const labels: string[] = [];

    for (let i = tasks.length - 1; i >= 0; i--) {
      const t = tasks[i]!;
      speedData.push(t.outputSpeed);
      tokensData.push(t.outputTokens);
      labels.push(`T${t.taskId}`);
    }

    this._speedChart.setData(speedData, labels);
    this._tokensChart.setData(tokensData, labels);
  }

  refreshData(): void {
    this._lastCapacity = 0;
    this.markDirty();
  }
}
