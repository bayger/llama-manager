import { Control } from "../ui/Control";
import type { FramebufferCanvas } from "../../lib/framebuffer-canvas";
import { Column, Row } from "../ui/Layout";
import { Table } from "../ui/widgets/Table";
import { Section } from "../ui/widgets/Section";
import { BrailleChart } from "../ui/widgets/BrailleChart";
import { fg, fgBg } from "../../lib/theme";
import { StyledText } from "../ui/widgets/StyledText";
import { TextInput } from "../ui/widgets/TextInput";
import { focusManager } from "../ui/FocusManager";
import { fireAsync, formatMs } from "../../lib/utils";
import { taskStore, TaskMetrics, TaskSortField, TaskSortDir, TaskFilter } from "../../lib/tasks";
import type { TabContext } from "../../lib/tabcontext";
import type { Point, Size, RenderContext } from "../ui/types";
import type { TableRenderer, ComputedColumn } from "../ui/widgets/Table";
import type { ChartSeries } from "../ui/widgets/BrailleChart";

const SORT_FIELDS: { field: TaskSortField; label: string }[] = [
  { field: "timestamp", label: "Time" },
  { field: "taskId", label: "ID" },
  { field: "slotId", label: "Slot" },
  { field: "promptSpeed", label: "PP" },
  { field: "outputSpeed", label: "TG" },
  { field: "promptTokens", label: "Prompt" },
  { field: "outputTokens", label: "Output" },
  { field: "totalTimeMs", label: "Duration" },
  { field: "cachedPromptTokens", label: "Cache" },
  { field: "ttsMs", label: "TTS" },
  { field: "promptMsPerToken", label: "P ms/t" },
  { field: "outputMsPerToken", label: "O ms/t" },
  { field: "draftMeanAcceptLen", label: "Draft Len" },
  { field: "slotSimilarity", label: "Slot Sim" },
  { field: "nCtxSlot", label: "n_ctx" },
  { field: "pendingTokens", label: "Pending" },
];

const DETAILS_WIDTH = 40;

function fmtNum(n: number): string {
  return n.toLocaleString();
}

class TaskDetailsControl extends Section {
  protected _task: TaskMetrics | null = null;
  protected _scrollOffset = 0;
  protected _speedChart: BrailleChart;
  protected _hasSpeedData = false;

  constructor() {
    super();
    this._speedChart = new BrailleChart();
    this._speedChart.visible = false;
    this.add(this._speedChart);
  }

  measure(parentSize: Size): Size {
    return { width: DETAILS_WIDTH, height: parentSize.height };
  }

  update(task: TaskMetrics | null): void {
    this._task = task;
    this._scrollOffset = 0;

    if (task) {
      const samples = taskStore.getSpeedSamples(task.taskId);
      const promptPts = samples.filter((s) => s.phase === "prompt").map((s) => ({ x: s.position, y: s.speedTps }));
      const genPts = samples.filter((s) => s.phase === "generation").map((s) => ({ x: s.position, y: s.speedTps }));

      const allPts = [...promptPts, ...genPts];
      if (allPts.length > 0) {
        const series: ChartSeries[] = [];
        if (promptPts.length > 0) {
          series.push({ label: "P", color: "success", points: promptPts });
        }
        if (genPts.length > 0) {
          series.push({ label: "G", color: "accentColor", points: genPts });
        }
        this._speedChart.setSeries(series);
        this._speedChart.visible = true;
        this._hasSpeedData = true;
      } else {
        this._speedChart.visible = false;
        this._hasSpeedData = false;
      }
    } else {
      this._speedChart.visible = false;
      this._hasSpeedData = false;
    }

    this.markDirty();
  }

  scroll(delta: number): void {
    if (!this._task) return;
    const lines = this._getLines();
    const metaHeight = this._getMetaHeight();
    const maxOffset = Math.max(0, lines.length - metaHeight);
    this._scrollOffset = Math.max(0, Math.min(maxOffset, this._scrollOffset + delta));
    this.markDirty();
  }

