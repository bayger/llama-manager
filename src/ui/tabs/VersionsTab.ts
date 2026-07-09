import { Control } from "../../framework/Control";
import { Column, Row } from "../../framework/Layout";
import { Button } from "../../framework/widgets/Button";
import { Spacer } from "../../framework/widgets/Spacer";
import { Table, TableItem } from "../../framework/widgets/Table";
import { Scrollable } from "../../framework/widgets/Scrollable";
import { Section } from "../../framework/widgets/Section";
import { fg } from "../../lib/theme";
import { StyledText } from "../../framework/widgets/StyledText";
import { focusManager } from "../../framework/FocusManager";
import {
  listVersions,
  uninstallVersion,
  switchVersion,
  getTotalVersionsSize,
  listRecentVersions,
  installVersion,
  VersionInfo,
  RemoteVersion,
  AvailableBackend,
  BACKEND_LABELS,
  getAvailableBackends,
  getPlatformKey,
  getArchKey,
} from "../../lib/versions";
import { saveConfig } from "../../lib/config";
import { fireAsync, formatSize, formatDate } from "../../lib/utils";
import { createDownloadDialog } from "../../framework/widgets/DownloadDialog";
import { createConfirmDialog } from "../../framework/widgets/ConfirmDialog";
import { getInstallableForks, getFork } from "../../lib/forks";
import type { TabContext } from "../../lib/tabcontext";
import type { Size, RenderContext } from "../../framework/types";

type ViewMode = "local" | "releases" | "backends" | "installing";

class ChangelogView extends Scrollable {
  protected _lines: string[] = [];

  measure(parentSize?: Size): Size {
    return { width: parentSize?.width ?? this.rect.width, height: parentSize?.height ?? this._lines.length };
  }

  onLayout(): void {
    super.onLayout();
    this.setContentHeight(this._lines.length);
  }

  update(body: string): void {
    this._lines = stripMarkdown(body);
    this.setContentHeight(this._lines.length);
    this.scrollOffset = 0;
    this.markDirty();
  }

  clear(): void {
    this._lines = [];
    this.setContentHeight(0);
    this.scrollOffset = 0;
    this.markDirty();
  }

  draw(ctx: RenderContext): void {
    const canvas = ctx.canvas;
    const { x, y } = this.rect;
    const height = this.rect.height;
    const cw = this.contentWidth;

    for (let i = 0; i < height; i++) {
      const lineIdx = i + this.scrollOffset;
      canvas.moveTo(x, y + i);
      if (lineIdx < this._lines.length) {
        const line = this._lines[lineIdx] || "";
        const display = line.padEnd(cw).substring(0, cw);
        fg(canvas, "textMuted", display);
      }
    }

    if (this.needsScrollbar) {
      this.drawScrollbar(canvas, x + cw, y, this._scrollbarWidth, height);
    }
  }
}

export class VersionsControl extends Control {
  protected _ctx: TabContext | null = null;
  protected _column: Column;
  protected _dividerButtons: Spacer;
  protected _buttonRow: Row;
  protected _btnInstall: Button;
  protected _btnDelete: Button;
  protected _btnBack: Button;
  protected _contentRow: Row;
  protected _versionsSection: Section;
  protected _table: Table<VersionInfo | RemoteVersion | AvailableBackend>;
  protected _changelogSection: Section;
  protected _changelog: ChangelogView;
  protected _summary: StyledText;

  protected _mode: ViewMode = "local";
  protected _selectedRelease: RemoteVersion | null = null;
  protected _availableBackends: AvailableBackend[] = [];
  protected _selectedFork: string = "llama.cpp";
  protected _forkButton: Button;

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;

    this._summary = new StyledText();
    this._summary.flex = 1;

