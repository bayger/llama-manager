import { Control } from "../../framework/Control";
import { Column, Row } from "../../framework/Layout";
import { Table } from "../../framework/widgets/Table";
import { Section } from "../../framework/widgets/Section";
import { Spacer } from "../../framework/widgets/Spacer";
import { fg, fgBg } from "../../lib/theme";
import type { Color } from "../../lib/theme";
import { StyledText } from "../../framework/widgets/StyledText";
import { TaskChartsControl } from "../specialized/TaskChartsSection";
import { focusManager } from "../../framework/FocusManager";
import { fireAsync, formatMs, formatDate, formatTime } from "../../lib/utils";
import { taskStore, TaskMetrics, TaskSortField, TaskSortDir } from "../../lib/tasks";
import type { TabContext } from "../../lib/tabcontext";
import type { Point, Size, RenderContext } from "../../framework/types";

const SORT_FIELDS: { field: TaskSortField; label: string }[] = [
  { field: "timestamp", label: "Time" },
  { field: "taskId", label: "ID" },
  { field: "slotId", label: "Slot" },
  { field: "promptSpeed", label: "PP" },
  { field: "outputSpeed", label: "TG" },
  { field: "promptTokens", label: "Prompt" },
  { field: "outputTokens", label: "Output" },
  { field: "totalTimeMs", label: "Duration" },
];

const DETAILS_WIDTH = 40;

class TaskDetailsControl extends Section {
  protected _task: TaskMetrics | null = null;
  protected _scrollOffset = 0;

  measure(parentSize: Size): Size {
    return { width: DETAILS_WIDTH, height: parentSize.height };
  }

  update(task: TaskMetrics | null): void {
    this._task = task;
    this._scrollOffset = 0;
    this.markDirty();
  }

  scroll(delta: number): void {
    if (!this._task) return;
    const lines = this._getLines();
    const { height } = this.rect;
    const maxOffset = Math.max(0, lines.length - height);
    this._scrollOffset = Math.max(0, Math.min(maxOffset, this._scrollOffset + delta));
    this.markDirty();
  }

  onMouseWheel(_point: Point, direction: 'up' | 'down'): boolean {
    if (!this._task) return false;
    const lines = this._getLines();
    const { height } = this.rect;
    const maxOffset = Math.max(0, lines.length - height);
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

  _getLines(): { label: string; value: string; color?: string }[] {
    if (!this._task) return [{ label: "No selection", value: "" }];
    const task = this._task;
    const timeStr = formatTime(task.timestamp);
    const dateStr = formatDate(task.timestamp);

    return [
      { label: "ID", value: `#${task.taskId}` },
      { label: "Slot", value: `S${task.slotId}` },
      { label: "Date", value: dateStr },
      { label: "Time", value: timeStr },
      { label: "", value: "" },
      { label: "Profile", value: task.profile || "-" },
      { label: "Model", value: task.model || "-" },
      { label: "Version", value: task.version || "-" },
      { label: "", value: "" },
      { label: "Prompt Tokens", value: task.promptTokens.toLocaleString(), color: "info" },
      { label: "Prompt Time", value: formatMs(task.promptTimeMs) },
      { label: "Prompt Speed", value: `${task.promptSpeed.toFixed(1)} t/s`, color: "info" },
      { label: "", value: "" },
      { label: "Output Tokens", value: task.outputTokens.toLocaleString(), color: "success" },
      { label: "Eval Time", value: formatMs(task.evalTimeMs) },
      { label: "Output Speed", value: `${task.outputSpeed.toFixed(1)} t/s`, color: "success" },
      { label: "", value: "" },
      { label: "Total Tokens", value: task.totalTokens.toLocaleString() },
      { label: "Total Time", value: formatMs(task.totalTimeMs) },
      { label: "", value: "" },
      { label: "Draft Accept", value: `${(task.draftAcceptance * 100).toFixed(1)}% (${task.draftAccepted}/${task.draftGenerated})`, color: "accentColor" },
      { label: "Context Size", value: task.contextSize.toLocaleString() },
      { label: "Truncated", value: task.truncated ? "Yes" : "No" },
    ];
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

    canvas.moveTo(x + 2, y + 2);
    fgBg(canvas, "surface", "surface", " ".repeat(innerW));

    for (let i = 0; i < height - 4; i++) {
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
          fg(canvas, (line.color || "text") as Color, ` ${value}`);
        }
      }
    }
  }
}


export class TasksControl extends Control {
  protected _ctx: TabContext | null = null;
  protected _column: Column;
  protected _summary: StyledText;
  protected _tasksSection: Section;
  protected _table: Table<TaskMetrics>;
  protected _detailsPanel: TaskDetailsControl;
  protected _contentRow: Row;
  protected _sortField: TaskSortField = "timestamp";
  protected _sortDir: TaskSortDir = "desc";

  protected _view: "table" | "charts" = "table";
  protected _tableColumn: Column;
  protected _chartsControl: TaskChartsControl;

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;
    this._summary = new StyledText();

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