  onMouseWheel(_point: Point, direction: 'up' | 'down'): boolean {
    if (!this._task) return false;
    const lines = this._getLines();
    const metaHeight = this._getMetaHeight();
    const maxOffset = Math.max(0, lines.length - metaHeight);
    if (direction === 'up' && this._scrollOffset > 0) {
      this._scrollOffset--;
      this.markDirty();
      return true;
    }
    if (direction === 'down' && this._scrollOffset < maxOffset) {
      this._scrollOffset++;
      this.markDirty();
      return true;
    }
    return false;
  }

  _getMetaHeight(): number {
    const { height } = this.rect;
    if (!this._hasSpeedData) return height - 4;
    const chartMinH = 8;
    const avail = height - 4;
    return Math.max(4, Math.min(avail, avail - chartMinH + 2));
  }

  _getLines(): { label: string; value: string }[] {
    if (!this._task) return [{ label: "No selection", value: "" }];
    const task = this._task;
    const time = new Date(task.timestamp);
    const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}:${time.getSeconds().toString().padStart(2, "0")}`;

    return [
      { label: "ID", value: `#${task.taskId}` },
      { label: "Slot", value: `S${task.slotId}` },
      { label: "Time", value: timeStr },
      { label: "", value: "" },
      { label: "Profile", value: task.profile || "-" },
      { label: "Model", value: task.model || "-" },
      { label: "Version", value: task.version || "-" },
      { label: "", value: "" },
      { label: "Pending Tokens", value: fmtNum(task.pendingTokens) },
      { label: "Prompt Tokens", value: fmtNum(task.promptTokens) },
      { label: "Cached Tokens", value: task.cachedPromptTokens > 0 && task.pendingTokens > 0 ? `${fmtNum(task.cachedPromptTokens)} (${((task.cachedPromptTokens / task.pendingTokens) * 100).toFixed(1)}%)` : task.cachedPromptTokens > 0 ? fmtNum(task.cachedPromptTokens) : "-" },
      { label: "Prompt Time", value: formatMs(task.promptTimeMs) },
      { label: "Prompt Speed", value: `${task.promptSpeed.toFixed(1)} t/s` },
      { label: "P ms/t", value: task.promptMsPerToken > 0 ? `${task.promptMsPerToken.toFixed(2)} ms` : "-" },
      { label: "", value: "" },
      { label: "Output Tokens", value: fmtNum(task.outputTokens) },
      { label: "Eval Time", value: formatMs(task.evalTimeMs) },
      { label: "Output Speed", value: `${task.outputSpeed.toFixed(1)} t/s` },
      { label: "O ms/t", value: task.outputMsPerToken > 0 ? `${task.outputMsPerToken.toFixed(2)} ms` : "-" },
      { label: "", value: "" },
      { label: "TTS", value: task.ttsMs > 0 ? `${task.ttsMs.toFixed(0)} ms` : "-" },
      { label: "Total Tokens", value: fmtNum(task.totalTokens) },
      { label: "Total Time", value: formatMs(task.totalTimeMs) },
      { label: "", value: "" },
      { label: "Draft Accept", value: `${(task.draftAcceptance * 100).toFixed(1)}% (${task.draftAccepted}/${task.draftGenerated})` },
      { label: "Draft Mean Len", value: task.draftMeanAcceptLen > 0 ? `${task.draftMeanAcceptLen.toFixed(2)}` : "-" },
      { label: "Context Size", value: fmtNum(task.contextSize) },
      { label: "n_ctx_slot", value: task.nCtxSlot > 0 ? fmtNum(task.nCtxSlot) : "-" },
      { label: "Slot Sim.", value: task.slotSimilarity > 0 ? `${task.slotSimilarity.toFixed(3)}` : "-" },
      { label: "Truncated", value: task.truncated ? "Yes" : "No" },
    ];
  }

  onLayout(): void {
    super.onLayout();
    const { x, y, width, height } = this.rect;
    const metaHeight = this._getMetaHeight();
    const chartHeight = this._hasSpeedData ? height - metaHeight - 2 : 0;
    this._speedChart.visible = this._hasSpeedData && chartHeight >= 6;
    if (this._speedChart.visible) {
      this._speedChart.layout({ x: x + 1, y: y + metaHeight + 1, width: width - 2, height: chartHeight });
    }
  }

  draw(ctx: RenderContext): void {
    const { canvas } = ctx;
    const { x, y, width, height } = this.rect;

    if (width < 3 || height < 4) {
      return;
    }

    super.draw(ctx);

    const lines = this._getLines();
    const innerW = width - 2;
    const labelWidth = 14;
    const metaHeight = this._getMetaHeight();

    // blank separator row
    canvas.moveTo(x + 2, y + 2);
    fgBg(canvas, "canvasSubtle", "canvasSubtle", " ".repeat(innerW));

    for (let i = 0; i < metaHeight - 1; i++) {
      const lineIdx = i + this._scrollOffset;
      canvas.moveTo(x + 2, y + i + 3);

      if (lineIdx >= 0 && lineIdx < lines.length) {
        const line = lines[lineIdx]!;
        if (line.label === "Task Details") {
          fg(canvas, "accentColor", line.label.padEnd(innerW));
        } else if (line.label !== "") {
          const label = `${line.label}:`.padEnd(labelWidth);
          let value = line.value;
          const valueWidth = innerW - labelWidth - 2;
          if (value.length > valueWidth) {
            value = "…" + value.substring(value.length - (valueWidth - 1));
          }
          fg(canvas, "textMuted", label);
          fg(canvas, "text", ` ${value}`);
        }
      }
    }

    // Speed data empty state
    if (this._task && !this._hasSpeedData) {
      const emptyY = y + metaHeight + 1;
      canvas.moveTo(x + 2, emptyY);
      fg(canvas, "textMuted", " No speed data");
      canvas.moveTo(x + 2, emptyY + 1);
      fg(canvas, "textMuted", " (task predates");
      canvas.moveTo(x + 2, emptyY + 2);
      fg(canvas, "textMuted", "  speed tracking)");
    }
  }
}


