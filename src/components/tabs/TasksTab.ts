import { Control } from "../ui/Control.js";
import { Divider } from "../ui/widgets/Divider.js";
import { TextInput } from "../ui/widgets/TextInput.js";
import { themeColors, fg } from "../../lib/theme.js";
import { focusManager } from "../ui/FocusManager.js";
import { taskStore, TaskMetrics, TaskSortField, TaskSortDir } from "../../lib/tasks.js";
import type { TabContext } from "../../lib/tabcontext.js";
import type { Size, Rect } from "../ui/types.js";

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
  protected _divider: Divider;
  protected _searchInput: TextInput;
  protected _slotInput: TextInput;
  protected _scrollOffset = 0;
  protected _selectedIndex = 0;
  protected _attached = false;
  protected _filterVisible = false;
  protected _sortField: TaskSortField = "timestamp";
  protected _sortDir: TaskSortDir = "desc";
  protected _searchValue = "";
  protected _slotValue = "";

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;
    this._divider = new Divider();
    this._searchInput = new TextInput();
    this._slotInput = new TextInput();
    this._searchInput.prefix = "ID: ";
    this._slotInput.prefix = "Slot: ";
    this._searchInput.visible = false;
    this._slotInput.visible = false;
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

  onAttach(): void {
    if (this._attached) return;
    this._attached = true;
    taskStore.on("updated", () => {
      this._selectedIndex = 0;
      this._scrollOffset = 0;
      this.markDirty();
    });
    this.markDirty();
  }

  onDetach(): void {
    this._attached = false;
    this._ctx = null;
  }

  onLayout(): void {
    const { x, y, width, height } = this.rect;
    this._divider.layout({ x, y: y + (this._filterVisible ? 2 : 1), width, height: 1 });
    this._searchInput.layout({ x: x + 1, y: y + 1, width: Math.floor(width / 2) - 2, height: 1 });
    this._slotInput.layout({ x: x + 1 + Math.floor(width / 2), y: y + 1, width: Math.floor(width / 2) - 2, height: 1 });
    this.clampSelection();
  }

  clampSelection(): void {
    const tasks = this.filteredTasks;
    const len = tasks.length;
    if (len === 0) {
      this._selectedIndex = 0;
      this._scrollOffset = 0;
      return;
    }
    this._selectedIndex = Math.max(0, Math.min(this._selectedIndex, len - 1));
    const listHeight = this.rect.height - (this._filterVisible ? 4 : 3);
    const maxScroll = Math.max(0, len - listHeight);
    this._scrollOffset = Math.max(0, Math.min(this._scrollOffset, maxScroll));
    if (this._selectedIndex < this._scrollOffset) {
      this._scrollOffset = this._selectedIndex;
    }
    if (this._selectedIndex >= this._scrollOffset + listHeight) {
      this._scrollOffset = this._selectedIndex - listHeight + 1;
    }
  }

  applyFilters(): void {
    this._selectedIndex = 0;
    this._scrollOffset = 0;
    this.clampSelection();
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

  render(): void {
    if (!this.visible || !this.needsRender) return;
    const canvas = this.canvas;
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

    super.render();

    const headerY = startY + (this._filterVisible ? 3 : 2);
    const listStartY = startY + (this._filterVisible ? 4 : 3);
    const listHeight = height - (this._filterVisible ? 4 : 3);

    const listWidth = width >= DETAILS_WIDTH + 25 ? width - DETAILS_WIDTH - 1 : width;

    canvas.moveTo(x, headerY);
    canvas.styleReset();
    this.renderHeaderRow(listWidth);

    for (let i = 0; i < listHeight; i++) {
      const taskIdx = i + this._scrollOffset;
      canvas.moveTo(x, listStartY + i);
      canvas.styleReset();

      if (taskIdx < tasks.length) {
        const task = tasks[taskIdx]!;
        const isSelected = taskIdx === this._selectedIndex && this.focused;
        this.renderTaskRow(task, isSelected, listWidth);
      } else {
        fg(canvas, themeColors.canvas, " ".repeat(listWidth));
      }
    }

    if (width >= DETAILS_WIDTH + 25) {
      const dx = x + listWidth + 1;
      this.renderDetailsPanel({ x: dx, y: listStartY, width: DETAILS_WIDTH, height: listHeight }, tasks);
    }

    this.needsRender = false;
  }

 renderHeaderRow(width: number): void {
    const sortIndicator = this._sortDir === "asc" ? "▲" : "▼";

    const allCols = [
      { header: "TIMESTAMP", width: 10, align: "left" as const, sortField: "timestamp" as TaskSortField },
      { header: "ID", width: 6, align: "right" as const, sortField: "taskId" as TaskSortField },
      { header: "SLOT", width: 4, align: "left" as const, sortField: "slotId" as TaskSortField },
      { header: "PP", width: 10, align: "right" as const, sortField: "promptSpeed" as TaskSortField },
      { header: "TG", width: 10, align: "right" as const, sortField: "outputSpeed" as TaskSortField },
      { header: "PROMPT", width: 8, align: "right" as const, sortField: "promptTokens" as TaskSortField },
      { header: "OUTPUT", width: 8, align: "right" as const, sortField: "outputTokens" as TaskSortField },
      { header: "TIME", width: 8, align: "right" as const, sortField: "totalTimeMs" as TaskSortField },
    ];

    const baseCols = allCols.slice(0, 3);
    const baseLen = baseCols.reduce((sum, c) => sum + c.width, 0) + (baseCols.length - 1) + 2;
    const extraCols = allCols.slice(3);
    let runningLen = baseLen;
    const visibleCols = [...baseCols];
    for (const col of extraCols) {
      runningLen += 1 + col.width;
      if (runningLen <= width) {
        visibleCols.push(col);
      } else {
        break;
      }
    }

    const parts = visibleCols.map((col) => {
      const isSorted = col.sortField && this._sortField === col.sortField;
      if (isSorted) {
        const content = col.header + sortIndicator;
        return col.align === "right" ? content.padStart(col.width) : content.padEnd(col.width);
      }
      return col.align === "right" ? col.header.padStart(col.width) : col.header.padEnd(col.width);
    });

    const row = " " + parts.join(" ");

    fg(this.canvas, themeColors.accent, row);
    fg(this.canvas, themeColors.textMuted, " ".repeat(Math.max(0, width - row.length)));
    this.canvas.styleReset();
  }

  renderTaskRow(task: TaskMetrics, isSelected: boolean, width: number): void {
    const time = new Date(task.timestamp);
    const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}:${time.getSeconds().toString().padStart(2, "0")}`;

    const baseCols = [
      timeStr.padEnd(10),
      `#${task.taskId}`.padStart(6),
      `S${task.slotId}`.padEnd(4),
    ];
    const baseLen = baseCols.join(" ").length + 2;

    const showPp = width >= baseLen + 10;
    const showTg = width >= baseLen + 20;
    const showPrompt = width >= baseLen + 28;
    const showOutput = width >= baseLen + 36;
    const showTime = width >= baseLen + 44;

    const cols = [...baseCols];
    if (showPp) cols.push(`${task.promptSpeed.toFixed(1)} tps`.padStart(10));
    if (showTg) cols.push(`${task.outputSpeed.toFixed(1)} tps`.padStart(10));
    if (showPrompt) cols.push(`${task.promptTokens}`.padStart(8));
    if (showOutput) cols.push(`${task.outputTokens}`.padStart(8));
    if (showTime) cols.push(`${task.totalTimeMs.toFixed(0)}ms`.padStart(8));

    const row = " " + cols.join(" ");

    if (isSelected) {
      const padded = row.padEnd(width);
      this.canvas.colorRgbHex(themeColors.canvas).bgColorRgbHex(themeColors.accent);
      this.canvas.write(padded);
      this.canvas.styleReset();
    } else {
      fg(this.canvas, themeColors.text, row);
      fg(this.canvas, themeColors.textMuted, " ".repeat(Math.max(0, width - row.length)));
    }
    this.canvas.styleReset();
  }

  renderDetailsPanel(rect: Rect, tasks: TaskMetrics[]): void {
    if (rect.width === 0) return;
    const { x, y, width, height } = rect;
    const canvas = this.canvas;

    if (tasks.length === 0 || this._selectedIndex < 0 || this._selectedIndex >= tasks.length) {
      canvas.moveTo(x, y);
      fg(canvas, themeColors.textMuted, "No tasks");
      for (let i = 1; i < height; i++) {
        canvas.moveTo(x, y + i);
        fg(canvas, themeColors.canvas, " ".repeat(width));
      }
      return;
    }

    const task = tasks[this._selectedIndex]!;
    const time = new Date(task.timestamp);
    const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}:${time.getSeconds().toString().padStart(2, "0")}`;

    const lines: { label: string; value: string }[] = [
      { label: "Task Details", value: "" },
      { label: "", value: "" },
      { label: "ID", value: `#${task.taskId}` },
      { label: "Slot", value: `S${task.slotId}` },
      { label: "Time", value: timeStr },
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
          const value = line.value;
          const labelWidth = 14;
          const formattedLabel = label.padEnd(labelWidth);
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

    const tasks = this.filteredTasks;
    const len = tasks.length;

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
      this._selectedIndex = 0;
      this._scrollOffset = 0;
      this.clampSelection();
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

    if (len === 0) return false;

    if (key === "UP" || key === "k") {
      if (this._selectedIndex > 0) {
        this._selectedIndex--;
        if (this._selectedIndex < this._scrollOffset) {
          this._scrollOffset = this._selectedIndex;
        }
        this.markDirty();
        return true;
      }
      return false;
    }
    if (key === "DOWN" || key === "j") {
      if (this._selectedIndex < len - 1) {
        this._selectedIndex++;
        const viewportBottom = this._scrollOffset + this.rect.height - (this._filterVisible ? 4 : 3);
        if (this._selectedIndex >= viewportBottom) {
          this._scrollOffset = this._selectedIndex - this.rect.height + (this._filterVisible ? 4 : 3) + 1;
        }
        this.markDirty();
        return true;
      }
      return false;
    }
    if (key === "PAGE_UP") {
      const listHeight = this.rect.height - (this._filterVisible ? 4 : 3);
      this._selectedIndex = Math.max(0, this._selectedIndex - listHeight);
      this._scrollOffset = Math.max(0, this._scrollOffset - listHeight);
      this.markDirty();
      return true;
    }
    if (key === "PAGE_DOWN") {
      const listHeight = this.rect.height - (this._filterVisible ? 4 : 3);
      this._selectedIndex = Math.min(len - 1, this._selectedIndex + listHeight);
      this._scrollOffset = Math.min(len - listHeight, this._scrollOffset);
      this.markDirty();
      return true;
    }
    if (key === "HOME") {
      this._selectedIndex = 0;
      this._scrollOffset = 0;
      this.markDirty();
      return true;
    }
    if (key === "END") {
      this._selectedIndex = len - 1;
      this._scrollOffset = Math.max(0, len - (this.rect.height - (this._filterVisible ? 4 : 3)));
      this.markDirty();
      return true;
    }

    return false;
  }

  onFocus(): void {
    super.onFocus();
    this.clampSelection();
    this.markDirty();
  }
}

export function createTasksTab(ctx: TabContext): Control {
  return new TasksControl(ctx);
}
