import { Control } from "../ui/Control.js";
import { Divider } from "../ui/widgets/Divider.js";
import { TextInput } from "../ui/widgets/TextInput.js";
import { themeColors, fg } from "../../lib/theme.js";
import { focusManager } from "../ui/FocusManager.js";
import { taskStore, TaskMetrics, TaskSortField, TaskSortDir } from "../../lib/tasks.js";
import type { TabContext } from "../../lib/tabcontext.js";
import type { Size } from "../ui/types.js";

const SORT_FIELDS: { field: TaskSortField; label: string }[] = [
  { field: "timestamp", label: "Time" },
  { field: "taskId", label: "ID" },
  { field: "outputSpeed", label: "TG" },
  { field: "totalTimeMs", label: "Duration" },
  { field: "outputTokens", label: "Tokens" },
];

export class TasksControl extends Control {
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
    const { x, y, width } = this.rect;
    this._divider.layout({ x, y: y + (this._filterVisible ? 2 : 1), width: width, height: 1 });
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

  markDirty(): void {
    super.markDirty();
    this._ctx?.scheduleRender();
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
    const term = this.term;
    const { x, y: startY, width, height } = this.rect;
    const tasks = this.filteredTasks;
    const allTasks = taskStore.getTasks();
    const stats = taskStore.getStats(tasks);

    term.moveTo(x, startY);
    term.styleReset();

    const sortLabel = SORT_FIELDS.find((s) => s.field === this._sortField)?.label || this._sortField;
    const sortIndicator = this._sortDir === "asc" ? " ▲" : " ▼";
    const filterIndicator = (this._searchValue !== "" || this._slotValue !== "") ? " [F]" : "";
    fg(term, themeColors.text, `Tasks: ${stats.count}`);
    fg(term, themeColors.textMuted, `  Avg PP: ${stats.avgPromptSpeed.toFixed(1)}`);
    fg(term, themeColors.textMuted, `  Avg TG: ${stats.avgOutputSpeed.toFixed(1)}`);
    fg(term, themeColors.accent, `  Sort: ${sortLabel}${sortIndicator}`);
    if (filterIndicator) {
      fg(term, themeColors.warning, filterIndicator);
    }
    fg(term, themeColors.textMuted, " ".repeat(Math.max(0, width - 60 - String(stats.count).length - String(stats.avgPromptSpeed.toFixed(1)).length - String(stats.avgOutputSpeed.toFixed(1)).length - sortLabel.length)));

    super.render();

    const headerY = startY + (this._filterVisible ? 3 : 2);
    term.moveTo(x, headerY);
    term.styleReset();
    this.renderHeaderRow(width);

    const listStartY = startY + (this._filterVisible ? 4 : 3);
    const listHeight = height - (this._filterVisible ? 4 : 3);

    for (let i = 0; i < listHeight; i++) {
      const taskIdx = i + this._scrollOffset;
      term.moveTo(x, listStartY + i);
      term.styleReset();

      if (taskIdx < tasks.length) {
        const task = tasks[taskIdx]!;
        const isSelected = taskIdx === this._selectedIndex;
        this.renderTaskRow(task, isSelected, width);
      } else {
        fg(term, themeColors.canvas, " ".repeat(width));
      }
    }

    this.needsRender = false;
  }

  renderHeaderRow(width: number): void {
    const sortLabel = SORT_FIELDS.find((s) => s.field === this._sortField)?.label || this._sortField;
    const sortIndicator = this._sortDir === "asc" ? " ▲" : " ▼";

    const cols = [
      "TIMESTAMP".padEnd(9),
      "ID".padStart(6),
      "SLOT".padEnd(4),
      "PP".padStart(10),
      "TG".padStart(10),
      "TOKENS".padStart(8),
      "TIME".padStart(8),
    ].join(" ");

    let row = ` ${cols}`;
    const highlightCol = SORT_FIELDS.findIndex((s) => s.field === this._sortField);
    if (highlightCol >= 2) {
      const baseCols = [
        "TIMESTAMP".padEnd(9),
        "ID".padStart(6),
      ];
      row = ` ${baseCols.join(" ")} ${SORT_FIELDS[highlightCol - 2].label}${sortIndicator}`.padEnd(baseCols.join(" ").length + SORT_FIELDS[highlightCol - 2].label.length + sortIndicator.length + 2);
    }

    fg(this.term, themeColors.accent, row);
    fg(this.term, themeColors.textMuted, " ".repeat(Math.max(0, width - row.length)));
    this.term.styleReset();
  }

  renderTaskRow(task: TaskMetrics, isSelected: boolean, width: number): void {
    const time = new Date(task.timestamp);
    const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}:${time.getSeconds().toString().padStart(2, "0")}`;

    const cols = [
      timeStr.padEnd(9),
      `#${task.taskId}`.padStart(6),
      `S${task.slotId}`.padEnd(4),
      `${task.promptSpeed.toFixed(1)} tps`.padStart(10),
      `${task.outputSpeed.toFixed(1)} tps`.padStart(10),
      `${task.outputTokens}`.padStart(8),
      `${task.totalTimeMs.toFixed(0)}ms`.padStart(8),
    ].join(" ");

    const row = ` ${cols}`;

    if (isSelected) {
      const padded = row.padEnd(width);
      this.term.colorRgbHex(themeColors.canvas).bgColorRgbHex(themeColors.accent)(padded);
      this.term.styleReset();
    } else {
      fg(this.term, themeColors.text, row);
      fg(this.term, themeColors.textMuted, " ".repeat(Math.max(0, width - row.length)));
    }
    this.term.styleReset();
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
      this._scrollOffset = Math.min(len - listHeight, this._scrollOffset + listHeight);
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
