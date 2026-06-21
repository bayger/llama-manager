import { Modal } from "./Modal";
import { Control } from "../Control";
import { List } from "./List";
import { modalManager } from "../ModalManager";
import { getThemeNames, loadTheme, setActiveTheme } from "../../../lib/theme";
import type { Color, ThemeColors } from "../../../lib/theme";
import type { RenderContext, Size } from "../types";

const tc = (c: string): Color => c as Color;

const H = "\u2500";
const HALF_BLOCK = "\u2584";
const FULL_BLOCK = "\u2588";

const VISIBLE_ITEMS = 15;

class ThemePreviewControl extends Control {
  protected _themeName = "";
  protected _theme: ThemeColors | null = null;

  setTheme(name: string): void {
    this._themeName = name;
    this._theme = loadTheme(name);
    this.markDirty();
  }

  measure(_parentSize?: Size): Size {
    return { width: 48, height: 16 };
  }

  draw(ctx: RenderContext): void {
    const { canvas } = ctx;
    const { x, y, width, height } = this.rect;
    const t = this._theme;

    if (!t) {
      canvas.moveTo(x, y);
      canvas.setForegroundColor("textMuted");
      canvas.write("No theme selected");
      return;
    }

    canvas.setBackgroundColor(tc(t.canvas));
    canvas.setForegroundColor(tc(t.text));
    canvas.clearRect(x, y, width, height);

    const availableRows = Math.min(height, 15);
    let row = 0;

    // Title
    canvas.moveTo(x, y + row);
    canvas.bold();
    canvas.setForegroundColor(tc(t.accent));
    const titleLine = ` ${this._themeName}`;
    canvas.write(titleLine);
    for (let col = titleLine.length; col < width; col++) {
      canvas.setForegroundColor(tc(t.borderMuted));
      canvas.write(H);
    }
    canvas.bold(false);
    row++;
    if (row >= availableRows) return;

    // Color palette
    canvas.moveTo(x, y + row);
    canvas.write(" ");
    const palette: Array<[string, keyof ThemeColors]> = [
      ["bg", "canvas"],
      ["bg-", "canvasSubtle"],
      ["txt", "text"],
      ["txt-", "textMuted"],
      ["acc", "accent"],
      ["suc", "success"],
      ["wrn", "warning"],
      ["err", "danger"],
      ["inf", "info"],
      ["brd", "borderMuted"],
      ["brd!", "borderActive"],
      ["sel", "selected"],
    ];
    for (const [label, role] of palette) {
      canvas.setForegroundColor(tc(t.canvas));
      canvas.setBackgroundColor(tc(t[role]));
      canvas.write(FULL_BLOCK);
      canvas.setForegroundColor(tc(t[role]));
      canvas.setBackgroundColor(tc(t.canvas));
      canvas.write(label);
    }
    row++;
    if (row >= availableRows) return;

    // Separator
    canvas.moveTo(x, y + row);
    canvas.setForegroundColor(tc(t.borderMuted));
    for (let col = 0; col < width; col++) canvas.write(H);
    row++;
    if (row >= availableRows) return;

    // Buttons
    canvas.moveTo(x, y + row);
    canvas.write(" ");
    canvas.setForegroundColor(tc(t.canvas));
    canvas.setBackgroundColor(tc(t.accent));
    canvas.bold();
    canvas.write(" [ Start ] ");
    canvas.bold(false);
    canvas.setBackgroundColor(tc(t.canvas));
    canvas.write(" ");
    canvas.setForegroundColor(tc(t.textMuted));
    canvas.setBackgroundColor(tc(t.canvasSubtle));
    canvas.write("[ Stop ]");
    canvas.setBackgroundColor(tc(t.canvas));
    canvas.write(" ");
    canvas.setForegroundColor(tc(t.canvas));
    canvas.setBackgroundColor(tc(t.danger));
    canvas.bold();
    canvas.write("[ Kill ]");
    canvas.bold(false);
    canvas.setBackgroundColor(tc(t.canvas));
    row++;
    if (row >= availableRows) return;

    // Labels
    canvas.moveTo(x, y + row);
    canvas.write(" ");
    canvas.setForegroundColor(tc(t.text));
    canvas.write("Status:");
    canvas.setForegroundColor(tc(t.success));
    canvas.write(" Running");
    canvas.write("  ");
    canvas.setForegroundColor(tc(t.textMuted));
    canvas.write("Model:");
    canvas.setForegroundColor(tc(t.text));
    canvas.write(" llama-3.1-8b");
    row++;
    if (row >= availableRows) return;

    // Checkboxes
    canvas.moveTo(x, y + row);
    canvas.write(" ");
    canvas.setForegroundColor(tc(t.accent));
    canvas.write("[x]");
    canvas.setForegroundColor(tc(t.text));
    canvas.write(" Auto-save");
    canvas.write("    ");
    canvas.setForegroundColor(tc(t.textMuted));
    canvas.write("[ ]");
    canvas.write(" Debug mode");
    row++;
    if (row >= availableRows) return;

    // Progress bar
    canvas.moveTo(x, y + row);
    canvas.write(" ");
    canvas.setForegroundColor(tc(t.text));
    canvas.write("Loading: ");
    const barWidth = Math.min(30, width - 12);
    const filled = Math.floor(barWidth * 0.65);
    for (let i = 0; i < filled; i++) {
      canvas.setForegroundColor(tc(t.accent));
      canvas.write(HALF_BLOCK);
    }
    for (let i = filled; i < barWidth; i++) {
      canvas.setForegroundColor(tc(t.borderMuted));
      canvas.write(HALF_BLOCK);
    }
    canvas.setForegroundColor(tc(t.text));
    canvas.write(" 65%");
    row++;
    if (row >= availableRows) return;

    // Separator
    canvas.moveTo(x, y + row);
    canvas.setForegroundColor(tc(t.borderMuted));
    for (let col = 0; col < width; col++) canvas.write(H);
    row++;
    if (row >= availableRows) return;

    // Table header
    canvas.moveTo(x, y + row);
    canvas.write(" ");
    canvas.bold();
    canvas.setForegroundColor(tc(t.accent));
    const hdr = "Slot  Task      Prompt  Output  Speed   Time";
    canvas.write(hdr);
    for (let col = hdr.length + 1; col < width; col++) canvas.write(" ");
    canvas.bold(false);
    row++;
    if (row >= availableRows) return;

    // Table row (selected)
    canvas.moveTo(x, y + row);
    canvas.setBackgroundColor(tc(t.selectedBg));
    canvas.setForegroundColor(tc(t.selectedText));
    const selRow = ` 0     generating  1024    256     45.2t/s 12s `.substring(0, width);
    canvas.write(selRow);
    for (let col = selRow.length; col < width; col++) canvas.write(" ");
    canvas.setBackgroundColor(tc(t.canvas));
    row++;
    if (row >= availableRows) return;

    // Table row (normal)
    canvas.moveTo(x, y + row);
    canvas.setForegroundColor(tc(t.text));
    const normRow = " 1     idle        512     128     38.7t/s 8s ";
    canvas.write(normRow);
    for (let col = normRow.length; col < width; col++) canvas.write(" ");
    row++;
    if (row >= availableRows) return;

    // Separator
    canvas.moveTo(x, y + row);
    canvas.setForegroundColor(tc(t.borderMuted));
    for (let col = 0; col < width; col++) canvas.write(H);
    row++;
    if (row >= availableRows) return;

    // Log lines
    canvas.moveTo(x, y + row);
    canvas.write(" ");
    canvas.setForegroundColor(tc(t.danger));
    canvas.write("ERROR");
    canvas.setForegroundColor(tc(t.textMuted));
    canvas.write(" Connection refused");
    row++;
    if (row >= availableRows) return;

    canvas.moveTo(x, y + row);
    canvas.write(" ");
    canvas.setForegroundColor(tc(t.warning));
    canvas.write("WARN");
    canvas.setForegroundColor(tc(t.textMuted));
    canvas.write("  High memory usage  ");
    row++;
    if (row >= availableRows) return;

    canvas.moveTo(x, y + row);
    canvas.write(" ");
    canvas.setForegroundColor(tc(t.success));
    canvas.write("INFO");
    canvas.setForegroundColor(tc(t.textMuted));
    canvas.write("    Server started on :8080");
  }
}

