import { Modal } from "./Modal";
import { Control } from "../Control";
import { modalManager } from "../ModalManager";
import { getThemeNames, loadTheme, setActiveTheme } from "../../../lib/theme";
import type { Color, ThemeColors } from "../../../lib/theme";
import type { Point, RenderContext, Size } from "../types";

const tc = (c: string): Color => c as Color;

const V = "\u2502";
const H = "\u2500";
const HALF_BLOCK = "\u2584";
const FULL_BLOCK = "\u2588";

class ThemeListControl extends Control {
  focusable = true;
  protected _index = 0;
  protected _scroll = 0;
  protected _onChange: ((index: number) => void) | null = null;

  setOnChange(callback: (index: number) => void): void {
    this._onChange = callback;
  }

  setState(index: number, scroll: number): void {
    this._index = index;
    this._scroll = scroll;
    this.markDirty();
  }

  getIndex(): number {
    return this._index;
  }

  moveUp(): boolean {
    if (this._index > 0) {
      this._index--;
      if (this._index < this._scroll) this._scroll = this._index;
      this._onChange?.(this._index);
      this.markDirty();
      return true;
    }
    return false;
  }

  moveDown(): boolean {
    const names = getThemeNames();
    if (this._index < names.length - 1) {
      this._index++;
      const bottom = this._scroll + this.rect.height;
      if (this._index >= bottom) this._scroll = this._index - this.rect.height + 1;
      this._onChange?.(this._index);
      this.markDirty();
      return true;
    }
    return false;
  }

  pageUp(): void {
    const names = getThemeNames();
    this._index = Math.max(0, this._index - this.rect.height);
    this._scroll = Math.max(0, this._scroll - this.rect.height);
    this._onChange?.(this._index);
    this.markDirty();
  }

  pageDown(): void {
    const names = getThemeNames();
    this._index = Math.min(names.length - 1, this._index + this.rect.height);
    this._scroll = Math.max(0, names.length - this.rect.height);
    this._onChange?.(this._index);
    this.markDirty();
  }

  home(): void {
    this._index = 0;
    this._scroll = 0;
    this._onChange?.(this._index);
    this.markDirty();
  }

  end(): void {
    const names = getThemeNames();
    this._index = names.length - 1;
    this._scroll = Math.max(0, names.length - this.rect.height);
    this._onChange?.(this._index);
    this.markDirty();
  }

  measure(_parentSize?: Size): Size {
    return { width: 28, height: this.rect.height || 16 };
  }

  draw(ctx: RenderContext): void {
    const { canvas } = ctx;
    const { x, y, width, height } = this.rect;
    const names = getThemeNames();

    canvas.moveTo(x, y);
    canvas.bold();
    canvas.setForegroundColor("accent");
    canvas.write(`${V} THEMES`);
    for (let col = 8; col < width; col++) {
      canvas.write(" ");
    }

    for (let row = 1; row < height; row++) {
      canvas.moveTo(x, y + row);
      canvas.setForegroundColor("borderMuted");
      canvas.write(V);

      const themeIdx = row + this._scroll;
      if (themeIdx >= names.length) {
        canvas.moveTo(x + 1, y + row);
        canvas.setForegroundColor("textMuted");
        for (let col = 1; col < width - 1; col++) canvas.write(" ");
        continue;
      }

      canvas.moveTo(x + 1, y + row);
      const name = names[themeIdx]!;
      const isSelected = themeIdx === this._index;
      const resolved = loadTheme(name);

      if (isSelected) {
        canvas.setForegroundColor("accent");
        canvas.write(">");
        if (resolved) {
          this.drawSwatch(canvas, resolved, "canvas", "text");
          this.drawSwatch(canvas, resolved, "text", "canvas");
          this.drawSwatch(canvas, resolved, "accent", "canvas");
          this.drawSwatch(canvas, resolved, "success", "canvas");
          this.drawSwatch(canvas, resolved, "danger", "canvas");
        } else {
          for (let i = 0; i < 5; i++) canvas.write(" ");
        }
        canvas.setForegroundColor("accentColor");
        const remaining = width - 1 - 1 - 5;
        const displayName = name.substring(0, remaining);
        canvas.write(displayName);
        for (let col = displayName.length; col < remaining; col++) canvas.write(" ");
      } else {
        canvas.setForegroundColor("textMuted");
        canvas.write(" ");
        if (resolved) {
          this.drawSwatchMuted(canvas, resolved, "canvas", "text");
          this.drawSwatchMuted(canvas, resolved, "text", "canvas");
          this.drawSwatchMuted(canvas, resolved, "accent", "canvas");
          this.drawSwatchMuted(canvas, resolved, "success", "canvas");
          this.drawSwatchMuted(canvas, resolved, "danger", "canvas");
        } else {
          for (let i = 0; i < 5; i++) canvas.write(" ");
        }
        const remaining = width - 1 - 1 - 5;
        const displayName = name.substring(0, remaining);
        canvas.write(displayName);
        for (let col = displayName.length; col < remaining; col++) canvas.write(" ");
      }
    }
  }