    this._table = new Table();
    this._table.showHeader = true;
    this._table.flex = 1;
    this._table.columns = [
      {
        label: "Tag",
        width: 14,
        flex: 1,
        align: "left",
        format: (_v, row: VersionInfo | RemoteVersion | AvailableBackend) => {
          if ("active" in row) {
            return row.active ? `✓ ${row.tag}` : `  ${row.tag}`;
          }
          if ("tag" in row) {
            return row.tag;
          }
          return row.label;
        },
      },
      {
        label: "Backend",
        width: 12,
        align: "left",
        format: (_v, row: VersionInfo | RemoteVersion | AvailableBackend) => {
          if ("active" in row) {
            return BACKEND_LABELS[row.backend] || row.backend;
          }
          if ("publishedAt" in row) {
            return "-";
          }
          return row.assetName;
        },
      },
      {
        label: "Fork",
        width: 12,
        align: "left",
        format: (_v, row: VersionInfo | RemoteVersion | AvailableBackend) => {
          if ("active" in row) {
            return getFork(row.fork).label;
          }
          return "-";
        },
      },
      {
        label: "Date",
        width: 10,
        align: "right",
        format: (_v, row: VersionInfo | RemoteVersion | AvailableBackend) => {
          if ("active" in row) {
            return formatDate(new Date(row.createdAt).toISOString());
          }
          if ("publishedAt" in row) {
            return row.publishedAt ? formatDate(row.publishedAt) : "-";
          }
          return "-";
        },
      },
    ];

    this._versionsSection = new Section();
    this._versionsSection.title = "Installed Versions";
    this._versionsSection.add(this._table);

    this._changelog = new ChangelogView();
    this._changelogSection = new Section();
    this._changelogSection.title = "Changelog";
    this._changelogSection.visible = false;
    this._changelogSection.add(this._changelog);
    this._changelog.flex = 1;

    this._btnInstall = new Button({ label: "Install" });
    this._btnDelete = new Button({ label: "Delete" });
    this._btnBack = new Button({ label: "Back" });
    this._btnBack.visible = false;

    this._forkButton = new Button({ label: "llama.cpp" });
    this._forkButton.visible = false;

    this._buttonRow = new Row();
    this._buttonRow.add(this._btnBack);
    this._buttonRow.add(this._forkButton);
    this._buttonRow.add(this._summary);
    this._dividerButtons = new Spacer();
    this._dividerButtons.flex = 1;
    this._buttonRow.add(this._dividerButtons);
    this._buttonRow.add(this._btnInstall);
    this._buttonRow.add(this._btnDelete);

    this._contentRow = new Row();
    this._contentRow.add(this._versionsSection);
    this._versionsSection.flex = 1;
    this._contentRow.add(this._changelogSection);
    this._changelogSection.flex = 1;

    this._column = new Column();
    this._column.add(this._buttonRow);
    this._column.add(new Spacer());
    this._column.add(this._contentRow);
    this._contentRow.flex = 1;

