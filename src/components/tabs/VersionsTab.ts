import type { Terminal } from "terminal-kit";
import { themeColors, fg, termWidth, renderBox, renderBoxWithSeparator, renderLine, renderDivider } from "../../lib/theme.js";
import { renderProgressBar as renderSharedProgressBar } from "../shared/ProgressBar.js";
import { renderHelpBar } from "../shared/HelpBar.js";
import { renderButtonBar } from "../shared/Button.js";
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
import { TabContext } from "../../lib/tabcontext.js";

const ACTIONS = ["switch", "uninstall", "check", "install"];

interface State {
  config: ConfigData | null;
  versions: VersionInfo[];
  selectedIndex: number;
  focusArea: "list" | "actions" | "releases" | "backends";
  actionIndex: number;
  loading: boolean;
  message: string | null;
  installing: boolean;
  installProgress: number;
  installLabel: string;
  editValue: string;
  totalSize: number;
  releases: RemoteVersion[];
  releaseIndex: number;
  fetchingReleases: boolean;
  editMode: boolean;
  pendingTag: string | null;
  availableBackends: AvailableBackend[];
  backendIndex: number;
  installedBackends: Record<string, Set<string>>;
  timer: ReturnType<typeof setInterval> | null;
  initPromise: Promise<void> | null;
}

function buildInstalledBackends(versions: VersionInfo[]): Record<string, Set<string>> {
  const map: Record<string, Set<string>> = {};
  for (const v of versions) {
    if (!map[v.tag]) map[v.tag] = new Set();
    map[v.tag].add(v.backend);
  }
  return map;
}

const ACTION_LABELS = ACTIONS.map(a => a.charAt(0).toUpperCase() + a.slice(1));

function createInitialState(): State {
  return {
    config: null,
    versions: [],
    selectedIndex: 0,
    focusArea: "list",
    actionIndex: 0,
    loading: false,
    message: null,
    installing: false,
    installProgress: 0,
    installLabel: "",
    editValue: "",
    totalSize: 0,
    releases: [],
    releaseIndex: 0,
    fetchingReleases: false,
    editMode: false,
    pendingTag: null,
    availableBackends: [],
    backendIndex: 0,
    installedBackends: {},
    timer: null,
    initPromise: null,
  };
}

function resetState(state: State): void {
  state.config = null;
  state.versions = [];
  state.selectedIndex = 0;
  state.focusArea = "list";
  state.actionIndex = 0;
  state.loading = false;
  state.message = null;
  state.installing = false;
  state.installProgress = 0;
  state.installLabel = "";
  state.editValue = "";
  state.totalSize = 0;
  state.releases = [];
  state.releaseIndex = 0;
  state.fetchingReleases = false;
  state.editMode = false;
  state.pendingTag = null;
  state.availableBackends = [];
  state.backendIndex = 0;
  state.installedBackends = {};
  state.initPromise = null;
}

