import { Modal } from "../../framework/widgets/Modal";
import { Control } from "../../framework/Control";
import { List } from "../../framework/widgets/List";
import { Column, Row } from "../../framework/Layout";
import { Button } from "../../framework/widgets/Button";
import { Checkbox } from "../../framework/widgets/Checkbox";
import { Spacer } from "../../framework/widgets/Spacer";
import { modalManager } from "../../framework/ModalManager";
import { getThemeNames, loadThemeWithMode, setActiveTheme, getThemeMode, setThemeMode, themeHasLightVariant, themeColors } from "../../lib/theme";
import type { Color, ThemeColors, ThemeMode } from "../../lib/theme";
import type { RenderContext, Size } from "../../framework/types";
import type { FramebufferCanvas } from "../../lib/framebuffer-canvas";

const tc = (c: string): Color => c as Color;

const H = "\u2500";
const HALF_BLOCK = "\u2584";
const FULL_BLOCK = "\u2588";

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
    return { width: 48, height: 19 };
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

    const availableRows = Math.min(height, 20);
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

    // Spacer
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
    canvas.setBackgroundColor(tc(t.surface));
    canvas.write(" Stop ");
    canvas.setBackgroundColor(tc(t.canvas));
    canvas.write(" ");
    canvas.setForegroundColor(tc(t.textMuted));
    canvas.setBackgroundColor(tc(t.surface));
    canvas.write(" Kill ");
    canvas.setBackgroundColor(tc(t.canvas));
    row++;
    if (row >= availableRows) return;

    // Spacer
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

    // Spacer
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

    // Spacer
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

    // Spacer
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
    canvas.setBackgroundColor(tc(t.selectionBg));
    canvas.setForegroundColor(tc(t.selectionText));
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

    // Spacer
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
    canvas.write("WARN ");
    canvas.setForegroundColor(tc(t.textMuted));
    canvas.write(" High memory usage");
    row++;
    if (row >= availableRows) return;

    canvas.moveTo(x, y + row);
    canvas.write(" ");
    canvas.setForegroundColor(tc(t.success));
    canvas.write("INFO ");
    canvas.setForegroundColor(tc(t.textMuted));
    canvas.write(" Server started on :8080");
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
  protected _previewTheme: ThemeColors | null = null;

  protected getSelectedTheme(): string {
    const item = this._list.getSelectedItem();
    return item ? item.id : "";
  }

  protected updateLightModeCheckbox(): void {
    const item = this._list.getSelectedItem();
    this._lightModeCb.disabled = !item || !themeHasLightVariant(item.id);
  }

  constructor() {
    super();
    this._list = new List();
    this._preview = new ThemePreviewControl();
    this._cancelBtn = new Button({ label: "Cancel" });
    this._applyBtn = new Button({ label: "Apply" });
    this._contentRow = new Row();
    this._contentRow.flex = 1;
    this._checkboxRow = new Row();
    this._buttonRow = new Row();
    this._contentColumn = new Column();

    const listNav = this._list.handleKey.bind(this._list);
    this._list.handleKey = (key) => {
      if (key === "RETURN" || key === "ENTER" || key === "SPACE" || key === " ") return false;
      return listNav(key);
    };

    this._list.setOnHighlight((item) => {
      if (item) {
        this._preview.setTheme(item.id, this._previewMode);
        this._previewTheme = loadThemeWithMode(item.id, this._previewMode);
      }
      this.updateLightModeCheckbox();
    });

    this._list.selectedId = this._selectedTheme;

    this._lightModeCb = new Checkbox({ label: "Light mode", checked: getThemeMode() === "light" });
    this._lightModeCb.setAction((checked) => {
      this._previewMode = checked ? "light" : "dark";
      const item = this._list.getSelectedItem();
      const name = item ? item.id : this._selectedTheme;
      this._preview.setTheme(name, this._previewMode);
      this._previewTheme = loadThemeWithMode(name, this._previewMode);
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
    this._updateThemeItems();
    const allNames = getThemeNames();
    const idx = allNames.indexOf(name);
    if (idx >= 0) {
      this._list.selectedIndex = idx;
    }
    this._preview.setTheme(name, this._previewMode);
    this._previewTheme = loadThemeWithMode(name, this._previewMode);
    this.updateLightModeCheckbox();
  }

  protected _updateThemeItems(): void {
    const allNames = getThemeNames();
    this._list.items = allNames.map((n) => ({ id: n, label: n === this._selectedTheme ? `✓ ${n}` : `  ${n}` }));
    this._list.selectedId = this._selectedTheme;
  }

  measure(parentSize?: Size): Size {
    const base = super.measure(parentSize);
    return this._clampSize({ width: Math.max(base.width, 80), height: Math.max(base.height, 24) });
  }

  render(ctx: RenderContext): void {
    if (this._previewTheme) {
      const saved = { ...themeColors };
      Object.assign(themeColors, this._previewTheme);
      super.render(ctx);
      Object.assign(themeColors, saved);
    } else {
      super.render(ctx);
    }
  }

  handleKey(key: string): boolean {
    if (key === "RETURN" || key === "ENTER") {
      this._selectedTheme = this.getSelectedTheme();
      this.apply();
      return true;
    }
    if ((key === "SPACE" || key === " ") && this._list.focused) {
      this._selectedTheme = this.getSelectedTheme();
      this._updateThemeItems();
      return true;
    }
    if (key === "ESCAPE") {
      this.cancel();
      return true;
    }
    return super.handleKey(key);
  }

  protected cancel(): void {
    setActiveTheme(this._originalTheme);
    if (this._resolve) {
      this._resolve(null);
      this._resolve = null;
    }
    modalManager.close();
  }

  protected apply(): void {
    this._selectedTheme = this.getSelectedTheme() || this._selectedTheme;
    setThemeMode(this._previewMode);
    setActiveTheme(this._selectedTheme);
    if (this._resolve) {
      this._resolve(this._selectedTheme);
      this._resolve = null;
    }
    modalManager.close();
  }
}

export function createThemeSelectorModal(currentTheme: string): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = new ThemeSelectorModal();
    modal.title = "Select Theme";
    modal.setMinSize(80, 26);
    modal.setMaxSize(120, 26);
    modal.setInitialTheme(currentTheme);
    modal.setResolve(resolve);

    setActiveTheme(currentTheme);
    modalManager.open(modal);
  });
}