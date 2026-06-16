import { Control } from "../ui/Control";
import type { FramebufferCanvas } from "../../lib/framebuffer-canvas";
import { Column, Row } from "../ui/Layout";
import { Button } from "../ui/widgets/Button";
import { Spacer } from "../ui/widgets/Spacer";
import { List, ListItem } from "../ui/widgets/List";
import { ProgressBar } from "../ui/widgets/ProgressBar";
import { Scrollable } from "../ui/widgets/Scrollable";
import { Section } from "../ui/widgets/Section";
import { fg, fgBg } from "../../lib/theme";
import { StyledText } from "../ui/widgets/StyledText";
import { focusManager } from "../ui/FocusManager";
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
} from "../../lib/versions";
import { saveConfig } from "../../lib/config";
import { fireAsync } from "../../lib/utils";
import type { TabContext } from "../../lib/tabcontext";
import type { Size, RenderContext } from "../ui/types";

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
    const { x, y, width, height } = this.rect;

    for (let i = 0; i < height; i++) {
      const lineIdx = i + this.scrollOffset;
      canvas.moveTo(x, y + i);
      if (lineIdx < this._lines.length) {
        const line = this._lines[lineIdx] || "";
        const display = line.padEnd(width).substring(0, width);
        fg(canvas, "textMuted", display);
      }
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
  protected _contentRow: Row;
  protected _versionsSection: Section;
  protected _list: List<string, VersionInfo | RemoteVersion | AvailableBackend>;
  protected _changelogSection: Section;
  protected _changelog: ChangelogView;
  protected _progressBar: ProgressBar;
  protected _summary: StyledText;
  protected _prompt: StyledText;

  protected _mode: ViewMode = "local";
  protected _selectedRelease: RemoteVersion | null = null;
  protected _availableBackends: AvailableBackend[] = [];

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;

    this._summary = new StyledText();
    this._prompt = new StyledText();
    this._prompt.visible = false;

    this._list = new List();
    this._list.tabIndex = 0;

    this._versionsSection = new Section();
    this._versionsSection.title = "Installed Versions";
    this._versionsSection.add(this._list);

    this._changelog = new ChangelogView();
    this._changelogSection = new Section();
    this._changelogSection.title = "Changelog";
    this._changelogSection.visible = false;
    this._changelogSection.add(this._changelog);
    this._changelog.flex = 1;

    this._btnInstall = new Button({ label: "Install" });
    this._btnDelete = new Button({ label: "Delete" });
    this._buttonRow = new Row();
    this._buttonRow.add(this._btnInstall);
    this._buttonRow.add(this._btnDelete);

    this._progressBar = new ProgressBar();
    this._progressBar.visible = false;
    this._progressBar.filledColor = "accent";
    this._progressBar.emptyColor = "border";
    this._progressBar.labelColor = "textMuted";

    this._dividerButtons = new Spacer();

    this._contentRow = new Row();
    this._contentRow.add(this._versionsSection);
    this._versionsSection.flex = 1;
    this._contentRow.add(this._changelogSection);
    this._changelogSection.flex = 1;

    this._column = new Column();
    this._buttonRow.add(this._summary);
    this._column.add(this._prompt);
    //this._column.add(this._dividerButtons);
    this._column.add(this._buttonRow);
    //this._column.add(new Spacer());
    this._column.add(this._contentRow);
    this._contentRow.flex = 1;
    this._column.add(this._progressBar);

    this.add(this._column);
  }

  measure(parentSize?: Size): Size {
    return parentSize ? { width: parentSize.width, height: parentSize.height } : super.measure(parentSize);
  }

  onInit(): void {
    if (!this._ctx) return;
    const ctx = this._ctx;

    this._btnInstall.setAction(() => {
      fireAsync(async () => {
        await this.showReleases();
      }, ctx);
    });

    this._btnDelete.setAction(() => {
      fireAsync(async () => {
        const selected = this._list.getSelectedItem();
        if (!selected) return;
        const config = ctx.getConfig();
        if (!config) throw new Error("No config loaded");
        await uninstallVersion(config, (selected.data as VersionInfo).version);
        if (this._mode === "local") await this.refreshLocal();
      }, ctx);
    });

    this._list.setOnSelect((item) => {
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

    this._list.handleKey = (key: string) => {
      if (key === "g" && !focusManager.isTextInputActive()) {
        fireAsync(async () => {
          await this.showLocal();
        }, ctx);
        return true;
      }
      return List.prototype.handleKey.call(this._list, key);
    };

    this.refreshLocal();
  }

  onDestroy(): void {
    this._ctx = null;
  }

  onFocus(): void {
    super.onFocus();
    if (this._list.items.length > 0) {
      focusManager.setFocus(this._list);
    } else if (this._mode === "local") {
      focusManager.setFocus(this._btnInstall);
    }
  }

  async showLocal(): Promise<void> {
    this._mode = "local";
    this._dividerButtons.visible = true;
    this._buttonRow.visible = true;
    this._prompt.visible = false;
    this._changelogSection.visible = false;
    this._btnInstall.visible = true;
    this._btnInstall.label = "Install";
    this._btnDelete.visible = true;
    this._progressBar.visible = false;
    this._list.setRenderer(this._localRenderer.bind(this));
    this._list.handleKey = (key: string) => {
      if (key === "g" && !focusManager.isTextInputActive()) {
        fireAsync(async () => { await this.showLocal(); }, this._ctx!);
        return true;
      }
      return List.prototype.handleKey.call(this._list, key);
    };
    await this.refreshLocal();
  }

  async showReleases(): Promise<void> {
    const ctx = this._ctx;
    if (!ctx) return;

    this._mode = "releases";
    this._dividerButtons.visible = true;
    this._buttonRow.visible = false;
    this._prompt.visible = true;
    this._prompt.builder.warning("Select version");
    this._btnInstall.visible = false;
    this._btnDelete.visible = false;
    this._progressBar.visible = false;
    this._changelogSection.visible = true;
    this._list.selectedIndex = -1;
    this._list.items = [];
    this._summary.builder.muted("GitHub Releases (press g for local)");
    this.markDirty();

    try {
      const releases = await listRecentVersions(30);
      const items: ListItem<string, RemoteVersion>[] = releases.map(r => ({
        id: r.tag,
        label: r.tag,
        sublabel: r.publishedAt ? r.publishedAt.substring(0, 10) : "",
        data: r,
      }));

      this._list.setRenderer(this._releaseRenderer.bind(this));
      this._list.setOnHighlight((item) => {
        if (item) {
          this._changelog.update((item.data as RemoteVersion).body || "");
        } else {
          this._changelog.clear();
        }
      });
      this._list.updateItems(items);
      this._summary.builder
        .muted("Releases")
        .accentColor(` ${items.length}`)
        .muted("  (press g for local)");
      focusManager.setFocus(this._list);
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
    this._buttonRow.visible = false;
    this._prompt.visible = true;
    this._prompt.builder.warning("Select backend");
    this._changelogSection.visible = false;
    this._btnInstall.visible = false;
    this._btnDelete.visible = false;
    this._progressBar.visible = false;
    this._list.selectedIndex = -1;
    this._list.items = [];
    this.markDirty();

    try {
      const platform = getPlatformKey();
      const backends = getAvailableBackends(release.tag, platform, release.assets);
      this._availableBackends = backends;

      if (backends.length === 0) {
        ctx.showMessage(`No compatible builds for ${platform}`);
        await this.showReleases();
        return;
      }

      const items: ListItem<string, AvailableBackend>[] = backends.map(b => ({
        id: b.id,
        label: b.label,
        sublabel: b.assetName,
        data: b,
      }));

      this._list.setRenderer(this._backendRenderer.bind(this));
      this._list.updateItems(items);
      this._summary.builder.muted(`Backends for ${release.tag}  (press g for releases)`);
      focusManager.setFocus(this._list);
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

    this._mode = "installing";
    this._dividerButtons.visible = false;
    this._buttonRow.visible = false;
    this._prompt.visible = false;
    this._changelogSection.visible = false;
    this._btnInstall.visible = false;
    this._btnDelete.visible = false;
    this._list.items = [];
    this._progressBar.visible = true;
    this._progressBar.progress = 0;
    this._progressBar.label = "Preparing...";
    this._progressBar.extraLabel = "";
    this._summary.builder.muted(`Installing ${this._selectedRelease.tag} (${backendId})`);
    this.markDirty();

    try {
      const installed = await installVersion(
        config,
        this._selectedRelease.tag,
        backendId,
        (pct, label) => {
          this._progressBar.progress = pct;
          this._progressBar.label = label;
          this.markDirty();
        },
      );

      ctx.showMessage(`Installed ${installed}`);
      await this.showLocal();
    } catch (err: any) {
      ctx.showMessage(`Install failed: ${err.message}`);
      this._progressBar.visible = false;
      await this.showBackends(this._selectedRelease);
    }
  }

  async refreshLocal(): Promise<void> {
    try {
      const ctx = this._ctx;
      if (!ctx) return;
      const config = ctx.getConfig();
      if (!config) return;

      const versions = await listVersions(config);
      const totalSize = await getTotalVersionsSize(config);

      this._summary.builder
        .muted("Versions ")
        .accentColor(String(versions.length))
        .muted("  Size ")
        .text(formatSize(totalSize));

      const items: ListItem<string, VersionInfo>[] = versions.map(v => ({
        id: v.version,
        label: v.version,
        sublabel: BACKEND_LABELS[v.backend] || v.backend,
        data: v,
      }));

      this._list.setRenderer(this._localRenderer.bind(this));
      this._list.updateItems(items);

      if (config.activeVersion) {
        const activeIdx = items.findIndex(i => (i.data as VersionInfo).active);
        if (activeIdx >= 0) {
          this._list.selectedIndex = activeIdx;
        }
      }

      const sel = this._list.getSelectedItem();
      this._btnDelete.disabled = !sel || !(sel.data as VersionInfo).active;
      this.markDirty();
    } catch (err: any) {
      // ignore
    }
  }

  _localRenderer(canvas: FramebufferCanvas, item: ListItem<string, VersionInfo | RemoteVersion | AvailableBackend>, _index: number, isSelected: boolean, _x: number, rowY: number, width: number): void {
    const v = item.data as VersionInfo;
    const prefix = v.active ? "✓ " : "  ";
    const line = (` ${prefix}${v.version}  ${BACKEND_LABELS[v.backend] || v.backend}`).padEnd(width);

    if (isSelected) {
      fgBg(canvas, "selectedText", "selectedBg", line.substring(0, width));
    } else if (v.active) {
      fgBg(canvas, "success", "canvasSubtle", line.substring(0, width));
    } else {
      fgBg(canvas, "text", "canvasSubtle", line.substring(0, width));
    }
  }

  _releaseRenderer(canvas: FramebufferCanvas, item: ListItem<string, VersionInfo | RemoteVersion | AvailableBackend>, _index: number, isSelected: boolean, _x: number, rowY: number, width: number): void {
    const r = item.data as RemoteVersion;
    const date = r.publishedAt ? r.publishedAt.substring(0, 10) : "";
    const line = (` ${r.tag}  ${date}`).padEnd(width);

    if (isSelected) {
      fgBg(canvas, "selectedText", "selectedBg", line.substring(0, width));
    } else {
      fgBg(canvas, "text", "canvasSubtle", line.substring(0, width));
    }
  }

  _backendRenderer(canvas: FramebufferCanvas, item: ListItem<string, VersionInfo | RemoteVersion | AvailableBackend>, _index: number, isSelected: boolean, _x: number, rowY: number, width: number): void {
    const b = item.data as AvailableBackend;
    const line = (` ${b.label}  ${b.assetName}`).padEnd(width);

    if (isSelected) {
      fgBg(canvas, "selectedText", "selectedBg", line.substring(0, width));
    } else {
      fgBg(canvas, "text", "canvasSubtle", line.substring(0, width));
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

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function createVersionsTab(ctx: TabContext): Control {
  return new VersionsControl(ctx);
}
