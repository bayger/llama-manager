import { Control } from "../Control.js";
import { fg, fgBg, themeColors } from "../../../lib/theme.js";
import type { Size } from "../types.js";

export interface ListItem<T = any> {
  id: T;
  label: string;
  sublabel?: string;
  data?: any;
}

export type ItemRenderer<T> = (term: any, item: ListItem<T>, index: number, isSelected: boolean, x: number, y: number, width: number) => void;

export class List<T = any> extends Control {
  public items: ListItem<T>[] = [];
  public selectedIndex = -1;
  public itemHeight = 1;
  protected _onSelect: ((item: ListItem<T>) => void) | null = null;
  protected _customRenderer: ItemRenderer<T> | null = null;

  measure(_parentSize?: Size): Size {
    const h = Math.max(1, this.items.length * this.itemHeight);
    return { width: this.rect.width || 40, height: h };
  }

  setOnSelect(callback: (item: ListItem<T>) => void): void {
    this._onSelect = callback;
  }

  setRenderer(renderer: ItemRenderer<T>): void {
    this._customRenderer = renderer;
  }

  updateItems(items: ListItem<T>[]): void {
    this.items = items;
    if (this.selectedIndex >= items.length) {
      this.selectedIndex = items.length - 1;
    }
    this.needsRender = true;
  }

  render(): void {
    if (!this.visible || !this.needsRender) return;
    const { term, rect } = this;
    const { x, y, width } = rect;

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i]!;
      const isSelected = i === this.selectedIndex;
      term.moveTo(x, y + i);

      if (this._customRenderer) {
        this._customRenderer(term, item, i, isSelected, x, y + i, width);
      } else {
        const label = item.label;
        const display = ` ${label}${item.sublabel ? `  ${item.sublabel}` : ""}`;

        if (isSelected) {
          term.bold();
          fgBg(term, themeColors.selectedText, themeColors.selectedBg, display.padEnd(width));
          term.styleReset();
        } else {
          fg(term, themeColors.text, display);
        }
      }
    }

    this.needsRender = false;
  }

  handleKey(key: string): boolean {
    if (this.items.length === 0) return false;

    if (key === "UP") {
      if (this.selectedIndex > 0) {
        this.selectedIndex--;
        this.needsRender = true;
      }
      return true;
    }
    if (key === "DOWN") {
      if (this.selectedIndex < this.items.length - 1) {
        this.selectedIndex++;
        this.needsRender = true;
      }
      return true;
    }
    if (key === "RETURN" || key === "SPACE") {
      if (this.selectedIndex >= 0 && this._onSelect) {
        this._onSelect(this.items[this.selectedIndex]!);
      }
      return true;
    }
    return false;
  }

  onFocus(): void {
    super.onFocus();
    if (this.selectedIndex < 0 && this.items.length > 0) {
      this.selectedIndex = 0;
      this.needsRender = true;
    }
  }

  getSelectedItem(): ListItem<T> | null {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.items.length) {
      return this.items[this.selectedIndex]!;
    }
    return null;
  }
}