    this._tableColumn = new Column();
    this._tableColumn.add(this._summary);
    this._tableColumn.add(new Spacer());
    this._tableColumn.add(this._contentRow);
    this._contentRow.flex = 1;

    this._chartsControl = new TaskChartsControl();

    this._column = new Column();
    this._column.add(this._tableColumn);
    this._tableColumn.flex = 1;
    this._column.add(this._chartsControl);
    this._chartsControl.flex = 1;

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
    this._tableColumn.visible = this._view === "table";
    this._chartsControl.visible = this._view === "charts";
    this._column.layout({ x, y, width, height });

    if (this._view === "table") {
      const showDetails = width >= DETAILS_WIDTH + 26;
      this._detailsPanel.visible = showDetails;

      const total = taskStore.getTotalCount();

      this._table.setVirtualLoader(total, (start, end) => {
        const tasks = taskStore.getRange(start, end - start, undefined, this._sortField, this._sortDir);
        return tasks.map((t) => ({
          id: t.taskId,
          label: "",
          data: t,
        }));
      });

      if (total > 0 && this._table.selectedIndex < 0) {
        this._table.selectedIndex = 0;
      }
      this.updateColumns();

      const selected = this._table.getSelectedItem();
      this._detailsPanel.update(selected ? selected.data ?? null : null);
    }
  }

  draw(_ctx: RenderContext): void {
    const stats = taskStore.getStats();

    this._summary.builder
      .muted("Tasks ")
      .accentColor(`${stats.count}`)
      .muted("  Prompt ")
      .info(`${stats.totalPromptTokens.toLocaleString()}`)
      .muted("  Output ")
      .success(`${stats.totalOutputTokens.toLocaleString()}`)
      .muted("  Avg PP ")
      .info(`${stats.avgPromptSpeed.toFixed(1)} t/s`)
      .muted("  Avg TG ")
      .success(`${stats.avgOutputSpeed.toFixed(1)} t/s`);
  }

  updateColumns(): void {
    const sortIndicator = this._sortDir === "asc" ? "▲" : "▼";

    this._table.columns = [
      { label: "Date", width: 11, align: "left" as const, headerSuffix: this._sortField === "timestamp" ? sortIndicator : undefined, format: (_c, r: TaskMetrics) => formatDate(r.timestamp) },
      { label: "Time", width: 8, align: "left" as const, format: (_c, r: TaskMetrics) => formatTime(r.timestamp) },
      { label: "ID", width: 6, align: "right" as const, headerSuffix: this._sortField === "taskId" ? sortIndicator : undefined, format: (_c, r: TaskMetrics) => `#${r.taskId}` },
      { label: "Slot", width: 4, align: "left" as const, headerSuffix: this._sortField === "slotId" ? sortIndicator : undefined, format: (_c, r: TaskMetrics) => `S${r.slotId}` },
      { label: "Profile", width: 8, flex: 1, align: "left" as const, format: (_c, r: TaskMetrics) => r.profile || "-" },
      { label: "PP", width: 10, align: "right" as const, headerSuffix: this._sortField === "promptSpeed" ? sortIndicator : undefined, color: "info", format: (_c, r: TaskMetrics) => `${r.promptSpeed.toFixed(1)} t/s` },
      { label: "TG", width: 10, align: "right" as const, headerSuffix: this._sortField === "outputSpeed" ? sortIndicator : undefined, color: "success", format: (_c, r: TaskMetrics) => `${r.outputSpeed.toFixed(1)} t/s` },
      { label: "Prompt", width: 8, align: "right" as const, headerSuffix: this._sortField === "promptTokens" ? sortIndicator : undefined, color: "info", format: (_c, r: TaskMetrics) => String(r.promptTokens) },
      { label: "Output", width: 8, align: "right" as const, headerSuffix: this._sortField === "outputTokens" ? sortIndicator : undefined, color: "success", format: (_c, r: TaskMetrics) => String(r.outputTokens) },
      { label: "Duration", width: 8, align: "right" as const, headerSuffix: this._sortField === "totalTimeMs" ? sortIndicator : undefined, format: (_c, r: TaskMetrics) => formatMs(r.totalTimeMs) },
    ];
  }

  handleKey(key: string): boolean {
    if (key === "c") {
      this._view = this._view === "table" ? "charts" : "table";
      this.markDirty();
      this._ctx?.showMessage(this._view === "charts" ? "View: Charts" : "View: Table");
      return true;
    }

    if (this._view === "charts") {
      if (key === "b") {
        this._chartsControl.cycleTimeBucket();
        this._ctx?.showMessage(`Time bucket: ${this._chartsControl.timeBucket}`);
        return true;
      }
      return this._chartsControl.handleKey(key);
    }

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
    if (this._view === "table") {
      focusManager.setFocus(this._table);
    }
    this.markDirty();
  }

 }

export function createTasksTab(ctx: TabContext): Control {
  return new TasksControl(ctx);
}
