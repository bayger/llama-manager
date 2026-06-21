import { Modal } from "./Modal";
import { Control } from "../Control";
import { List } from "./List";
import { Column, Row } from "../Layout";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { Spacer } from "./Spacer";
import { modalManager } from "../ModalManager";
import { getThemeNames, loadThemeWithMode, setActiveTheme, getThemeMode, setThemeMode, themeHasLightVariant } from "../../../lib/theme";
import { fg, fgBg } from "../../../lib/theme";
import type { Color, ThemeColors, ThemeMode } from "../../../lib/theme";
import type { RenderContext, Size } from "../types";
import type { FramebufferCanvas } from "../../../lib/framebuffer-canvas";

const tc = (c: string): Color => c as Color;

const H = "\u2500";
const HALF_BLOCK = "\u2584";
const FULL_BLOCK = "\u2588";

const VISIBLE_ITEMS = 16;

class ThemePreviewControl extends Control {
  protected _themeName = "";
  protected _themeMode: ThemeMode = "dark";
  protected _theme: ThemeColors | null = null;

  setTheme(name: string, mode: ThemeMode): void {
    this._themeName = name;
    this._themeMode = mode;
    this._theme = loadThemeWithMode(name, mode);
    this.markDirty();
  }

  measure(_parentSize?: Size): Size {
    return { width: 48, height: 17 };
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

    const availableRows = Math.min(height, 17);
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
    canvas.write(" Start ");
    canvas.bold(false);
    canvas.setBackgroundColor(tc(t.canvas));
    canvas.write(" ");
    canvas.setForegroundColor(tc(t.textMuted));
    canvas.setBackgroundColor(tc(t.canvasSubtle));
    canvas.write(" Stop ");
    canvas.setBackgroundColor(tc(t.canvas));
    canvas.write(" ");
    canvas.setForegroundColor(tc(t.textMuted));
    canvas.setBackgroundColor(tc(t.canvasSubtle));
    canvas.write(" Kill ");
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
    canvas.setForegroundColor(tc(t.textMuted));
    canvas.write("☑ Auto-save");
    canvas.write("    ");
    canvas.setForegroundColor(tc(t.textMuted));
    canvas.write("☐ Debug mode");
    row++;
    if (row >= availableRows) return;

    // Progress bar
    canvas.moveTo(x, y + row);
    canvas.write(" ");
    canvas.setForegroundColor(tc(t.warning));
    canvas.write("⠋ Loading 65%");
    row++;
    if (row >= availableRows) return;

    canvas.moveTo(x, y + row);
    canvas.write(" ");
    const barWidth = Math.min(30, width - 12);
    const filled = Math.floor(barWidth * 0.65);
    const empty = barWidth - filled;
    canvas.setForegroundColor(tc(t.accent));
    canvas.write(FULL_BLOCK.repeat(filled));
    canvas.setForegroundColor(tc(t.border));
    canvas.write("\u2591".repeat(empty));
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
  protected _lightModeCb: Checkbox;
  protected _cancelBtn: Button;
  protected _applyBtn: Button;
  protected _contentRow: Row;
  protected _checkboxRow: Row;
  protected _buttonRow: Row;
  protected _contentColumn: Column;
  protected _resolve: ((value: string | null) => void) | null = null;
  protected _originalTheme = "";
  protected _originalMode: ThemeMode = "dark";
  protected _previewMode: ThemeMode = "dark";
  protected _selectedTheme = "";
  protected _allNames: string[] = [];
  protected _scrollOffset = 0;

  protected getSelectedTheme(): string {
    const globalIdx = this.getGlobalIndex();
    return this._allNames[globalIdx] || "";
  }

  protected updateLightModeCheckbox(): void {
    const themeName = this._allNames[this.getGlobalIndex()] || "";
    this._lightModeCb.disabled = !themeHasLightVariant(themeName);
  }

  constructor() {
    super();
    this._list = new List();
    this._preview = new ThemePreviewControl();
    this._cancelBtn = new Button({ label: "Cancel" });
    this._applyBtn = new Button({ label: "Apply" });
    this._contentRow = new Row();
    this._checkboxRow = new Row();
    this._buttonRow = new Row();
    this._contentColumn = new Column();

    // Override List key handling so Modal handles navigation + scrolling
    this._list.handleKey = () => false;

    this._list.setOnHighlight((item) => {
      if (item) {
        this._preview.setTheme(item.id, this._previewMode);
      }
      this.updateLightModeCheckbox();
    });

    // Custom renderer: always highlight selected row, mark active theme
    this._list.setRenderer((canvas, item, index, _isSelected, x, y, width) => {
      const isHighlighted = index === this._list.selectedIndex;
      const isSelected = item.id === this._selectedTheme;
      const marker = isSelected ? "✓ " : "  ";

      canvas.moveTo(x, y);

      const fgColor = isSelected ? "selected" : "text";
      const bgColor = this._list.focused ? (isHighlighted ? "selectedBg" : "canvasSubtle") : "canvasSubtle";
      if (isHighlighted) {
        fgBg(canvas, fgColor, bgColor, marker);
        fgBg(canvas, fgColor, bgColor, item.label);
        const filled = marker.length + item.label.length;
        fgBg(canvas, fgColor, bgColor, " ".repeat(Math.max(0, width - filled)));
      } else {
        fgBg(canvas, fgColor, bgColor, marker);
        fgBg(canvas, fgColor, bgColor, item.label);
        const filled = marker.length + item.label.length;
        fgBg(canvas, fgColor, bgColor, " ".repeat(Math.max(0, width - filled)));
      }
    });

    this._lightModeCb = new Checkbox({ label: "Light mode", checked: getThemeMode() === "light" });
    this._lightModeCb.setAction((checked) => {
      this._previewMode = checked ? "light" : "dark";
      this._preview.setTheme(this._allNames[this.getGlobalIndex()] || this._selectedTheme, this._previewMode);
    });

    this._cancelBtn.setAction(() => this.cancel());
    this._applyBtn.setAction(() => this.apply());

    const btnSpacer = new Spacer();
    btnSpacer.flex = 1;
    this._buttonRow.add(btnSpacer);
    this._buttonRow.add(this._cancelBtn);
    this._buttonRow.add(this._applyBtn);

    this._contentRow.add(this._list);
    const rowSpacer = new Spacer();
    rowSpacer.flex = 1;
    this._contentRow.add(rowSpacer);
    this._contentRow.add(this._preview);

    this._checkboxRow.add(this._lightModeCb);
    const cbSpacer = new Spacer();
    cbSpacer.flex = 1;
    this._checkboxRow.add(cbSpacer);

    this._contentColumn.add(this._contentRow);
    this._contentColumn.add(this._checkboxRow);
    const rowGap = new Control();
    rowGap.measure = () => ({ width: 0, height: 1 });
    rowGap.draw = () => {};
    this._contentColumn.add(rowGap);
    this._contentColumn.add(this._buttonRow);
    this._contentColumn.flex = 1;

    this.add(this._contentColumn);
  }

  setResolve(resolve: (value: string | null) => void): void {
    this._resolve = resolve;
  }

  setInitialTheme(name: string): void {
    this._originalTheme = name;
    this._originalMode = getThemeMode();
    this._previewMode = getThemeMode();
    this._selectedTheme = name;
    this._allNames = getThemeNames();
    const idx = this._allNames.indexOf(name);
    if (idx >= 0) {
      this._scrollOffset = Math.max(0, idx - Math.floor(VISIBLE_ITEMS / 2));
      this._list.selectedIndex = idx - this._scrollOffset;
    }
    this.updateVisibleItems();
    this._preview.setTheme(name, this._previewMode);
    this.updateLightModeCheckbox();
  }

  protected getGlobalIndex(): number {
    return this._scrollOffset + this._list.selectedIndex;
  }

  protected updateVisibleItems(): void {
    const maxScroll = Math.max(0, this._allNames.length - VISIBLE_ITEMS);
    this._scrollOffset = Math.max(0, Math.min(this._scrollOffset, maxScroll));
    const visible = this._allNames.slice(this._scrollOffset, this._scrollOffset + VISIBLE_ITEMS);
    this._list.updateItems(visible.map((name) => ({ id: name, label: name })));
    this._list.markDirty();
  }

  protected scrollUp(): boolean {
    if (this._list.selectedIndex > 0) {
      this._list.selectedIndex--;
      this._preview.setTheme(this._allNames[this.getGlobalIndex()]!, this._previewMode);
      this.updateLightModeCheckbox();
      this._list.markDirty();
      return true;
    }
    if (this._scrollOffset > 0) {
      this._scrollOffset--;
      this.updateVisibleItems();
      this._list.selectedIndex = 0;
      this._preview.setTheme(this._allNames[this.getGlobalIndex()]!, this._previewMode);
      this.updateLightModeCheckbox();
      this._list.markDirty();
      return true;
    }
    return false;
  }

  protected scrollDown(): boolean {
    const maxIdx = this._list.items.length - 1;
    if (this._list.selectedIndex < maxIdx) {
      this._list.selectedIndex++;
      this._preview.setTheme(this._allNames[this.getGlobalIndex()]!, this._previewMode);
      this.updateLightModeCheckbox();
      this._list.markDirty();
      return true;
    }
    if (this._scrollOffset + VISIBLE_ITEMS < this._allNames.length) {
      this._scrollOffset++;
      this.updateVisibleItems();
      this._list.selectedIndex = VISIBLE_ITEMS - 1;
      this._preview.setTheme(this._allNames[this.getGlobalIndex()]!, this._previewMode);
      this.updateLightModeCheckbox();
      this._list.markDirty();
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
    this._preview.setTheme(this._allNames[newGlobal]!, this._previewMode);
    this.updateLightModeCheckbox();
    this._list.markDirty();
  }

  protected scrollPageDown(): void {
    const prevGlobal = this.getGlobalIndex();
    const newGlobal = Math.min(this._allNames.length - 1, prevGlobal + VISIBLE_ITEMS);
    this._scrollOffset = Math.max(0, newGlobal - Math.floor(VISIBLE_ITEMS / 2));
    this.updateVisibleItems();
    this._list.selectedIndex = newGlobal - this._scrollOffset;
    this._preview.setTheme(this._allNames[newGlobal]!, this._previewMode);
    this.updateLightModeCheckbox();
    this._list.markDirty();
  }

  protected scrollToHome(): void {
    this._scrollOffset = 0;
    this.updateVisibleItems();
    this._list.selectedIndex = 0;
    this._preview.setTheme(this._allNames[0]!, this._previewMode);
    this.updateLightModeCheckbox();
    this._list.markDirty();
  }

  protected scrollToEnd(): void {
    const last = this._allNames.length - 1;
    this._scrollOffset = Math.max(0, last - VISIBLE_ITEMS + 1);
    this.updateVisibleItems();
    this._list.selectedIndex = last - this._scrollOffset;
    this._preview.setTheme(this._allNames[last]!, this._previewMode);
    this.updateLightModeCheckbox();
    this._list.markDirty();
  }

  measure(parentSize?: Size): Size {
    const base = super.measure(parentSize);
    return this._clampSize({ width: Math.max(base.width, 80), height: Math.max(base.height, 24) });
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
      this._selectedTheme = this.getSelectedTheme();
      this.apply();
      return true;
    }
    if ((key === "SPACE" || key === " ") && this._list.focused) {
      this._selectedTheme = this.getSelectedTheme();
      this._list.markDirty();
      return true;
    }
    if (key === "ESCAPE") {
      this.cancel();
      return true;
    }
    return false;
  }

  protected cancel(): void {
    setActiveTheme(this._originalTheme);
    if (this._resolve) {
      this._resolve(null);
      this._resolve = null;
    }
    modalManager.close(this);
  }

  protected apply(): void {
    setThemeMode(this._previewMode);
    setActiveTheme(this._selectedTheme);
    if (this._resolve) {
      this._resolve(this._selectedTheme);
      this._resolve = null;
    }
    modalManager.close(this);
  }
}

export function createThemeSelectorModal(currentTheme: string): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = new ThemeSelectorModal();
    modal.title = "Select Theme";
    modal.setMinSize(80, 24);
    modal.setMaxSize(120, 24);
    modal.setInitialTheme(currentTheme);
    modal.setResolve(resolve);

    setActiveTheme(currentTheme);
    modalManager.open(modal);
  });
}