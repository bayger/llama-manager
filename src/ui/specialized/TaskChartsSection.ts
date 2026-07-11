import { Control } from "../../framework/Control";
import { Column, Row } from "../../framework/Layout";
import { Section } from "../../framework/widgets/Section";
import { BarChart } from "../../framework/widgets/BarChart";
import { taskStore, TimeBucket } from "../../lib/tasks";
import type { Size, RenderContext } from "../../framework/types";

// Y-axis + separator takes ~5 chars (label width + border), leaving rest for bars.
const AXIS_OVERHEAD = 5;

export type ChartMode = "speed" | "tokens" | "dense";

// ── Per-task charts (used by DashboardTab) ──

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

// ── Aggregated charts (used by TasksTab charts view) ──

export class TaskChartsControl extends Control {
  protected _timeBucket: TimeBucket = "hour";
  protected _column: Column;
  protected _tasksChart: BarChart;
  protected _tasksChartSection: Section;
  protected _tokensChart: BarChart;
  protected _tokensChartSection: Section;
  protected _refreshHandler: (() => void) | null = null;

  get timeBucket(): TimeBucket { return this._timeBucket; }

  constructor() {
    super();

    this._tasksChart = new BarChart();
    this._tasksChart.color = "accent";
    this._tasksChart.scale = "auto-zero";
    this._tasksChartSection = new Section();
    this._tasksChartSection.title = "Tasks Over Time";
    this._tasksChartSection.add(this._tasksChart);
    this._tasksChart.flex = 1;

    this._tokensChart = new BarChart();
    this._tokensChart.color = "success";
    this._tokensChart.scale = "auto-zero";
    this._tokensChartSection = new Section();
    this._tokensChartSection.title = "Tokens Over Time";
    this._tokensChartSection.add(this._tokensChart);
    this._tokensChart.flex = 1;

    this._column = new Column();
    this._column.add(this._tasksChartSection);
    this._tasksChartSection.flex = 1;
    this._column.add(this._tokensChartSection);
    this._tokensChartSection.flex = 1;

    this.add(this._column);
  }

  cycleTimeBucket(): void {
    this._timeBucket = this._timeBucket === "hour" ? "day" : "hour";
    this.markDirty();
  }

  measure(parentSize?: Size): Size {
    return parentSize ? { width: parentSize.width, height: parentSize.height } : super.measure(parentSize);
  }

  onInit(): void {
    this._refreshHandler = () => this.markDirty();
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
    this._column.layout({ x, y, width, height });

    const yAxisWidth = 5;
    const chartWidth = Math.max(1, width - yAxisWidth - 1);
    const count = chartWidth;

    const tasksData = taskStore.getTasksOverTime(this._timeBucket, count);
    this._tasksChart.setData(
      tasksData.map(d => d.value),
      tasksData.map(d => d.label),
    );

    const tokensData = taskStore.getTokensOverTime(this._timeBucket, count);
    this._tokensChart.setData(
      tokensData.map(d => d.promptTokens + d.outputTokens),
      tokensData.map(d => d.label),
    );

    const subtitle = this.buildSubtitle(tasksData);
    this._tasksChart.subtitle = subtitle;
    this._tokensChart.subtitle = subtitle;
    this._tasksChart.labelInterval = 0;
    this._tokensChart.labelInterval = 0;
  }

  private buildSubtitle(data: { label: string }[]): string {
    if (data.length === 0) return "";
    const first = data[0]!.label;
    const last = data[data.length - 1]!.label;
    const firstShort = first.length > 11 ? first.substring(first.lastIndexOf("-") + 1) : first;
    const lastShort = last.length > 11 ? last.substring(last.lastIndexOf("-") + 1) : last;
    const range = this._timeBucket === "hour" ? `${data.length}h` : `${data.length}d`;
    return `${firstShort} – ${lastShort} (${range})`;
  }

  draw(_ctx: RenderContext): void {
    // no-op, charts render themselves
  }

  handleKey(key: string): boolean {
    if (key === "LEFT" || key === "RIGHT" || key === "PAGE_UP" || key === "PAGE_DOWN" || key === "HOME" || key === "END") {
      if (this._tasksChartSection.visible && this._tasksChart.handleKey(key)) return true;
      if (this._tokensChartSection.visible && this._tokensChart.handleKey(key)) return true;
      return false;
    }
    return false;
  }
}
