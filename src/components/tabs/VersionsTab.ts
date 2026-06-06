import { Control } from "../ui/Control.js";
import { Column, Row } from "../ui/Layout.js";
import { Button } from "../ui/widgets/Button.js";
import { Divider } from "../ui/widgets/Divider.js";
import { List, ListItem } from "../ui/widgets/List.js";
import { themeColors, fg, fgBg } from "../../lib/theme.js";
import { listVersions, uninstallVersion, switchVersion, getTotalVersionsSize, VersionInfo, BACKEND_LABELS } from "../../lib/versions.js";
import { saveConfig } from "../../lib/config.js";
import { fireAsync } from "../../lib/utils.js";
import type { TabContext } from "../../lib/tabcontext.js";
import type { Size } from "../ui/types.js";

class VersionsHeader extends Control {
  protected _count = 0;
  protected _sizeStr = "0 B";

  measure(parentSize?: Size): Size {
    return { width: parentSize?.width ?? this.rect.width, height: 1 };
  }

  update(count: number, sizeStr: string): void {
    this._count = count;
    this._sizeStr = sizeStr;
    this.needsRender = true;
  }

  render(): void {
    if (!this.visible || !this.needsRender) return;
    const term = this.term;
    const { x, y, width } = this.rect;

    term.moveTo(x, y);
    fg(term, themeColors.text, ` Versions: ${this._count}`);
    fg(term, themeColors.textMuted, `  Size: ${this._sizeStr}`);

    const endX = (term as any).cursorX ?? x;
    const padLen = width - (endX - x);
    if (padLen > 0) {
      fg(term, themeColors.canvas, " ".repeat(padLen));
    }

    this.needsRender = false;
  }
}

export class VersionsControl extends Control {
  protected _ctx: TabContext | null = null;
  protected _column: Column;
  protected _header: VersionsHeader;
  protected _buttonRow: Row;
  protected _btnInstall: Button;
  protected _btnDelete: Button;
  protected _list: List<string>;
  protected _attached = false;

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;

    this._header = new VersionsHeader();
    this._list = new List();
    this._list.focusable = true;
    this._list.tabIndex = 0;
    this._list.setRenderer((term, item, _index, isSelected, _x, rowY, width) => {
      const v = (item as any).data as VersionInfo;
      const prefix = v.active ? "● " : "  ";
      const line = ` ${prefix}${v.version}  ${BACKEND_LABELS[v.backend] || v.backend}`;

      if (isSelected) {
        fgBg(term, themeColors.accent, themeColors.canvas, line.padEnd(width));
        term.styleReset();
      } else {
        term.moveTo(_x, rowY);
        fg(term, v.active ? themeColors.success : themeColors.text, line);
      }
    });

    this._btnInstall = new Button({ label: "Install" });
    this._btnDelete = new Button({ label: "Delete" });
    this._buttonRow = new Row();
    this._buttonRow.add(this._btnInstall);
    this._buttonRow.add(this._btnDelete);

    this._column = new Column();
    this._column.add(this._header);
    this._column.add(new Divider());
    this._column.add(this._buttonRow);
    this._column.add(new Divider());
    this._column.add(this._list);
    this._list.flex = 1;

    this.add(this._column);
  }

  measure(parentSize?: Size): Size {
    return parentSize ? { width: parentSize.width, height: parentSize.height } : super.measure(parentSize);
  }

  onAttach(): void {
    if (!this._ctx || this._attached) return;
    this._attached = true;
    const ctx = this._ctx;

    this._btnInstall.setAction(() => {
      fireAsync(async () => {
        // Install flow — placeholder for now
      }, ctx);
      this.markDirty();
      ctx.scheduleRender();
    });

    this._btnDelete.setAction(() => {
      const selected = this._list.getSelectedItem();
      if (!selected) return;

      fireAsync(async () => {
        const config = ctx.getConfig();
        if (!config) throw new Error("No config loaded");
        await uninstallVersion(config, selected.data.version);
        await this.refresh();
      }, ctx);
    });

    this._list.setOnSelect((item) => {
      fireAsync(async () => {
        const config = ctx.getConfig();
        if (!config) throw new Error("No config loaded");
        await switchVersion(config, item.data.version);
        await saveConfig(config);
        ctx.setConfig(config);
        await this.refresh();
      }, ctx);
    });

    this.refresh();
  }

  onDetach(): void {
    this._attached = false;
    this._ctx = null;
  }

  onFocus(): void {
    super.onFocus();
    if (this._list.items.length > 0) {
      this._list.focus();
    }
  }

  protected async refresh(): Promise<void> {
    try {
      const ctx = this._ctx;
      if (!ctx) return;
      const config = ctx.getConfig();
      if (!config) return;

      const versions = await listVersions(config);
      const totalSize = await getTotalVersionsSize(config);

      this._header.update(versions.length, formatSize(totalSize));

      const items: ListItem<string>[] = versions.map(v => ({
        id: v.version,
        label: v.version,
        sublabel: BACKEND_LABELS[v.backend] || v.backend,
        data: v,
      }));

      this._list.updateItems(items);

      if (config.activeVersion) {
        const activeIdx = items.findIndex(i => i.data.active);
        if (activeIdx >= 0) {
          this._list.selectedIndex = activeIdx;
        }
      }

      const sel = this._list.getSelectedItem();
      this._btnDelete.disabled = !sel || sel.data.active;

      this.markDirty();
    } catch (err: any) {
      // ignore
    }
  }

  override markDirty(): void {
    super.markDirty();
    this._ctx?.scheduleRender();
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function createVersionsTab(ctx: TabContext): Control {
  return new VersionsControl(ctx);
}