export function createVersionsTab(ctx: TabContext) {
  const state = createInitialState();

  function clearMessageTimer(): void {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
  }

  function showMessage(msg: string): void {
    state.message = msg;
    ctx.showMessage(msg);
    clearMessageTimer();
    state.timer = setInterval(() => {
      state.message = null;
      clearMessageTimer();
    }, 5000);
  }

  function renderHeader(term: Terminal, config: ConfigData, startY: number): number {
    const installedCount = state.versions.length;
    const sizeStr = formatSize(state.totalSize);
    const title = `  Versions │ ${installedCount} installed │ ${sizeStr} used`;

    const dir = getVersionsDir(config);
    const dirLine = ` Dir: ${dir}`;

    let y = startY;

    renderLine(term, y++, () => {
      term.bold();
      fg(term, themeColors.text, title);
      term.styleReset();
    });

    renderLine(term, y++, () => {
      fg(term, themeColors.textMuted, dirLine);
    });

    renderDivider(term, y++, themeColors.border);

    return y;
  }

  function renderHelp(term: Terminal, startY: number): number {
    let hint = "";
    if (state.installing) {
      hint = " Installing... please wait ";
    } else if (state.editMode) {
      hint = " Type tag │ Enter confirm │ Ctrl+C cancel ";
    } else if (state.focusArea === "list") {
      hint = " j/k navigate │ g actions │ Enter execute ";
    } else if (state.focusArea === "actions") {
      hint = " h/l action select │ Enter execute │ j/k go to list ";
    } else if (state.focusArea === "releases") {
      hint = " j/k navigate │ Enter select backend │ g back │ e custom tag ";
    } else if (state.focusArea === "backends") {
      hint = " j/k navigate │ Enter install │ g back to releases ";
    }

    return renderHelpBar({ term, y: startY, text: hint });
  }

  function renderVersionList(term: Terminal, startY: number): number {
    let y = startY;
    const versions = state.versions;

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
      const selected = i === state.selectedIndex && state.focusArea === "list";
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

  function renderReleases(term: Terminal, startY: number): number {
    const width = termWidth(term);
    const innerW = width - 2;
    const headerText = " Available releases │ j/k navigate │ Enter select │ g back │ e custom tag";

    let bodyLines: { render: () => void }[];
    if (state.fetchingReleases) {
      bodyLines = [{
        render: () => {
          fg(term, themeColors.textMuted, " Fetching releases...");
          term(" ".repeat(Math.max(0, innerW - " Fetching releases...".length)));
        },
      }];
    } else if (state.releases.length === 0) {
      bodyLines = [{
        render: () => {
          fg(term, themeColors.textMuted, " No releases found.");
          term(" ".repeat(Math.max(0, innerW - " No releases found.".length)));
        },
      }];
    } else {
      bodyLines = state.releases.map((r, i) => {
        const selected = i === state.releaseIndex;
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

  function renderBackends(term: Terminal, startY: number): number {
    const width = termWidth(term);
    const innerW = width - 2;
    const currentRelease = state.releases[state.releaseIndex];
    const tag = currentRelease ? currentRelease.tag : state.pendingTag || "";

    const header = ` Select backend ${tag} │ j/k navigate │ Enter install │ g back `;

    const backends = state.availableBackends;
    const installedForTag = state.installedBackends[tag];

    const bodyLines: { render: () => void }[] = backends.map((b, i) => {
      const selected = i === state.backendIndex;
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

  function renderProgressBar(term: Terminal, startY: number): number {
    if (!state.installing) return startY;
    renderLine(term, startY, () => {});
    return renderSharedProgressBar({
      term,
      startY: startY + 1,
      progress: state.installProgress,
      label: `Installing... ${state.installLabel}`,
      filledColor: themeColors.success,
      emptyColor: themeColors.textMuted,
      labelColor: themeColors.text,
    });
  }

  function renderEditMode(term: Terminal, startY: number): number {
    const width = termWidth(term);
    const innerW = width - 2;
    const prompt = ` Tag: ${state.editValue}`;

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

  function initIfNeeded(): void {
    if (!state.config && !state.initPromise) {
      state.loading = true;
      state.initPromise = (async () => {
        state.config = await loadConfig();
        if (state.config) {
          const [versions, totalSize] = await Promise.all([
            listVersions(state.config),
            getTotalVersionsSize(state.config),
          ]);
          state.versions = versions;
          state.totalSize = totalSize;
          state.installedBackends = buildInstalledBackends(versions);
        }
        state.loading = false;
        ctx.scheduleRender();
      })();
    }
  }

  async function executeAction(action: string): Promise<void> {
    if (!state.config) return;

    switch (action) {
      case "switch": {
        if (state.versions.length === 0) {
          showMessage("No versions installed.");
          return;
        }
        const v = state.versions[state.selectedIndex];
        if (!v) {
          showMessage("No version selected.");
          return;
        }
        try {
          state.config = await switchVersion(state.config, v.version);
          await saveConfig(state.config);
          state.versions = await listVersions(state.config);
          state.installedBackends = buildInstalledBackends(state.versions);
          showMessage(`Switched to ${v.version}`);
        } catch (err: any) {
          showMessage(`Switch failed: ${err.message}`);
        }
        ctx.scheduleRender();
        break;
      }

      case "uninstall": {
        if (state.versions.length === 0) {
          showMessage("No versions installed.");
          return;
        }
        const v = state.versions[state.selectedIndex];
        if (!v) {
          showMessage("No version selected.");
          return;
        }
        if (v.active) {
          showMessage("Cannot uninstall active version.");
          return;
        }
        try {
          await uninstallVersion(state.config, v.version);
          state.versions = await listVersions(state.config);
          state.totalSize = await getTotalVersionsSize(state.config);
          state.installedBackends = buildInstalledBackends(state.versions);
          if (state.selectedIndex >= state.versions.length) {
            state.selectedIndex = Math.max(0, state.versions.length - 1);
          }
          showMessage(`Uninstalled ${v.version}`);
        } catch (err: any) {
          showMessage(`Uninstall failed: ${err.message}`);
        }
        ctx.scheduleRender();
        break;
      }

      case "check": {
        try {
          ctx.showMessage("Checking for updates...");
          const latest = await checkLatestVersion();
          const activeVersion = state.config.activeVersion;
          if (activeVersion && activeVersion.startsWith(latest.split("-")[0])) {
            showMessage(`Already on latest: ${latest}`);
          } else {
            showMessage(`Latest version: ${latest} (current: ${activeVersion || "none"})`);
          }
        } catch (err: any) {
          showMessage(`Check failed: ${err.message}`);
        }
        break;
      }

      case "install": {
        state.focusArea = "releases";
        state.releaseIndex = 0;
        state.fetchingReleases = true;
        ctx.showMessage("Fetching releases...");
        ctx.scheduleRender();
        try {
          state.releases = await listRecentVersions(20);
        } catch (err: any) {
          showMessage(`Failed to fetch releases: ${err.message}`);
          state.focusArea = "list";
        }
        state.fetchingReleases = false;
        ctx.scheduleRender();
        break;
      }
    }
  }

  async function installSelectedBackend(): Promise<void> {
    const currentRelease = state.releases[state.releaseIndex];
    const backend = state.availableBackends[state.backendIndex];

    if (!currentRelease || !backend) {
      showMessage("No release or backend selected.");
      return;
    }

    if (!state.config) return;

    const tag = state.pendingTag || currentRelease.tag;

    state.installing = true;
    state.installProgress = 0;
    state.installLabel = "";
    ctx.setTextInputFocused(false);
    ctx.showMessage(`Installing ${tag} (${backend.label})...`);
    ctx.scheduleRender();

    try {
      const result = await installVersion(state.config, tag, backend.id, (pct, label) => {
        state.installProgress = pct;
        state.installLabel = label;
        ctx.scheduleRender();
      });

      state.config.activeVersion = result;
      await saveConfig(state.config);
      state.versions = await listVersions(state.config);
      state.totalSize = await getTotalVersionsSize(state.config);
      state.installedBackends = buildInstalledBackends(state.versions);
      showMessage(`Installed and activated ${result}`);
      state.focusArea = "list";
      state.selectedIndex = 0;
    } catch (err: any) {
      showMessage(`Install failed: ${err.message}`);
    } finally {
      state.installing = false;
      state.installProgress = 0;
      state.installLabel = "";
    }
    ctx.scheduleRender();
  }

  function render(): void {
    const term = ctx.term;
    initIfNeeded();

    if (!state.config) {
      renderLine(term, 3, () => {
        fg(term, themeColors.textMuted, "Loading versions...");
      });
      return;
    }

    if (state.loading) {
      renderLine(term, 3, () => {
        fg(term, themeColors.textMuted, "Loading...");
      });
      return;
    }

    let y = 3;
    y = renderHeader(term, state.config, y);

    if (state.editMode) {
      y = renderEditMode(term, y);
    } else if (state.focusArea === "list") {
      y = renderVersionList(term, y);
      y = renderButtonBar({
        term,
        startY: y,
        items: ACTION_LABELS.map(label => ({ label })),
        selectedIndex: -1,
        label: "Actions:",
      });
    } else if (state.focusArea === "actions") {
      y = renderVersionList(term, y);
      y = renderButtonBar({
        term,
        startY: y,
        items: ACTION_LABELS.map(label => ({ label })),
        selectedIndex: state.actionIndex,
        label: "Actions:",
      });
    } else if (state.focusArea === "releases") {
      y = renderReleases(term, y);
    } else if (state.focusArea === "backends") {
      y = renderBackends(term, y);
    }

    y = renderProgressBar(term, y);
    y = renderHelp(term, y);

    if (state.message) {
      renderLine(term, y++, () => {});
      renderLine(term, y++, () => {
        fg(term, themeColors.warning, ` ${state.message}`);
      });
    }
  }

  function handleKey(key: string): boolean {
    if (state.installing) {
      return true;
    }

    if (state.editMode) {
      if (key === "return" || key === "enter") {
        const tag = state.editValue.trim();
        if (tag) {
          state.pendingTag = tag;
          state.editMode = false;
          ctx.setTextInputFocused(false);

          const platform = getPlatformKey();
          (async () => {
            try {
              const res = await fetch(
                `https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/${tag}`,
                { headers: { "User-Agent": "llama-dashboard" } },
              );
              if (res.ok) {
                const data = await res.json();
                const assets = (data.assets || []).map((a: any) => ({ name: a.name, size: a.size }));
                state.availableBackends = getAvailableBackends(tag, platform, assets);
                state.backendIndex = 0;
                state.focusArea = "backends";
              } else {
                showMessage(`Tag not found: ${tag}`);
                state.editMode = false;
                state.pendingTag = null;
                state.focusArea = "releases";
              }
            } catch (err: any) {
              showMessage(`Failed to fetch tag: ${err.message}`);
              state.editMode = false;
              state.pendingTag = null;
              state.focusArea = "releases";
            }
            ctx.scheduleRender();
          })();
        }
        return true;
      } else if (key === "escape" || key === "CTRL_C") {
        state.editMode = false;
        state.editValue = "";
        state.pendingTag = null;
        ctx.setTextInputFocused(false);
        state.focusArea = "releases";
        ctx.scheduleRender();
        return true;
      } else if (key === "BACKSPACE" || key === "DELETE") {
        state.editValue = state.editValue.slice(0, -1);
        ctx.scheduleRender();
        return true;
      } else if (key.length === 1) {
        state.editValue += key;
        ctx.scheduleRender();
        return true;
      }
      return true;
    }

    const focus = state.focusArea;

    if (focus === "list") {
      if (key === "k" || key === "UP") {
        state.selectedIndex = Math.max(0, state.selectedIndex - 1);
        ctx.scheduleRender();
        return true;
      }
      if (key === "j" || key === "DOWN") {
        state.selectedIndex = Math.min(state.versions.length - 1, state.selectedIndex + 1);
        ctx.scheduleRender();
        return true;
      }
      if (key === "g") {
        state.focusArea = "actions";
        state.actionIndex = 0;
        ctx.scheduleRender();
        return true;
      }
      if (key === "return" || key === "enter") {
        if (state.versions.length > 0) {
          executeAction("switch").catch(() => {});
        }
        return true;
      }
    } else if (focus === "actions") {
      if (key === "h" || key === "LEFT") {
        state.actionIndex = Math.max(0, state.actionIndex - 1);
        ctx.scheduleRender();
        return true;
      }
      if (key === "l" || key === "RIGHT") {
        state.actionIndex = Math.min(ACTIONS.length - 1, state.actionIndex + 1);
        ctx.scheduleRender();
        return true;
      }
      if (key === "j" || key === "k" || key === "UP" || key === "DOWN") {
        state.focusArea = "list";
        ctx.scheduleRender();
        return true;
      }
      if (key === "return" || key === "enter") {
        const action = ACTIONS[state.actionIndex];
        executeAction(action).catch(() => {});
        if (state.focusArea === "actions") {
          state.focusArea = "list";
          ctx.scheduleRender();
        }
        return true;
      }
      if (key === "escape") {
        state.focusArea = "list";
        ctx.scheduleRender();
        return true;
      }
    } else if (focus === "releases") {
      if (key === "k" || key === "UP") {
        state.releaseIndex = Math.max(0, state.releaseIndex - 1);
        ctx.scheduleRender();
        return true;
      }
      if (key === "j" || key === "DOWN") {
        state.releaseIndex = Math.min(state.releases.length - 1, state.releaseIndex + 1);
        ctx.scheduleRender();
        return true;
      }
      if (key === "g" || key === "escape") {
        state.focusArea = "list";
        ctx.scheduleRender();
        return true;
      }
      if (key === "e") {
        state.editMode = true;
        state.editValue = "";
        ctx.setTextInputFocused(true);
        ctx.scheduleRender();
        return true;
      }
      if (key === "return" || key === "enter") {
        const currentRelease = state.releases[state.releaseIndex];
        if (!currentRelease) return true;

        const platform = getPlatformKey();
        state.availableBackends = getAvailableBackends(
          currentRelease.tag,
          platform,
          currentRelease.assets,
        );
        state.backendIndex = 0;
        state.pendingTag = null;
        state.focusArea = "backends";
        ctx.scheduleRender();
        return true;
      }
    } else if (focus === "backends") {
      if (key === "k" || key === "UP") {
        state.backendIndex = Math.max(0, state.backendIndex - 1);
        ctx.scheduleRender();
        return true;
      }
      if (key === "j" || key === "DOWN") {
        state.backendIndex = Math.min(state.availableBackends.length - 1, state.backendIndex + 1);
        ctx.scheduleRender();
        return true;
      }
      if (key === "g" || key === "escape") {
        state.focusArea = "releases";
        ctx.scheduleRender();
        return true;
      }
      if (key === "return" || key === "enter") {
        if (state.availableBackends.length > 0) {
          const backend = state.availableBackends[state.backendIndex];
          const currentTag = state.pendingTag || (state.releases[state.releaseIndex]?.tag || "");
          const installedForTag = state.installedBackends[currentTag];
          if (installedForTag && installedForTag.has(backend.id)) {
            showMessage("Backend already installed.");
            return true;
          }
          installSelectedBackend().catch(() => {});
        }
        return true;
      }
    }

    return false;
  }

  function dispose(): void {
    clearMessageTimer();
    resetState(state);
  }

  return {
    render,
    handleKey,
    dispose,
  };
}
