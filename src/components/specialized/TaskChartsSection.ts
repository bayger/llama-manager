import { Control } from "../ui/Control";
import { Row } from "../ui/Layout";
import { Section } from "../ui/widgets/Section";
import { BarChart } from "../ui/widgets/BarChart";
import { taskStore } from "../../lib/tasks";
import type { Size, RenderContext } from "../ui/types";

// Y-axis + separator takes ~5 chars (label width + border), leaving rest for bars.
const AXIS_OVERHEAD = 5;

export class TaskChartsSection extends Control {
  focusable = false;

  protected _section: Section;
  protected _row: Row;
  protected _speedChart: BarChart;
  protected _tokensChart: BarChart;
  protected _refreshHandler: (() => void) | null = null;
  protected _lastCapacity = 0;

  constructor() {
    super();

    this._speedChart = new BarChart();
    this._speedChart.title = "Output Speed (t/s)";
    this._speedChart.color = "accent";
    this._speedChart.yTickCount = 4;

    this._tokensChart = new BarChart();
    this._tokensChart.title = "Generated Tokens";
    this._tokensChart.color = "success";
    this._tokensChart.yTickCount = 4;

    this._row = new Row();
    this._row.add(this._speedChart);
    this._row.add(this._tokensChart);

    this._section = new Section();
    this._section.title = "Recent Tasks";
    this._section.add(this._row);

    this.add(this._section);
  }

  measure(parentSize?: Size): Size {
    const p = parentSize || { width: this.rect.width || 80, height: this.rect.height || 12 };
    return { width: p.width, height: 12 };
  }

  onInit(): void {
    this._refreshHandler = () => this.refreshData();
    taskStore.on("updated", this._refreshHandler);
  }

  onDestroy(): void {
    if (this._refreshHandler) {
      taskStore.off("updated", this._refreshHandler);
      this._refreshHandler = null;
    }
  }

  onLayout(): void {
    const { x, y, width, height } = this.rect;
    this._section.layout({ x, y, width, height });
  }

  draw(_ctx: RenderContext): void {
    const chartWidth = this._speedChart.rect.width;
    const barCols = Math.max(0, chartWidth - AXIS_OVERHEAD);
    const capacity = barCols * 2;

    if (capacity === 0 || capacity === this._lastCapacity) return;

    this._lastCapacity = capacity;
    this.fetchData(capacity);
  }

  fetchData(capacity: number): void {
    const tasks = taskStore.getRange(0, capacity, undefined, "timestamp", "desc");
    if (tasks.length === 0) return;

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