  protected drawSwatch(canvas: NonNullable<RenderContext["canvas"]>, t: ThemeColors, fgRole: keyof ThemeColors, bgRole: keyof ThemeColors): void {
    canvas.setForegroundColor(tc(t[bgRole]));
    canvas.setBackgroundColor(tc(t[fgRole]));
    canvas.write(FULL_BLOCK);
  }

  protected drawSwatchMuted(canvas: NonNullable<RenderContext["canvas"]>, t: ThemeColors, fgRole: keyof ThemeColors, bgRole: keyof ThemeColors): void {
    canvas.setForegroundColor(tc(t[bgRole]));
    canvas.setBackgroundColor(tc(t[fgRole]));
    canvas.write(FULL_BLOCK);
  }

  onMouseDown(point: Point): boolean {
    const { x, y, height } = this.rect;
    if (point.x < x || point.x >= x + this.rect.width || point.y < y || point.y >= y + height) return false;
    const names = getThemeNames();
    const row = point.y - y;
    if (row === 0) return true;
    const idx = row - 1 + this._scroll;
    if (idx >= 0 && idx < names.length) {
      this._index = idx;
      this._onChange?.(this._index);
      this.markDirty();
    }
    return true;
  }
}

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

    // Color palette row
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
    const btn1 = " [ Start ] ";
    canvas.setForegroundColor(tc(t.canvas));
    canvas.setBackgroundColor(tc(t.accent));
    canvas.bold();
    canvas.write(btn1);
    canvas.bold(false);
    canvas.setBackgroundColor(tc(t.canvas));
    canvas.write(" ");
    const btn2 = "[ Stop ]";
    canvas.setForegroundColor(tc(t.textMuted));
    canvas.setBackgroundColor(tc(t.canvasSubtle));
    canvas.write(btn2);
    canvas.setBackgroundColor(tc(t.canvas));
    canvas.write(" ");
    const btn3 = "[ Kill ]";
    canvas.setForegroundColor(tc(t.canvas));
    canvas.setBackgroundColor(tc(t.danger));
    canvas.bold();
    canvas.write(btn3);
    canvas.bold(false);
    canvas.setBackgroundColor(tc(t.canvas));
    row++;

    if (row >= availableRows) return;

    // Labels and status
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

    // Checkbox line
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
    row++;
  }
}

export class ThemeSelectorModal extends Modal {
  protected _list: ThemeListControl;
  protected _preview: ThemePreviewControl;
  protected _resolve: ((value: string | null) => void) | null = null;
  protected _originalTheme = "";

  constructor() {
    super();
    this._list = new ThemeListControl();
    this._preview = new ThemePreviewControl();

    this._list.setOnChange((index) => {
      const names = getThemeNames();
      const name = names[index];
      if (name) {
        this._preview.setTheme(name);
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
    const names = getThemeNames();
    const idx = names.indexOf(name);
    if (idx >= 0) {
      this._list.setState(idx, 0);
      this._preview.setTheme(name);
    }
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
      if (this._list.moveUp()) return true;
    }
    if (key === "DOWN" || key === "j") {
      if (this._list.moveDown()) return true;
    }
    if (key === "PAGE_UP") {
      this._list.pageUp();
      return true;
    }
    if (key === "PAGE_DOWN") {
      this._list.pageDown();
      return true;
    }
    if (key === "HOME") {
      this._list.home();
      return true;
    }
    if (key === "END") {
      this._list.end();
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

    const names = getThemeNames();
    const idx = names.indexOf(currentTheme);
    if (idx >= 0) {
      setActiveTheme(currentTheme);
    }

    modalManager.open(modal);
  });
}