export class TasksControl extends Control {
  focusable = true;
  protected _ctx: TabContext | null = null;
  protected _column: Column;
  protected _summary: StyledText;
  protected _filterRow: Row;
  protected _cacheFilter: TextInput;
  protected _ctxFilter: TextInput;
  protected _tasksSection: Section;
  protected _table: Table<TaskMetrics>;
  protected _detailsPanel: TaskDetailsControl;
  protected _contentRow: Row;
  protected _sortField: TaskSortField = "timestamp";
  protected _sortDir: TaskSortDir = "desc";
  protected _filter: TaskFilter = {};

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;
    this._summary = new StyledText();

    this._cacheFilter = new TextInput();
    this._cacheFilter.placeholder = "Min cache %";
    this._cacheFilter.prefix = "Cache≥";
    this._cacheFilter.setOnSubmit((v) => {
      this._filter.minCacheHitRatio = v ? parseFloat(v) / 100 : undefined;
      this._table.selectedIndex = 0;
      this._table.scrollOffset = 0;
      this.markDirty();
    });

    this._ctxFilter = new TextInput();
    this._ctxFilter.placeholder = "Max ctx size";
    this._ctxFilter.prefix = "Ctx≤";
    this._ctxFilter.setOnSubmit((v) => {
      this._filter.maxCtxSize = v ? parseInt(v, 10) : undefined;
      this._table.selectedIndex = 0;
      this._table.scrollOffset = 0;
      this.markDirty();
    });

    this._filterRow = new Row();
    this._filterRow.add(this._cacheFilter);
    const spacer = new StyledText();
    spacer.builder.text("   ");
    this._filterRow.add(spacer);
    this._filterRow.add(this._ctxFilter);

    this._table = new Table<TaskMetrics>();
    this._table.showHeader = true;

    this._table.setOnHighlight((item) => {
      this._detailsPanel.update(item ? item.data ?? null : null);
      this.markDirty();
    });
    this._table.setOnSelect(() => {
      fireAsync(async () => {}, ctx);
    });

    this._tasksSection = new Section();
    this._tasksSection.title = "Recent Tasks";
    this._tasksSection.add(this._table);
    this._table.flex = 1;