export class ThemeSelectorModal extends Modal {
  protected _list: List<string>;
  protected _preview: ThemePreviewControl;
  protected _resolve: ((value: string | null) => void) | null = null;
  protected _originalTheme = "";
  protected _allNames: string[] = [];
  protected _scrollOffset = 0;

  constructor() {
    super();
    this._list = new List();
    this._preview = new ThemePreviewControl();

    // Override List key handling so Modal handles navigation + scrolling
    this._list.handleKey = () => false;

    this._list.setOnHighlight((item) => {
      if (item) {
        this._preview.setTheme(item.id);
      }
    });

    this.add(this._list);
    this.add(this._preview);
  }

  setResolve(resolve: (value: string | null) => void): void {
    this._resolve = resolve;
  }

  setInitialTheme(name: string): void {
    this._originalTheme = name;
    this._allNames = getThemeNames();
    const idx = this._allNames.indexOf(name);
    if (idx >= 0) {
      this._scrollOffset = Math.max(0, idx - Math.floor(VISIBLE_ITEMS / 2));
      this._list.selectedIndex = idx - this._scrollOffset;
    }
    this.updateVisibleItems();
    this._preview.setTheme(name);
  }

  protected getGlobalIndex(): number {
    return this._scrollOffset + this._list.selectedIndex;
  }

