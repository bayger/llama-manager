import { Control } from "../ui/Control.js";
import type { FramebufferCanvas } from "../../lib/framebuffer-canvas.js";
import { Divider } from "../ui/widgets/Divider.js";
import { TextInput } from "../ui/widgets/TextInput.js";
import { Table } from "../ui/widgets/Table.js";
import { themeColors, fg } from "../../lib/theme.js";
import { focusManager } from "../ui/FocusManager.js";
import { fireAsync } from "../../lib/utils.js";
import { taskStore, TaskMetrics, TaskSortField, TaskSortDir } from "../../lib/tasks.js";
import type { TabContext } from "../../lib/tabcontext.js";
import type { Size, Rect, RenderContext } from "../ui/types.js";
import type { TableRenderer, ComputedColumn } from "../ui/widgets/Table.js";

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

export class TasksControl extends Control {
  focusable = true;
  protected _ctx: TabContext | null = null;
  protected _table: Table<TaskMetrics>;
  protected _divider: Divider;
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
    this._table = new Table();
    this._table.showHeader = true;
    this._table.headerHeight = 1;
    this._table.setOnHighlight(() => this.markDirty());
    this._table.setOnSelect(() => {
      fireAsync(async () => {}, ctx);
    });
    this._divider = new Divider();
    this._searchInput = new TextInput();
    this._slotInput = new TextInput();
    this._searchInput.prefix = "ID: ";
    this._slotInput.prefix = "Slot: ";
    this._searchInput.visible = false;
    this._slotInput.visible = false;
    this.add(this._table);
    this.add(this._divider);
    this.add(this._searchInput);
    this.add(this._slotInput);

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

  get filteredTasks(): TaskMetrics[] {
    const filter: { taskId?: number; slotId?: number } = {};

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

    let tasks = Object.keys(filter).length > 0 ? taskStore.getFiltered(filter) : taskStore.getTasks();
    tasks = taskStore.getSorted(tasks, this._sortField, this._sortDir);
    return tasks;
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
    const tableLayout = this.getTableLayout();
    this._table.layout(tableLayout);
    this._divider.layout({ x, y: y + (this._filterVisible ? 2 : 1), width, height: 1 });
    this._searchInput.layout({ x: x + 1, y: y + 1, width: Math.floor(width / 2) - 2, height: 1 });
    this._slotInput.layout({ x: x + 1 + Math.floor(width / 2), y: y + 1, width: Math.floor(width / 2) - 2, height: 1 });

    const tasks = this.filteredTasks;
    this._table.items = tasks.map((t) => ({
      id: t.taskId,
      label: this.formatTime(t.timestamp),
      sublabel: `#${t.taskId}`,
      data: t,
    }));
    this._table.contentHeight = tasks.length;
    this.updateColumns();

    const renderTaskRow: TableRenderer<TaskMetrics> = (canvas, item, _index, isSelected, _x, _y, _width, columns) => {
      this.renderTaskRow(canvas, item.data!, isSelected, _width, columns);
    };
    this._table.setRenderer(renderTaskRow);
  }

  getTableLayout(): Rect {
    const { x, y, width, height } = this.rect;
    const headerY = y + (this._filterVisible ? 3 : 2);
    const listHeight = height - (this._filterVisible ? 4 : 3);
    const listWidth = width >= DETAILS_WIDTH + 26 ? width - DETAILS_WIDTH - 2 : width;
    return { x, y: headerY, width: listWidth, height: listHeight };
  }

  applyFilters(): void {
    this._table.selectedIndex = 0;
    this._table.scrollOffset = 0;
    this.markDirty();
  }

  showFilter(): void {
    this._filterVisible = true;
    this._searchInput.visible = true;
    this._slotInput.visible = true;
    this._searchInput.value = this._searchValue;
    this._slotInput.value = this._slotValue;
    focusManager.setFocus(this._searchInput);
    this.markDirty();
  }

  hideFilter(): void {
    this._filterVisible = false;
    this._searchInput.visible = false;
    this._slotInput.visible = false;
    this.markDirty();
  }

  render(ctx: RenderContext): void {
    if (!this.visible || !this.needsRender) return;
    const canvas = ctx.canvas;
    const { x, y: startY, width, height } = this.rect;
    const tasks = this.filteredTasks;
    const stats = taskStore.getStats(tasks);

    canvas.moveTo(x, startY);
    canvas.styleReset();

    const filterIndicator = (this._searchValue !== "" || this._slotValue !== "") ? " [F]" : "";
    const statsText = `Tasks: ${stats.count}  Prompt: ${stats.totalPromptTokens.toLocaleString()}  Output: ${stats.totalOutputTokens.toLocaleString()}  Total: ${stats.totalTokens.toLocaleString()}  Avg PP: ${stats.avgPromptSpeed.toFixed(1)}  Avg TG: ${stats.avgOutputSpeed.toFixed(1)}  Draft: ${(stats.avgDraftAcceptance * 100).toFixed(1)}%`;
    fg(canvas, themeColors.text, statsText);
    if (filterIndicator) {
      fg(canvas, themeColors.warning, filterIndicator);
    }
    fg(canvas, themeColors.textMuted, " ".repeat(Math.max(0, width - statsText.length - filterIndicator.length)));

    super.render(ctx);

    const listStartY = startY + (this._filterVisible ? 4 : 3);
    const listHeight = height - (this._filterVisible ? 5 : 4);

    if (width >= DETAILS_WIDTH + 26) {
      const dx = x + (this.rect.width >= DETAILS_WIDTH + 26 ? this.rect.width - DETAILS_WIDTH - 1 : this.rect.width);
      this.renderDetailsPanel(canvas, { x: dx, y: listStartY, width: DETAILS_WIDTH, height: listHeight }, tasks);
    }

    this.needsRender = false;
  }