    this._detailsPanel = new TaskDetailsControl();
    this._detailsPanel.title = "Task Details";
    this._contentRow = new Row();
    this._contentRow.add(this._tasksSection);
    this._tasksSection.flex = 1;
    this._contentRow.add(this._detailsPanel);
    this._detailsPanel.layout({ x: 0, y: 0, width: DETAILS_WIDTH, height: 1 });

    this._column = new Column();
    this._column.add(this._summary);
    this._column.add(this._filterRow);
    this._column.add(this._contentRow);
    this._contentRow.flex = 1;

    this.add(this._column);
  }

  measure(parentSize?: Size): Size {
    return parentSize ? { width: parentSize.width, height: parentSize.height } : super.measure(parentSize);
  }

  onInit(): void {
    taskStore.on("updated", () => {
      this._table.selectedIndex = 0;
      this._table.scrollOffset = 0;
      this.markDirty();
    });
    this.markDirty();
  }

  onDestroy(): void {
    this._ctx = null;
  }

  onLayout(): void {
    const { x, y, width, height } = this.rect;
    const showDetails = width >= DETAILS_WIDTH + 26;
    this._detailsPanel.visible = showDetails;
    this._column.layout({ x, y, width, height });

    const total = taskStore.getTotalCount(this._filter);

    this._table.setVirtualLoader(total, (start, end) => {
      const tasks = taskStore.getRange(start, end - start, this._filter, this._sortField, this._sortDir);
      return tasks.map((t) => ({
        id: t.taskId,
        label: this.formatTime(t.timestamp),
        sublabel: `#${t.taskId}`,
        data: t,
      }));
    });

    if (total > 0 && this._table.selectedIndex < 0) {
      this._table.selectedIndex = 0;
    }
    this.updateColumns();

    const renderTaskRow: TableRenderer<TaskMetrics> = (canvas, item, _index, isHighlighted, _x, _y, _width, columns) => {
      this.renderTaskRow(canvas, item.data!, isHighlighted, _width, columns);
    };
    this._table.setRenderer(renderTaskRow);

    const selected = this._table.getSelectedItem();
    this._detailsPanel.update(selected ? selected.data ?? null : null);
  }

  draw(_ctx: RenderContext): void {
    const stats = taskStore.getStats(this._filter);
    const hasFilters = this._filter.minCacheHitRatio !== undefined || this._filter.maxCtxSize !== undefined;

    this._summary.builder
      .muted("Tasks ")
      .accentColor(`${stats.count}`);
    if (hasFilters) {
      this._summary.builder.muted(` / ${taskStore.getTotalCount()}`);
    }
    this._summary.builder
      .muted("  Prompt ")
      .text(`${stats.totalPromptTokens.toLocaleString()}`)
      .muted("  Output ")
      .text(`${stats.totalOutputTokens.toLocaleString()}`)
      .muted("  Avg PP ")
      .accentColor(`${stats.avgPromptSpeed.toFixed(1)}`)
      .muted("  Avg TG ")
      .accentColor(`${stats.avgOutputSpeed.toFixed(1)}`);
  }

  formatTime(timestamp: string): string {
    const time = new Date(timestamp);
    return `${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}:${time.getSeconds().toString().padStart(2, "0")}`;
  }

  updateColumns(): void {
    const sortIndicator = this._sortDir === "asc" ? "▲" : "▼";

    this._table.columns = [
      { label: "Time", width: 10, align: "left" as const, headerSuffix: this._sortField === "timestamp" ? sortIndicator : undefined },
      { label: "ID", width: 6, align: "right" as const, headerSuffix: this._sortField === "taskId" ? sortIndicator : undefined },
      { label: "Slot", width: 4, align: "left" as const, headerSuffix: this._sortField === "slotId" ? sortIndicator : undefined },
      { label: "Profile", width: 8, flex: 1, align: "left" as const },
      { label: "PP", width: 10, align: "right" as const, headerSuffix: this._sortField === "promptSpeed" ? sortIndicator : undefined },
      { label: "TG", width: 10, align: "right" as const, headerSuffix: this._sortField === "outputSpeed" ? sortIndicator : undefined },
      { label: "Prompt", width: 8, align: "right" as const, headerSuffix: this._sortField === "promptTokens" ? sortIndicator : undefined },
      { label: "Output", width: 8, align: "right" as const, headerSuffix: this._sortField === "outputTokens" ? sortIndicator : undefined },
      { label: "Cache", width: 8, align: "right" as const, headerSuffix: this._sortField === "cachedPromptTokens" ? sortIndicator : undefined },
      { label: "TTS", width: 7, align: "right" as const, headerSuffix: this._sortField === "ttsMs" ? sortIndicator : undefined },
      { label: "Duration", width: 8, align: "right" as const, headerSuffix: this._sortField === "totalTimeMs" ? sortIndicator : undefined },
    ];
  }

  renderTaskRow(canvas: FramebufferCanvas, task: TaskMetrics, isHighlighted: boolean, width: number, columns: ComputedColumn[]): void {
    const time = new Date(task.timestamp);
    const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}:${time.getSeconds().toString().padStart(2, "0")}`;

    const profileText = task.profile || "-";

    const valMap: Record<string, string> = {
      Time: timeStr,
      ID: `#${task.taskId}`,
      Slot: `S${task.slotId}`,
      Profile: profileText.length > 0 ? profileText : "-",
      PP: `${task.promptSpeed.toFixed(1)} tps`,
      TG: `${task.outputSpeed.toFixed(1)} tps`,
      Prompt: `${task.promptTokens}`,
      Output: `${task.outputTokens}`,
      Cache: task.cachedPromptTokens > 0 && task.pendingTokens > 0 ? `${((task.cachedPromptTokens / task.pendingTokens) * 100).toFixed(0)}%` : "-",
      TTS: task.ttsMs > 0 ? `${task.ttsMs.toFixed(0)}ms` : "-",
      Duration: formatMs(task.totalTimeMs),
    };

    const cols: string[] = [];
    for (const col of columns) {
      let val = valMap[col.label] ?? "-";
      if (val.length > col.width) {
        val = "…" + val.substring(val.length - (col.width - 1));
      }
      cols.push(col.align === "right" ? val.padStart(col.width) : val.padEnd(col.width));
    }

    const row = cols.join(" ").padEnd(width);
    const fgColor = isHighlighted ? (this._table.focused ? "canvas" : "text") : "text";
    const bgColor = this._table.focused ? (isHighlighted ? "selectedBg" : "canvasSubtle") : "canvasSubtle";

    if (isHighlighted) {
      canvas.bold(true);
      fgBg(canvas, fgColor, bgColor, row.substring(0, width));
      canvas.bold(false);
    } else {
      fgBg(canvas, fgColor, bgColor, row.substring(0, width));
    }
  }

 handleKey(key: string): boolean {
    if (key === "s") {
      const idx = SORT_FIELDS.findIndex((s) => s.field === this._sortField);
      if (idx < SORT_FIELDS.length - 1) {
        this._sortField = SORT_FIELDS[idx + 1]!.field;
        this._sortDir = "desc";
      } else {
        this._sortField = SORT_FIELDS[0]!.field;
        this._sortDir = "desc";
      }
      this._table.selectedIndex = 0;
      this._table.scrollOffset = 0;
      this.markDirty();
      this._ctx?.showMessage(`Sort: ${SORT_FIELDS.find((s) => s.field === this._sortField)?.label} desc`);
      return true;
    }

    if (key === "r") {
      this._sortDir = this._sortDir === "asc" ? "desc" : "asc";
      this.markDirty();
      this._ctx?.showMessage(`Sort direction: ${this._sortDir === "asc" ? "ascending" : "descending"}`);
      return true;
    }

    if (this._table.contentHeight === 0) return false;

    if (key === "UP" || key === "DOWN" || key === "k" || key === "j" ||
        key === "PAGE_UP" || key === "PAGE_DOWN" || key === "HOME" || key === "END") {
      return this._table.handleKey(key);
    }

    return false;
  }

  onFocus(): void {
    super.onFocus();
    focusManager.setFocus(this._table);
    this.markDirty();
  }

 }

export function createTasksTab(ctx: TabContext): Control {
  return new TasksControl(ctx);
}
