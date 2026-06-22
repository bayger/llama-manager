import { Control } from "../ui/Control";
import { Row } from "../ui/Layout";
import { Section } from "../ui/widgets/Section";
import { BarChart } from "../ui/widgets/BarChart";
import { taskStore, TaskMetrics } from "../../lib/tasks";
import type { Size, RenderContext } from "../ui/types";

const MAX_TASKS = 32;

export class TaskChartsSection extends Control {
  focusable = false;

  protected _section: Section;
  protected _row: Row;
  protected _speedChart: BarChart;
  protected _tokensChart: BarChart;
  protected _speedData: number[] = [];
  protected _tokensData: number[] = [];
  protected _labels: string[] = [];
  protected _refreshHandler: (() => void) | null = null;

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
    this.refreshData();
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

  draw(ctx: RenderContext): void {
    this._speedChart.setData(this._speedData, this._labels);
    this._tokensChart.setData(this._tokensData, this._labels);
  }

  refreshData(): void {
    const tasks = taskStore.getRange(0, MAX_TASKS, undefined, "timestamp", "desc");
    if (tasks.length === 0) return;

    // Reverse so oldest is on the left
    const recent = tasks.reverse();

    this._speedData = recent.map((t) => t.outputSpeed);
    this._tokensData = recent.map((t) => t.outputTokens);
    this._labels = recent.map((t) => `T${t.taskId}`);
    this.markDirty();
  }
}
