import { Column } from "../ui/Layout.js";
import { ButtonBar } from "../ui/widgets/ButtonBar.js";
import { Button } from "../ui/widgets/Button.js";
import { themeColors, fg, termWidth, termHeight, renderBox, renderBoxWithSeparator, renderLine, renderDivider } from "../../lib/theme.js";
import { loadConfig, saveConfig, getVersionsDir, ConfigData } from "../../lib/config.js";
import {
  listVersions,
  switchVersion,
  uninstallVersion,
  checkLatestVersion,
  installVersion,
  listRecentVersions,
  getTotalVersionsSize,
  getAvailableBackends,
  getPlatformKey,
  BACKEND_LABELS,
  VersionInfo,
  RemoteVersion,
  AvailableBackend,
} from "../../lib/versions.js";
import { formatSize } from "../../lib/models.js";
import type { TabContext } from "../../lib/tabcontext.js";
import type { RenderContext, Size } from "../ui/types.js";


export class VersionsControl extends Column {
  protected _ctx: TabContext | null = null;
  protected _config: ConfigData | null = null;
  protected _versions: VersionInfo[] = [];
  protected _selectedIndex = 0;
  protected _focusArea: "buttons" | "list" | "releases" | "backends" = "buttons";
  protected _buttonBar: ButtonBar;
  protected _loading = false;
  protected _message: string | null = null;
  protected _installing = false;
  protected _installProgress = 0;
  protected _installLabel = "";
  protected _editValue = "";
  protected _totalSize = 0;
  protected _releases: RemoteVersion[] = [];
  protected _releaseIndex = 0;
  protected _fetchingReleases = false;
  protected _editMode = false;
  protected _pendingTag: string | null = null;
  protected _availableBackends: AvailableBackend[] = [];
  protected _backendIndex = 0;
  protected _installedBackends: Record<string, Set<string>> = {};
  protected _timer: ReturnType<typeof setInterval> | null = null;
  protected _initPromise: Promise<void> | null = null;

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;
    this._buttonBar = new ButtonBar();
    this._buttonBar.add(new Button({ label: "Switch", action: () => this._onSwitch() }));
    this._buttonBar.add(new Button({ label: "Uninstall", action: () => this._onUninstall() }));
    this._buttonBar.add(new Button({ label: "Check", action: () => this._onCheck() }));
    this._buttonBar.add(new Button({ label: "Install", action: () => this._onInstall() }));
  }

  measure(_parentSize?: Size): Size {
    return { width: _parentSize?.width || 80, height: _parentSize?.height || 20 };
  }

  attach(renderContext: RenderContext): void {
    super.attach(renderContext);
    this._buttonBar.attach(renderContext);
  }

  detach(): void {
    this._buttonBar.detach();
    super.detach();
  }

  onAttach(): void {
    this._initIfNeeded();
  }

  focus(): void {
    super.focus();
    if (this._focusArea === "buttons") {
      this._buttonBar.focus();
    }
  }

  render(): void {
    if (!this.visible || !this.needsRender || !this._ctx) return;
    const term = this.term;
    this._initIfNeeded();

    if (!this._config) {
      renderLine(term, this.rect.y, () => {
        fg(term, themeColors.textMuted, "Loading versions...");
      });
      this.needsRender = false;
      return;
    }

    if (this._loading) {
      renderLine(term, this.rect.y, () => {
        fg(term, themeColors.textMuted, "Loading...");
      });
      this.needsRender = false;
      return;
    }

    let y = this.rect.y;
    y = this._renderHeader(term, y);
    y = this._renderButtons(term, y);
    renderDivider(term, y++, themeColors.border);

    if (this._editMode) {
      y = this._renderEditMode(term, y);
    } else if (this._focusArea === "list" || this._focusArea === "buttons") {
      y = this._renderVersionList(term, y);
    } else if (this._focusArea === "releases") {
      y = this._renderReleases(term, y);
    } else if (this._focusArea === "backends") {
      y = this._renderBackends(term, y);
    }

    y = this._renderProgressBar(term, y);
    y = this._renderHelp(term, y);

    if (this._message) {
      renderLine(term, y++, () => {});
      renderLine(term, y++, () => {
        fg(term, themeColors.warning, ` ${this._message}`);
      });
    }

    this.needsRender = false;
  }

  handleKey(key: string): boolean {
    if (this._installing) {
      return true;
    }

    if (this._editMode) {
      return this._handleEditModeKey(key);
    }

    if (this._focusArea === "buttons") {
      return this._handleButtonsKey(key);
    } else if (this._focusArea === "list") {
      return this._handleListKey(key);
    } else if (this._focusArea === "releases") {
      return this._handleReleasesKey(key);
    } else if (this._focusArea === "backends") {
      return this._handleBackendsKey(key);
    }

    return false;
  }

  handleChar(char: string): boolean {
    if (this._editMode && char.length === 1) {
      this._editValue += char;
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    return false;
  }

  // — Init —

  _initIfNeeded(): void {
    if (!this._config && !this._initPromise) {
      this._loading = true;
      this._initPromise = (async () => {
        this._config = await loadConfig();
        if (this._config) {
          const [versions, totalSize] = await Promise.all([
            listVersions(this._config),
            getTotalVersionsSize(this._config),
          ]);
          this._versions = versions;
          this._totalSize = totalSize;
          this._installedBackends = this._buildInstalledBackends(versions);
        }
        this._loading = false;
        this.markDirty();
        this._ctx?.scheduleRender();
      })();
    }
  }

  _buildInstalledBackends(versions: VersionInfo[]): Record<string, Set<string>> {
    const map: Record<string, Set<string>> = {};
    for (const v of versions) {
      if (!map[v.tag]) map[v.tag] = new Set();
      map[v.tag].add(v.backend);
    }
    return map;
  }

  // — Message —

  _clearMessageTimer(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  _showMessage(msg: string): void {
    this._message = msg;
    this._ctx?.showMessage(msg);
    this._clearMessageTimer();
    this._timer = setInterval(() => {
      this._message = null;
      this._clearMessageTimer();
    }, 5000);
  }

  // — Buttons —

  _updateButtons(): void {
    const hasSelection = this._versions.length > 0 && this._selectedIndex < this._versions.length;
    const buttons = this._buttonBar.getButtons();
    buttons[0].disabled = !hasSelection;
    buttons[1].disabled = !hasSelection;
    buttons[2].disabled = false;
    buttons[3].disabled = false;
  }

  _handleButtonsKey(key: string): boolean {
    if (key === "DOWN") {
      this._focusArea = "list";
      this._buttonBar.blur();
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    const handled = this._buttonBar.handleKey(key);
    if (handled) {
      this.markDirty();
      this._ctx?.scheduleRender();
    }
    return handled;
  }

  // — List —

  _handleListKey(key: string): boolean {
    if (key === "k" || key === "UP") {
      if (this._selectedIndex === 0) {
        this._focusArea = "buttons";
        this._buttonBar.focus();
        this.markDirty();
        this._ctx?.scheduleRender();
        return true;
      }
      this._selectedIndex = Math.max(0, this._selectedIndex - 1);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "j" || key === "DOWN") {
      this._selectedIndex = Math.min(this._versions.length - 1, this._selectedIndex + 1);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "RETURN" || key === "ENTER") {
      if (this._versions.length > 0) {
        this._onSwitch();
      }
      return true;
    }
    return false;
  }

  // — Releases —

  _handleReleasesKey(key: string): boolean {
    if (key === "k" || key === "UP") {
      this._releaseIndex = Math.max(0, this._releaseIndex - 1);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "j" || key === "DOWN") {
      this._releaseIndex = Math.min(this._releases.length - 1, this._releaseIndex + 1);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "g" || key === "ESC") {
      this._focusArea = "buttons";
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "e") {
      this._editMode = true;
      this._editValue = "";
      this._ctx?.setTextInputFocused(true);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "RETURN" || key === "ENTER") {
      const currentRelease = this._releases[this._releaseIndex];
      if (!currentRelease) return true;

      const platform = getPlatformKey();
      this._availableBackends = getAvailableBackends(
        currentRelease.tag,
        platform,
        currentRelease.assets,
      );
      this._backendIndex = 0;
      this._pendingTag = null;
      this._focusArea = "backends";
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    return false;
  }

  // — Backends —

  _handleBackendsKey(key: string): boolean {
    if (key === "k" || key === "UP") {
      this._backendIndex = Math.max(0, this._backendIndex - 1);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "j" || key === "DOWN") {
      this._backendIndex = Math.min(this._availableBackends.length - 1, this._backendIndex + 1);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "g" || key === "ESC") {
      this._focusArea = "releases";
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "RETURN" || key === "ENTER") {
      if (this._availableBackends.length > 0) {
        const backend = this._availableBackends[this._backendIndex];
        const currentTag = this._pendingTag || (this._releases[this._releaseIndex]?.tag || "");
        const installedForTag = this._installedBackends[currentTag];
        if (installedForTag && installedForTag.has(backend.id)) {
          this._showMessage("Backend already installed.");
          return true;
        }
        this._installSelectedBackend().catch(() => {});
      }
      return true;
    }
    return false;
  }

  // — Edit mode —

  _handleEditModeKey(key: string): boolean {
    if (key === "RETURN" || key === "ENTER") {
      const tag = this._editValue.trim();
      if (tag) {
        this._pendingTag = tag;
        this._editMode = false;
        this._ctx?.setTextInputFocused(false);

        const platform = getPlatformKey();
        (async () => {
          try {
            const res = await fetch(
              `https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/${tag}`,
              { headers: { "User-Agent": "llama-manager" } },
            );
            if (res.ok) {
              const data = await res.json();
              const assets = (data.assets || []).map((a: any) => ({ name: a.name, size: a.size }));
              this._availableBackends = getAvailableBackends(tag, platform, assets);
              this._backendIndex = 0;
              this._focusArea = "backends";
            } else {
              this._showMessage(`Tag not found: ${tag}`);
              this._editMode = false;
              this._pendingTag = null;
              this._focusArea = "releases";
            }
          } catch (err: any) {
            this._showMessage(`Failed to fetch tag: ${err.message}`);
            this._editMode = false;
            this._pendingTag = null;
            this._focusArea = "releases";
          }
          this.markDirty();
          this._ctx?.scheduleRender();
        })();
      }
      return true;
    }
    if (key === "ESC" || key === "CTRL_C") {
      this._editMode = false;
      this._editValue = "";
      this._pendingTag = null;
      this._ctx?.setTextInputFocused(false);
      this._focusArea = "releases";
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "BACKSPACE" || key === "DEL") {
      this._editValue = this._editValue.slice(0, -1);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    return true;
  }

  // — Actions —

  _onSwitch(): void {
    if (!this._config) return;
    if (this._versions.length === 0) {
      this._showMessage("No versions installed.");
      return;
    }
    const v = this._versions[this._selectedIndex];
    if (!v) {
      this._showMessage("No version selected.");
      return;
    }
    (async () => {
      try {
        this._config = await switchVersion(this._config!, v.version);
        await saveConfig(this._config);
        this._versions = await listVersions(this._config);
        this._installedBackends = this._buildInstalledBackends(this._versions);
        this._showMessage(`Switched to ${v.version}`);
      } catch (err: any) {
        this._showMessage(`Switch failed: ${err.message}`);
      }
      this.markDirty();
      this._ctx?.scheduleRender();
    })();
  }

  _onUninstall(): void {
    if (!this._config) return;
    if (this._versions.length === 0) {
      this._showMessage("No versions installed.");
      return;
    }
    const v = this._versions[this._selectedIndex];
    if (!v) {
      this._showMessage("No version selected.");
      return;
    }
    if (v.active) {
      this._showMessage("Cannot uninstall active version.");
      return;
    }
    (async () => {
      try {
        await uninstallVersion(this._config!, v.version);
        this._versions = await listVersions(this._config!);
        this._totalSize = await getTotalVersionsSize(this._config!);
        this._installedBackends = this._buildInstalledBackends(this._versions);
        if (this._selectedIndex >= this._versions.length) {
          this._selectedIndex = Math.max(0, this._versions.length - 1);
        }
        this._showMessage(`Uninstalled ${v.version}`);
      } catch (err: any) {
        this._showMessage(`Uninstall failed: ${err.message}`);
      }
      this.markDirty();
      this._ctx?.scheduleRender();
    })();
  }

  _onCheck(): void {
    if (!this._config) return;
    (async () => {
      try {
        this._ctx?.showMessage("Checking for updates...");
        const latest = await checkLatestVersion();
        const activeVersion = this._config!.activeVersion;
        if (activeVersion && activeVersion.startsWith(latest.split("-")[0])) {
          this._showMessage(`Already on latest: ${latest}`);
        } else {
          this._showMessage(`Latest version: ${latest} (current: ${activeVersion || "none"})`);
        }
      } catch (err: any) {
        this._showMessage(`Check failed: ${err.message}`);
      }
    })();
  }

  _onInstall(): void {
    (async () => {
      this._focusArea = "releases";
      this._releaseIndex = 0;
      this._fetchingReleases = true;
      this._ctx?.showMessage("Fetching releases...");
      this.markDirty();
      this._ctx?.scheduleRender();
      try {
        this._releases = await listRecentVersions(20);
      } catch (err: any) {
        this._showMessage(`Failed to fetch releases: ${err.message}`);
        this._focusArea = "buttons";
      }
      this._fetchingReleases = false;
      this.markDirty();
      this._ctx?.scheduleRender();
    })();
  }

  async _installSelectedBackend(): Promise<void> {
    const currentRelease = this._releases[this._releaseIndex];
    const backend = this._availableBackends[this._backendIndex];

    if (!currentRelease || !backend) {
      this._showMessage("No release or backend selected.");
      return;
    }

    if (!this._config) return;

    const tag = this._pendingTag || currentRelease.tag;

    this._installing = true;
    this._installProgress = 0;
    this._installLabel = "";
    this._message = null;
    this._ctx?.setTextInputFocused(false);
    this._ctx?.showMessage(`Installing ${tag} (${backend.label})...`);
    this.markDirty();
    this._ctx?.scheduleRender();

    try {
      const result = await installVersion(this._config, tag, backend.id, (pct, label) => {
        this._installProgress = pct;
        this._installLabel = label;
        this.markDirty();
        this._ctx?.scheduleRender();
      });

      this._config.activeVersion = result;
      await saveConfig(this._config);
      this._versions = await listVersions(this._config);
      this._totalSize = await getTotalVersionsSize(this._config);
      this._installedBackends = this._buildInstalledBackends(this._versions);
      this._focusArea = "buttons";
      this._selectedIndex = 0;
      this._message = null;
      this._showMessage(`Installed and activated ${result}`);
    } catch (err: any) {
      this._showMessage(`Install failed: ${err.message}`);
    } finally {
      this._installing = false;
      this._installProgress = 0;
      this._installLabel = "";
    }
    this.markDirty();
    this._ctx?.scheduleRender();
  }

  // — Rendering —

  _renderHeader(term: any, startY: number): number {
    const installedCount = this._versions.length;
    const sizeStr = formatSize(this._totalSize);
    const title = `  Versions │ ${installedCount} installed │ ${sizeStr} used`;
    const dir = getVersionsDir(this._config!);

    let y = startY;

    renderLine(term, y++, () => {
      term.bold();
      fg(term, themeColors.text, title);
      term.styleReset();
    });

    renderLine(term, y++, () => {
      fg(term, themeColors.textMuted, ` Dir: ${dir}`);
    });

    renderDivider(term, y++, themeColors.border);

    return y;
  }

  _renderButtons(term: any, startY: number): number {
    this._updateButtons();
    const buttons = this._buttonBar.getButtons();
    let totalWidth = 0;
    for (let i = 0; i < buttons.length; i++) {
      totalWidth += buttons[i]!.label.length + 4;
      if (i < buttons.length - 1) totalWidth += 2;
    }
    const rect = { x: 0, y: startY, width: totalWidth, height: 1 };
    this._buttonBar.rect = rect;
    this._buttonBar.onLayout();
    this._buttonBar.needsRender = true;
    this._buttonBar.render();
    return startY + 1;
  }

  _renderVersionList(term: any, startY: number): number {
    let y = startY;
    const versions = this._versions;

    if (versions.length === 0) {
      renderLine(term, y++, () => {});
      renderLine(term, y++, () => {
        fg(term, themeColors.textMuted, "  No versions installed.");
      });
      return y;
    }

    renderLine(term, y++, () => {});
    const currentTag = new Set<string>();
    let lastTag: string | null = null;

    for (let i = 0; i < versions.length; i++) {
      const v = versions[i];
      const selected = i === this._selectedIndex && this._focusArea === "list";
      const isNewTag = v.tag !== lastTag;

      if (isNewTag && lastTag !== null) {
        currentTag.clear();
      }

      if (!currentTag.has(v.tag)) {
        currentTag.add(v.tag);
      }

      lastTag = v.tag;

      const label = BACKEND_LABELS[v.backend] || v.backend;
      let line = "  ";

      if (isNewTag) {
        line += `● ${v.tag}`;
      } else {
        line += `  ${label.padEnd(12)}`;
      }

      if (v.active) {
        line += " (active)";
      }

      if (v.backend !== "cpu" && v.backend !== "metal") {
        line += ` [${label}]`;
      }

      renderLine(term, y++, () => {
        if (selected) {
          term.bold();
          fg(term, themeColors.selected, "► ");
          fg(term, themeColors.selected, line);
          term.styleReset();
        } else if (v.active) {
          fg(term, themeColors.success, "  ");
          fg(term, themeColors.text, line);
        } else if (v.backend !== "cpu" && v.backend !== "metal") {
          fg(term, themeColors.textMuted, "  ");
          fg(term, themeColors.warning, line);
        } else {
          fg(term, themeColors.textMuted, "  ");
          fg(term, themeColors.textMuted, line);
        }
      });
    }

    return y;
  }

  _renderReleases(term: any, startY: number): number {
    const width = termWidth(term);
    const innerW = width - 2;
    const headerText = " Available releases │ j/k navigate │ Enter select │ g back │ e custom tag";

    let bodyLines: { render: () => void }[];
    if (this._fetchingReleases) {
      bodyLines = [{
        render: () => {
          fg(term, themeColors.textMuted, " Fetching releases...");
          term(" ".repeat(Math.max(0, innerW - " Fetching releases...".length)));
        },
      }];
    } else if (this._releases.length === 0) {
      bodyLines = [{
        render: () => {
          fg(term, themeColors.textMuted, " No releases found.");
          term(" ".repeat(Math.max(0, innerW - " No releases found.".length)));
        },
      }];
    } else {
      bodyLines = this._releases.map((r, i) => {
        const selected = i === this._releaseIndex;
        const date = new Date(r.publishedAt).toISOString().split("T")[0];
        const line = ` ${r.tag.padEnd(12)} ${date}  ${r.assets.length} assets`;
        return {
          render: () => {
            if (selected) {
              term.bold();
              fg(term, themeColors.accent, line);
              term.styleReset();
            } else {
              fg(term, themeColors.text, line);
            }
            term(" ".repeat(Math.max(0, innerW - line.length)));
          },
        };
      });
    }

    return renderBoxWithSeparator({ term, width, borderColor: themeColors.border, startY }, [
      {
        render: () => {
          fg(term, themeColors.textMuted, headerText);
          term(" ".repeat(Math.max(0, innerW - headerText.length)));
        },
      },
    ], bodyLines);
  }

  _renderBackends(term: any, startY: number): number {
    const width = termWidth(term);
    const innerW = width - 2;
    const currentRelease = this._releases[this._releaseIndex];
    const tag = currentRelease ? currentRelease.tag : this._pendingTag || "";

    const header = ` Select backend ${tag} │ j/k navigate │ Enter install │ g back `;

    const backends = this._availableBackends;
    const installedForTag = this._installedBackends[tag];

    const bodyLines: { render: () => void }[] = backends.map((b, i) => {
      const selected = i === this._backendIndex;
      const alreadyInstalled = installedForTag && installedForTag.has(b.id);
      let line = ` ${b.label}`;
      if (alreadyInstalled) {
        line += " [installed]";
      }
      return {
        render: () => {
          if (selected) {
            term.bold();
            fg(term, themeColors.accent, line);
            term.styleReset();
          } else if (alreadyInstalled) {
            fg(term, themeColors.textMuted, line);
          } else {
            fg(term, themeColors.text, line);
          }
          term(" ".repeat(Math.max(0, innerW - line.length)));
        },
      };
    });

    if (backends.length === 0) {
      bodyLines.push({
        render: () => {
          fg(term, themeColors.textMuted, " No backends available for this platform.");
          term(" ".repeat(Math.max(0, innerW - " No backends available for this platform.".length)));
        },
      });
    }

    return renderBoxWithSeparator({ term, width, borderColor: themeColors.border, startY }, [
      {
        render: () => {
          fg(term, themeColors.textMuted, header);
          term(" ".repeat(Math.max(0, innerW - header.length)));
        },
      },
    ], bodyLines);
  }

  _renderProgressBar(term: any, startY: number): number {
    if (!this._installing) return startY;

    const width = termWidth(term);
    renderLine(term, startY++, () => {});

    const progress = this._installProgress;
    const label = `Installing... ${this._installLabel}`;
    const barWidth = Math.max(10, width - label.length - 8);
    const filled = Math.floor((progress / 100) * barWidth);
    const empty = barWidth - filled;

    renderLine(term, startY, () => {
      fg(term, themeColors.text, ` ${label} `);
      fg(term, themeColors.border, "\u250c");
      fg(term, themeColors.success, "\u2588".repeat(filled));
      fg(term, themeColors.textMuted, "\u2591".repeat(empty));
      fg(term, themeColors.border, "\u2510");
      fg(term, themeColors.text, ` ${progress}%`);
    });

    return startY + 1;
  }

  _renderHelp(term: any, startY: number): number {
    let hint = "";
    if (this._installing) {
      hint = " Installing... please wait ";
    } else if (this._editMode) {
      hint = " Type tag │ Enter confirm │ Ctrl+C cancel ";
    } else if (this._focusArea === "buttons") {
      hint = " h/l navigate │ Enter execute │ DOWN to list ";
    } else if (this._focusArea === "list") {
      hint = " j/k navigate │ UP to actions │ Enter switch ";
    } else if (this._focusArea === "releases") {
      hint = " j/k navigate │ Enter select backend │ g back │ e custom tag ";
    } else if (this._focusArea === "backends") {
      hint = " j/k navigate │ Enter install │ g back to releases ";
    }

    renderLine(term, startY++, () => {});

    const width = termWidth(term);
    const left = Math.floor((width - 2 - hint.length) / 2);

    renderLine(term, startY, () => {
      term(" ".repeat(left));
      fg(term, themeColors.textMuted, hint);
    });

    return startY + 1;
  }

  _renderEditMode(term: any, startY: number): number {
    const width = termWidth(term);
    const innerW = width - 2;
    const prompt = ` Tag: ${this._editValue}`;

    return renderBox({ term, width, borderColor: themeColors.accent, startY }, [
      {
        render: () => {
          term.bold();
          fg(term, themeColors.text, prompt);
          term.styleReset();
          term(" ".repeat(Math.max(0, innerW - prompt.length)));
        },
      },
    ]);
  }

  onDetach(): void {
    this._clearMessageTimer();
    this._config = null;
    this._versions = [];
    this._selectedIndex = 0;
    this._focusArea = "buttons";
    this._loading = false;
    this._message = null;
    this._installing = false;
    this._installProgress = 0;
    this._installLabel = "";
    this._editValue = "";
    this._totalSize = 0;
    this._releases = [];
    this._releaseIndex = 0;
    this._fetchingReleases = false;
    this._editMode = false;
    this._pendingTag = null;
    this._availableBackends = [];
    this._backendIndex = 0;
    this._installedBackends = {};
    this._initPromise = null;
  }
}

export function createVersionsTab(ctx: TabContext) {
  return new VersionsControl(ctx);
}