  formatTime(timestamp: string): string {
    const time = new Date(timestamp);
    return `${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}:${time.getSeconds().toString().padStart(2, "0")}`;
  }

  updateColumns(): void {
    const sortIndicator = this._sortDir === "asc" ? "▲" : "▼";

    this._table.columns = [
      { label: "TIMESTAMP", width: 10, align: "left" as const, headerSuffix: this._sortField === "timestamp" ? sortIndicator : undefined },
      { label: "ID", width: 6, align: "right" as const, headerSuffix: this._sortField === "taskId" ? sortIndicator : undefined },
      { label: "SLOT", width: 4, align: "left" as const, headerSuffix: this._sortField === "slotId" ? sortIndicator : undefined },
      { label: "PROFILE", width: 8, flex: 1, align: "left" as const },
      { label: "PP", width: 10, align: "right" as const, headerSuffix: this._sortField === "promptSpeed" ? sortIndicator : undefined },
      { label: "TG", width: 10, align: "right" as const, headerSuffix: this._sortField === "outputSpeed" ? sortIndicator : undefined },
      { label: "PROMPT", width: 8, align: "right" as const, headerSuffix: this._sortField === "promptTokens" ? sortIndicator : undefined },
      { label: "OUTPUT", width: 8, align: "right" as const, headerSuffix: this._sortField === "outputTokens" ? sortIndicator : undefined },
      { label: "TIME", width: 8, align: "right" as const, headerSuffix: this._sortField === "totalTimeMs" ? sortIndicator : undefined },
    ];
  }

  renderTaskRow(canvas: FramebufferCanvas, task: TaskMetrics, isSelected: boolean, width: number, columns: ComputedColumn[]): void {
    const time = new Date(task.timestamp);
    const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}:${time.getSeconds().toString().padStart(2, "0")}`;

    const profileText = task.profile || "-";

    const valMap: Record<string, string> = {
      TIMESTAMP: timeStr,
      ID: `#${task.taskId}`,
      SLOT: `S${task.slotId}`,
      PROFILE: profileText.length > 0 ? profileText : "-",
      PP: `${task.promptSpeed.toFixed(1)} tps`,
      TG: `${task.outputSpeed.toFixed(1)} tps`,
      PROMPT: `${task.promptTokens}`,
      OUTPUT: `${task.outputTokens}`,
      TIME: `${task.totalTimeMs.toFixed(0)}ms`,
    };

    const cols: string[] = [];
    for (const col of columns) {
      let val = valMap[col.label] ?? "-";
      if (val.length > col.width) {
        val = "…" + val.substring(val.length - (col.width - 1));
      }
      cols.push(col.align === "right" ? val.padStart(col.width) : val.padEnd(col.width));
    }

    const row = " " + cols.join(" ");

    if (isSelected) {
      const padded = row.padEnd(width);
      canvas.colorRgbHex(themeColors.canvas).bgColorRgbHex(themeColors.accent);
      canvas.write(padded);
      canvas.styleReset();
    } else {
      fg(canvas, themeColors.text, row);
      fg(canvas, themeColors.textMuted, " ".repeat(Math.max(0, width - row.length)));
    }
    canvas.styleReset();
  }

  renderDetailsPanel(canvas: FramebufferCanvas, rect: Rect, tasks: TaskMetrics[]): void {
    if (rect.width === 0) return;
    const { x, y, width, height } = rect;
    const selectedIndex = this._table.selectedIndex;

    if (tasks.length === 0 || selectedIndex < 0 || selectedIndex >= tasks.length) {
      canvas.moveTo(x, y);
      fg(canvas, themeColors.textMuted, "No tasks");
      for (let i = 1; i < height; i++) {
        canvas.moveTo(x, y + i);
        fg(canvas, themeColors.canvas, " ".repeat(width));
      }
      return;
    }

    const task = tasks[selectedIndex]!;
    const time = new Date(task.timestamp);
    const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}:${time.getSeconds().toString().padStart(2, "0")}`;

    const lines: { label: string; value: string }[] = [
      { label: "Task Details", value: "" },
      { label: "", value: "" },
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
      { label: "Graphs Reused", value: String(task.graphsReused) },
      { label: "Draft Accept", value: `${(task.draftAcceptance * 100).toFixed(1)}% (${task.draftAccepted}/${task.draftGenerated})` },
      { label: "Context Size", value: fmtNum(task.contextSize) },
      { label: "Truncated", value: task.truncated ? "Yes" : "No" },
    ];

    for (let i = 0; i < height; i++) {
      canvas.moveTo(x, y + i);
      canvas.styleReset();

      if (i < lines.length) {
        const line = lines[i]!;
        if (i === 0) {
          const title = line.label.padEnd(width);
          fg(canvas, themeColors.accent, title);
        } else if (line.label === "") {
          fg(canvas, themeColors.canvas, " ".repeat(width));
        } else {
          const label = line.label + ":";
          let value = line.value;
          const labelWidth = 14;
          const formattedLabel = label.padEnd(labelWidth);
          const valueWidth = width - labelWidth - 2;
          if (value.length > valueWidth) {
            value = "…" + value.substring(value.length - (valueWidth - 1));
          }
          const row = ` ${formattedLabel} ${value}`;
          fg(canvas, themeColors.textMuted, formattedLabel);
          fg(canvas, themeColors.text, " " + value);
          fg(canvas, themeColors.textMuted, " ".repeat(Math.max(0, width - row.length)));
        }
      } else {
        fg(canvas, themeColors.canvas, " ".repeat(width));
      }
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

    if (this._table.items.length === 0) return false;

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