  protected updateVisibleItems(): void {
    const maxScroll = Math.max(0, this._allNames.length - VISIBLE_ITEMS);
    this._scrollOffset = Math.max(0, Math.min(this._scrollOffset, maxScroll));
    const visible = this._allNames.slice(this._scrollOffset, this._scrollOffset + VISIBLE_ITEMS);
    this._list.updateItems(visible.map((name) => ({ id: name, label: name })));
  }

  protected scrollUp(): boolean {
    if (this._list.selectedIndex > 0) {
      this._list.selectedIndex--;
      this._preview.setTheme(this._allNames[this.getGlobalIndex()]!);
      return true;
    }
    if (this._scrollOffset > 0) {
      this._scrollOffset--;
      this.updateVisibleItems();
      this._list.selectedIndex = VISIBLE_ITEMS - 1;
      this._preview.setTheme(this._allNames[this.getGlobalIndex()]!);
      return true;
    }
    return false;
  }

  protected scrollDown(): boolean {
    const maxIdx = this._list.items.length - 1;
    if (this._list.selectedIndex < maxIdx) {
      this._list.selectedIndex++;
      this._preview.setTheme(this._allNames[this.getGlobalIndex()]!);
      return true;
    }
    if (this._scrollOffset + VISIBLE_ITEMS < this._allNames.length) {
      this._scrollOffset++;
      this.updateVisibleItems();
      this._list.selectedIndex = 0;
      this._preview.setTheme(this._allNames[this.getGlobalIndex()]!);
      return true;
    }
    return false;
  }

  protected scrollPageUp(): void {
    const prevGlobal = this.getGlobalIndex();
    const newGlobal = Math.max(0, prevGlobal - VISIBLE_ITEMS);
    this._scrollOffset = Math.max(0, newGlobal - Math.floor(VISIBLE_ITEMS / 2));
    this.updateVisibleItems();
    this._list.selectedIndex = newGlobal - this._scrollOffset;
    this._preview.setTheme(this._allNames[newGlobal]!);
  }

  protected scrollPageDown(): void {
    const prevGlobal = this.getGlobalIndex();
    const newGlobal = Math.min(this._allNames.length - 1, prevGlobal + VISIBLE_ITEMS);
    this._scrollOffset = Math.max(0, newGlobal - Math.floor(VISIBLE_ITEMS / 2));
    this.updateVisibleItems();
    this._list.selectedIndex = newGlobal - this._scrollOffset;
    this._preview.setTheme(this._allNames[newGlobal]!);
  }

  protected scrollToHome(): void {
    this._scrollOffset = 0;
    this.updateVisibleItems();
    this._list.selectedIndex = 0;
    this._preview.setTheme(this._allNames[0]!);
  }

  protected scrollToEnd(): void {
    const last = this._allNames.length - 1;
    this._scrollOffset = Math.max(0, last - VISIBLE_ITEMS + 1);
    this.updateVisibleItems();
    this._list.selectedIndex = last - this._scrollOffset;
    this._preview.setTheme(this._allNames[last]!);
  }

  measure(parentSize?: Size): Size {
    const base = super.measure(parentSize);
    return this._clampSize({ width: Math.max(base.width, 80), height: Math.max(base.height, 18) });
  }

  onLayout(): void {
    const { x, y, width, height } = this.rect;
    const listWidth = 28;
    const gap = 1;
    const previewWidth = width - listWidth - gap - 4;

    this._list.layout({ x: x + 2, y: y + 3, width: listWidth, height: height - 4 });
    this._preview.layout({ x: x + 2 + listWidth + gap, y: y + 3, width: previewWidth, height: height - 4 });
  }

  handleKey(key: string): boolean {
    if (key === "UP" || key === "k") {
      if (this.scrollUp()) return true;
    }
    if (key === "DOWN" || key === "j") {
      if (this.scrollDown()) return true;
    }
    if (key === "PAGE_UP") {
      this.scrollPageUp();
      return true;
    }
    if (key === "PAGE_DOWN") {
      this.scrollPageDown();
      return true;
    }
    if (key === "HOME") {
      this.scrollToHome();
      return true;
    }
    if (key === "END") {
      this.scrollToEnd();
      return true;
    }
    if (key === "RETURN" || key === "ENTER") {
      this.closeWithResult("confirm");
      return true;
    }
    if (key === "ESCAPE") {
      this.closeWithResult("cancel");
      return true;
    }
    return false;
  }

  public closeWithResult(result: "confirm" | "cancel"): void {
    if (result === "cancel") {
      setActiveTheme(this._originalTheme);
    }
    if (this._resolve) {
      this._resolve(result === "confirm" ? "confirm" : null);
      this._resolve = null;
    }
    modalManager.close(this);
  }
}

export function createThemeSelectorModal(currentTheme: string): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = new ThemeSelectorModal();
    modal.title = "Select Theme";
    modal.setMinSize(80, 18);
    modal.setMaxSize(120, 24);
    modal.setInitialTheme(currentTheme);
    modal.setResolve(resolve);

    setActiveTheme(currentTheme);
    modalManager.open(modal);
  });
}