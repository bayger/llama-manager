import { Control } from "../ui/Control";
import type { FramebufferCanvas } from "../../lib/framebuffer-canvas";
import { Column, Row } from "../ui/Layout";
import { Spacer } from "../ui/widgets/Spacer";
import { TextInput } from "../ui/widgets/TextInput";
import { Table } from "../ui/widgets/Table";
import { Section } from "../ui/widgets/Section";
import { fg, fgBg } from "../../lib/theme";
import { StyledText } from "../ui/widgets/StyledText";
import { focusManager } from "../ui/FocusManager";
import { fireAsync } from "../../lib/utils";
import { taskStore, TaskMetrics, TaskSortField, TaskSortDir, TaskFilter } from "../../lib/tasks";
import type { TabContext } from "../../lib/tabcontext";
import type { Size, RenderContext } from "../ui/types";
import type { TableRenderer, ComputedColumn } from "../ui/widgets/Table";

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

function fmtNum(n: number): string {
  return n.toLocaleString();
}

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
      { label: "Prompt Tokens", value: fmtNum(task.promptTokens) },
      { label: "Prompt Time", value: `${fmtNum(Math.round(task.promptTimeMs))}ms` },
      { label: "Prompt Speed", value: `${task.promptSpeed.toFixed(1)} t/s` },
      { label: "", value: "" },
      { label: "Output Tokens", value: fmtNum(task.outputTokens) },
      { label: "Eval Time", value: `${fmtNum(Math.round(task.evalTimeMs))}ms` },
      { label: "Output Speed", value: `${task.outputSpeed.toFixed(1)} t/s` },
      { label: "", value: "" },
      { label: "Total Tokens", value: fmtNum(task.totalTokens) },
      { label: "Total Time", value: `${fmtNum(Math.round(task.totalTimeMs))}ms` },
      { label: "", value: "" },
      { label: "Draft Accept", value: `${(task.draftAcceptance * 100).toFixed(1)}% (${task.draftAccepted}/${task.draftGenerated})` },
      { label: "Context Size", value: fmtNum(task.contextSize) },
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

    // blank separator row
    canvas.moveTo(x + 2, y + 2);
    fgBg(canvas, "canvasSubtle", "canvasSubtle", " ".repeat(innerW));

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
          fg(canvas, "text", ` ${value}`);
        }
      }
    }
  }
}


export class TasksControl extends Control {
  focusable = true;
  protected _ctx: TabContext | null = null;
  protected _column: Column;
  protected _summary: StyledText;
  protected _tasksSection: Section;
  protected _table: Table<TaskMetrics>;
  protected _detailsPanel: TaskDetailsControl;
  protected _contentRow: Row;
  protected _divider: Spacer;
  protected _filterRow: Row;
  protected _searchInput: TextInput;
  protected _slotInput: TextInput;
  protected _filterVisible = false;
  protected _sortField: TaskSortField = "timestamp";
  protected _sortDir: TaskSortDir = "desc";
  protected _searchValue = "";
  protected _slotValue = "";

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;
    this._summary = new StyledText();

    this._table = new Table<TaskMetrics>();
    this._table.showHeader = true;
    this._table.tabIndex = 0;
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

    this._divider = new Spacer();
    this._filterRow = new Row();
    this._searchInput = new TextInput();
    this._slotInput = new TextInput();
    this._searchInput.prefix = "ID: ";
    this._slotInput.prefix = "Slot: ";
    this._searchInput.visible = false;
    this._slotInput.visible = false;
    this._filterRow.add(this._searchInput);
    this._searchInput.flex = 1;
    this._filterRow.add(this._slotInput);
    this._slotInput.flex = 1;
    this._filterRow.visible = false;

    this._column = new Column();
    this._column.add(this._summary);
    this._column.add(this._filterRow);
    this._column.add(this._contentRow);
    this._contentRow.flex = 1;

    this.add(this._column);