    this.add(this._column);
  }

  measure(parentSize?: Size): Size {
    return parentSize ? { width: parentSize.width, height: parentSize.height } : super.measure(parentSize);
  }

  onInit(): void {
    if (!this._ctx) return;
    const ctx = this._ctx;
    const config = ctx.getConfig();
    if (config?.defaultFork) {
      this._selectedFork = config.defaultFork;
    }

    this._btnInstall.setAction(() => {
      fireAsync(async () => {
        await this.showReleases();
      }, ctx);
    });

    this._forkButton.setAction(() => {
      fireAsync(async () => {
        await this.cycleFork();
      }, ctx);
    });

    this._btnBack.setAction(() => {
      fireAsync(async () => {
        await this.goBack();
      }, ctx);
    });

    this._btnDelete.setAction(() => {
      fireAsync(async () => {
        const selected = this._table.getSelectedItem();
        if (!selected) return;
        const config = ctx.getConfig();
        if (!config) throw new Error("No config loaded");
        const version = (selected.data as VersionInfo).version;
        const confirmed = await ctx.openModal<boolean>(createConfirmDialog(
          "Delete Version",
          `Delete ${version}? This will remove all files for this version.`
        ));
        if (!confirmed) return;
        await uninstallVersion(config, version);
        ctx.showMessage(`Deleted ${version}`);
        if (this._mode === "local") await this.refreshLocal();
      }, ctx);
    });

    this._table.setOnSelect((item) => {
      fireAsync(async () => {
        if (this._mode === "local") {
          const config = ctx.getConfig();
          if (!config) throw new Error("No config loaded");
          await switchVersion(config, (item.data as VersionInfo).version);
          await saveConfig(config);
          ctx.setConfig(config);
          await this.refreshLocal();
        } else if (this._mode === "releases") {
          this._selectedRelease = item.data as RemoteVersion;
          await this.showBackends(item.data as RemoteVersion);
        } else if (this._mode === "backends") {
          const backend = item.data as AvailableBackend;
          await this.install(backend.id);
        }
      }, ctx);
    });

    const tableHandleKey = this._table.handleKey.bind(this._table);
    this._table.handleKey = (key: string) => {
      if (key === "g" && !focusManager.isTextInputActive()) {
        fireAsync(async () => {
          await this.goBack();
        }, ctx);
        return true;
      }
      return tableHandleKey(key);
    };

    this.refreshLocal();
  }

  onDestroy(): void {
    this._ctx = null;
  }

  handleKey(key: string): boolean {
    if (this._mode !== "local" && key === "ESC") {
      fireAsync(async () => {
        await this.goBack();
      }, this._ctx!);
      return true;
    }
    return super.handleKey(key);
  }

  onFocus(): void {
    super.onFocus();
    if (this._table.items.length > 0) {
      focusManager.setFocus(this._table);
    } else if (this._mode === "local") {
      focusManager.setFocus(this._btnInstall);
    }
  }

  async goBack(): Promise<void> {
    if (this._mode === "backends") {
      await this.showReleases();
    } else if (this._mode === "releases") {
      await this.showLocal();
    }
  }

  async cycleFork(): Promise<void> {
    const forks = getInstallableForks();
    const currentIdx = forks.findIndex(f => f.id === this._selectedFork);
    const nextIdx = (currentIdx + 1) % forks.length;
    this._selectedFork = forks[nextIdx]!.id;
    this._forkButton.label = forks[nextIdx]!.label;

    if (this._ctx) {
      const config = this._ctx.getConfig();
      if (config) {
        config.defaultFork = this._selectedFork;
        saveConfig(config);
        this._ctx.setConfig(config);
      }
    }

    this.markDirty();
    await this.showReleases();
  }

  async showLocal(): Promise<void> {
    this._mode = "local";
    this._dividerButtons.visible = true;
    this._buttonRow.visible = true;
    this._versionsSection.title = "Installed Versions";
    this._changelogSection.visible = false;
    this._btnBack.visible = false;
    this._forkButton.visible = false;
    this._btnInstall.visible = true;
    this._btnInstall.label = "Install";
    this._btnDelete.visible = true;
    await this.refreshLocal();
  }

  async showReleases(): Promise<void> {
    const ctx = this._ctx;
    if (!ctx) return;

    this._mode = "releases";
    this._dividerButtons.visible = true;
    this._buttonRow.visible = true;
    this._versionsSection.title = "Select version";
    this._btnBack.visible = true;
    this._btnInstall.visible = false;
    this._btnDelete.visible = false;
    this._changelogSection.visible = true;
    this._forkButton.visible = true;
    this._forkButton.label = getFork(this._selectedFork).label;
    this._table.selectedIndex = -1;
    this._table.updateItems([]);
    this._summary.builder.muted("GitHub Releases");
    this.markDirty();

    try {
      const releases = await listRecentVersions(this._selectedFork, 30);
      const items: TableItem<RemoteVersion>[] = releases.map(r => ({
        id: r.tag,
        label: r.tag,
        data: r,
      }));

      this._table.setOnHighlight((item) => {
        if (item) {
          this._changelog.update((item.data as RemoteVersion).body || "");
        } else {
          this._changelog.clear();
        }
      });
      this._table.updateItems(items);
      this._summary.builder
        .muted("Releases")
        .accentColor(` ${items.length}`);
      focusManager.setFocus(this._table);
      this.markDirty();
    } catch (err: any) {
      ctx.showMessage(`Failed to fetch releases: ${err.message}`);
      await this.showLocal();
    }
  }

  async showBackends(release: RemoteVersion): Promise<void> {
    const ctx = this._ctx;
    if (!ctx) return;

    this._mode = "backends";
    this._dividerButtons.visible = true;
    this._buttonRow.visible = true;
    this._versionsSection.title = "Select backend";
    this._changelogSection.visible = false;
    this._btnBack.visible = true;
    this._btnInstall.visible = false;
    this._btnDelete.visible = false;
    this._table.selectedIndex = -1;
    this._table.updateItems([]);
    this.markDirty();

    try {
      const platform = getPlatformKey();
      const backends = getAvailableBackends(release.tag, platform, release.assets, this._selectedFork);
      this._availableBackends = backends;

      if (backends.length === 0) {
        ctx.showMessage(`No compatible builds for ${getPlatformKey()}-${getArchKey()} found for ${release.tag}`);
        await this.showReleases();
        return;
      }

      const items: TableItem<AvailableBackend>[] = backends.map(b => ({
        id: b.id,
        label: b.label,
        data: b,
      }));

      this._table.updateItems(items);
      this._summary.builder.muted(`Backends for ${release.tag}`);
      focusManager.setFocus(this._table);
      this.markDirty();
    } catch (err: any) {
      ctx.showMessage(`Error: ${err.message}`);
      await this.showReleases();
    }
  }

  async install(backendId: string): Promise<void> {
    const ctx = this._ctx;
    if (!ctx || !this._selectedRelease) return;

    const config = ctx.getConfig();
    if (!config) return;

    const dialog = createDownloadDialog(`${this._selectedRelease.tag} (${backendId})`, "Preparing...");
    const handle = dialog.getHandle();
    ctx.openModal(dialog);

    try {
      const installed = await installVersion(
        config,
        this._selectedFork,
        this._selectedRelease.tag,
        backendId,
        (pct: number, label: string) => {
          handle.update(pct, label);
        },
      );

      handle.update(100, "Installation complete!");
      setTimeout(() => handle.close(), 500);
      await handle.promise;
      ctx.showMessage(`Installed ${installed}`);
      await this.showLocal();
    } catch (err: any) {
      handle.close();
      throw err;
    }
  }

  async refreshLocal(): Promise<void> {
    try {
      const ctx = this._ctx;
      if (!ctx) return;
      const config = ctx.getConfig();
      if (!config) return;

      const versions = (await listVersions(config)).sort((a, b) => b.version.localeCompare(a.version));
      const totalSize = await getTotalVersionsSize(config);

      this._summary.builder
        .muted("Versions ")
        .accentColor(String(versions.length))
        .muted("  Size ")
        .text(formatSize(totalSize));

      const items: TableItem<VersionInfo>[] = versions.map(v => ({
        id: v.version,
        label: v.version,
        data: v,
      }));

      this._table.selectedId = config.activeVersion || null;
      this._table.updateItems(items);

      if (config.activeVersion) {
        const activeIdx = items.findIndex(i => (i.data as VersionInfo).active);
        if (activeIdx >= 0) {
          this._table.selectedIndex = activeIdx;
        }
      }

      const sel = this._table.getSelectedItem();
      this._btnDelete.disabled = !sel || !(sel.data as VersionInfo).active;
      this.markDirty();
    } catch (err: any) {
      // ignore
    }
  }

}

function stripMarkdown(md: string): string[] {
  return md
    .replace(/```[\s\S]*?```/g, "") // remove code blocks
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
    .replace(/\*([^*]+)\*/g, "$1") // italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/^#{1,6}\s+/gm, "") // headings
    .replace(/^- /gm, "  ") // unordered lists
    .replace(/^>\s+/gm, "  ") // blockquotes
    .split("\n")
    .map(l => l.trimEnd());
}

export function createVersionsTab(ctx: TabContext): Control {
  return new VersionsControl(ctx);
}