    this._searchInput.setOnSubmit((v) => {
      this._searchValue = v;
      this.applyFilters();
    });
    this._searchInput.setOnCancel(() => {
      this.hideFilter();
    });
    this._searchInput.setOnChange((v) => {
      this._searchValue = v;
      this.applyFilters();
    });

    this._slotInput.setOnSubmit((v) => {
      this._slotValue = v;
      this.applyFilters();
    });
    this._slotInput.setOnCancel(() => {
      this.hideFilter();
    });
    this._slotInput.setOnChange((v) => {
      this._slotValue = v;
      this.applyFilters();
    });
  }

  getFilter(): TaskFilter | undefined {
    const filter: TaskFilter = {};

    if (this._searchValue !== "") {
      const id = parseInt(this._searchValue, 10);
      if (!isNaN(id)) {
        filter.taskId = id;
      }
    }

    if (this._slotValue !== "") {
      const slot = parseInt(this._slotValue, 10);
      if (!isNaN(slot)) {
        filter.slotId = slot;
      }
    }

    return Object.keys(filter).length > 0 ? filter : undefined;
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

    const filter = this.getFilter();
    const total = taskStore.getTotalCount(filter);

    this._table.setVirtualLoader(total, (start, end) => {
      const tasks = taskStore.getRange(start, end - start, filter, this._sortField, this._sortDir);
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

    const renderTaskRow: TableRenderer<TaskMetrics> = (canvas, item, _index, isSelected, _x, _y, _width, columns) => {
      this.renderTaskRow(canvas, item.data!, isSelected, _width, columns);
    };
    this._table.setRenderer(renderTaskRow);

    const selected = this._table.getSelectedItem();
    this._detailsPanel.update(selected ? selected.data ?? null : null);
  }

  applyFilters(): void {
    this._table.selectedIndex = 0;
    this._table.scrollOffset = 0;
    this.markDirty();
  }

  showFilter(): void {
    this._filterVisible = true;
    this._filterRow.visible = true;
    this._searchInput.value = this._searchValue;
    this._slotInput.value = this._slotValue;
    focusManager.setFocus(this._searchInput);
    this.markDirty();
  }

  hideFilter(): void {
    this._filterVisible = false;
    this._filterRow.visible = false;
    this.markDirty();
  }

  draw(_ctx: RenderContext): void {
    const filter = this.getFilter();
    const stats = taskStore.getStats(filter);

    const filterIndicator = (this._searchValue !== "" || this._slotValue !== "") ? " [F]" : "";
    this._summary.builder
      .muted("Tasks ")
      .accentColor(`${stats.count}`)
      .muted("  Prompt ")
      .text(`${stats.totalPromptTokens.toLocaleString()}`)
      .muted("  Output ")
      .text(`${stats.totalOutputTokens.toLocaleString()}`)
      .muted("  Avg PP ")
      .accentColor(`${stats.avgPromptSpeed.toFixed(1)}`)
      .muted("  Avg TG ")
      .accentColor(`${stats.avgOutputSpeed.toFixed(1)}`);
    if (filterIndicator) {
      this._summary.builder.warning(filterIndicator);
    }
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
      { label: "Duration", width: 8, align: "right" as const, headerSuffix: this._sortField === "totalTimeMs" ? sortIndicator : undefined },
    ];
  }

  renderTaskRow(canvas: FramebufferCanvas, task: TaskMetrics, isSelected: boolean, width: number, columns: ComputedColumn[]): void {
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
      Duration: `${task.totalTimeMs.toFixed(0)}ms`,
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

    if (isSelected) {
      fgBg(canvas, "selectedText", "selectedBg", row.substring(0, width));
    } else {
      fgBg(canvas, "text", "canvasSubtle", row.substring(0, width));
    }
  }

 handleKey(key: string): boolean {
    if (this._filterVisible) {
      return false;
    }

    if (key === "f") {
      this.showFilter();
      return true;
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
    this._table.focus();
    this.markDirty();
  }

 }

export function createTasksTab(ctx: TabContext): Control {
  return new TasksControl(ctx);
}
