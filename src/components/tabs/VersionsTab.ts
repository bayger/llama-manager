import type { Terminal } from "terminal-kit";
import { themeColors, fg, termWidth } from "../../lib/theme.js";
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

const state: State = {
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

function buildInstalledBackends(versions: VersionInfo[]): Record<string, Set<string>> {
  const map: Record<string, Set<string>> = {};
  for (const v of versions) {
    if (!map[v.tag]) map[v.tag] = new Set();
    map[v.tag].add(v.backend);
  }
  return map;
}

function clearMessageTimer(): void {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
}

function showMessage(msg: string, app: any): void {
  state.message = msg;
  app.showMessage(msg);
  clearMessageTimer();
  state.timer = setInterval(() => {
    state.message = null;
    clearMessageTimer();
  }, 5000);
}

function scheduleRender(app: any): void {
  app.scheduleRender();
}

function renderLine(term: Terminal, y: number, fn: () => void): void {
  term.moveTo(1, y);
  term.eraseLine();
  fn();
}

function renderHeader(term: Terminal, config: ConfigData, startY: number): number {
  let y = startY;
  const width = termWidth(term);
  const sep = "─".repeat(Math.max(0, width - 2));

  renderLine(term, y++, () => {
    term.bold();
    fg(term, themeColors.accent, "┌");
    fg(term, themeColors.accent, sep);
    fg(term, themeColors.accent, "┐");
    term.styleReset();
  });

  const installedCount = state.versions.length;
  const sizeStr = formatSize(state.totalSize);
  const title = ` Versions | ${installedCount} installed | ${sizeStr} used `;
  const padding = Math.max(0, width - 4 - title.length);
  const leftPad = Math.floor(padding / 2);

  renderLine(term, y++, () => {
    fg(term, themeColors.accent, "│");
    term(" ".repeat(leftPad));
    fg(term, themeColors.text, title);
    term(" ".repeat(Math.ceil(padding / 2)));
    fg(term, themeColors.accent, "│");
  });

  const dir = getVersionsDir(config);
  const dirLine = ` Dir: ${dir} `;
  const dirPad = Math.max(0, width - 4 - dirLine.length);
  const dirLeft = Math.floor(dirPad / 2);

  renderLine(term, y++, () => {
    fg(term, themeColors.accent, "│");
    term(" ".repeat(dirLeft));
    fg(term, themeColors.textMuted, dirLine);
    term(" ".repeat(Math.ceil(dirPad / 2)));
    fg(term, themeColors.accent, "│");
  });

  renderLine(term, y++, () => {
    fg(term, themeColors.accent, "└");
    fg(term, themeColors.accent, sep);
    fg(term, themeColors.accent, "┘");
  });

  return y;
}

function renderHelp(term: Terminal, startY: number): number {
  let y = startY;
  const width = termWidth(term);

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

  const pad = Math.max(0, width - 2 - hint.length);
  const left = Math.floor(pad / 2);

  renderLine(term, y++, () => {});
  renderLine(term, y++, () => {
    term(" ".repeat(left));
    fg(term, themeColors.textMuted, hint);
  });

  return y;
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

function renderActionBar(term: Terminal, startY: number): number {
  let y = startY;
  const width = termWidth(term);
  const sep = "─".repeat(Math.max(0, width - 2));

  renderLine(term, y++, () => {});
  renderLine(term, y++, () => {
    fg(term, themeColors.border, "┌");
    fg(term, themeColors.border, sep);
    fg(term, themeColors.border, "┐");
  });

  const actionParts = ACTIONS.map((action, i) => {
    const selected = i === state.actionIndex && state.focusArea === "actions";
    const label = action.charAt(0).toUpperCase() + action.slice(1);
    if (selected) {
      return { bold: true, color: themeColors.accent, text: ` ${label} ` };
    }
    return { bold: false, color: themeColors.text, text: label };
  });

  renderLine(term, y++, () => {
    fg(term, themeColors.border, "│");
    fg(term, themeColors.textMuted, " Actions:");
    term(" ");

    for (let i = 0; i < actionParts.length; i++) {
      const part = actionParts[i];
      if (part.bold) term.bold();
      fg(term, part.color, part.text);
      if (part.bold) term.styleReset();
      if (i < actionParts.length - 1) {
        fg(term, themeColors.textMuted, " │");
        term(" ");
      }
    }

    const usedWidth = 4 + 10 + actionParts.reduce((acc, p) => acc + p.text.length + 3, 0) - 3;
    const remaining = Math.max(0, width - usedWidth - 2);
    term(" ".repeat(remaining));
    fg(term, themeColors.border, "│");
  });

  renderLine(term, y++, () => {
    fg(term, themeColors.border, "└");
    fg(term, themeColors.border, sep);
    fg(term, themeColors.border, "┘");
  });

  return y;
}

function renderReleases(term: Terminal, startY: number): number {
  let y = startY;
  const width = termWidth(term);
  const sep = "─".repeat(Math.max(0, width - 2));

  renderLine(term, y++, () => {});
  renderLine(term, y++, () => {
    fg(term, themeColors.border, "┌");
    fg(term, themeColors.border, sep);
    fg(term, themeColors.border, "┐");
  });

  renderLine(term, y++, () => {
    fg(term, themeColors.border, "│");
    fg(term, themeColors.textMuted, " Available releases │ j/k navigate │ Enter select │ g back │ e custom tag");
    const headerLen = 4 + " Available releases │ j/k navigate │ Enter select │ g back │ e custom tag".length;
    const headerPad = Math.max(0, width - headerLen - 2);
    term(" ".repeat(headerPad));
    fg(term, themeColors.border, "│");
  });

  renderLine(term, y++, () => {
    fg(term, themeColors.border, "├");
    fg(term, themeColors.border, sep);
    fg(term, themeColors.border, "┤");
  });

  if (state.fetchingReleases) {
    renderLine(term, y++, () => {
      fg(term, themeColors.border, "│");
      fg(term, themeColors.textMuted, " Fetching releases...");
      term(" ".repeat(Math.max(0, width - 24)));
      fg(term, themeColors.border, "│");
    });
  } else if (state.releases.length === 0) {
    renderLine(term, y++, () => {
      fg(term, themeColors.border, "│");
      fg(term, themeColors.textMuted, " No releases found.");
      term(" ".repeat(Math.max(0, width - 24)));
      fg(term, themeColors.border, "│");
    });
  } else {
    for (let i = 0; i < state.releases.length; i++) {
      const r = state.releases[i];
      const selected = i === state.releaseIndex;
      const date = new Date(r.publishedAt).toISOString().split("T")[0];
      const line = ` ${r.tag.padEnd(12)} ${date}  ${r.assets.length} assets`;

      renderLine(term, y++, () => {
        fg(term, themeColors.border, "│");
        if (selected) {
          term.bold();
          fg(term, themeColors.accent, line);
          term.styleReset();
        } else {
          fg(term, themeColors.text, line);
        }
        const pad = Math.max(0, width - line.length - 4);
        term(" ".repeat(pad));
        fg(term, themeColors.border, "│");
      });
    }
  }

  renderLine(term, y++, () => {
    fg(term, themeColors.border, "└");
    fg(term, themeColors.border, sep);
    fg(term, themeColors.border, "┘");
  });

  return y;
}

function renderBackends(term: Terminal, startY: number): number {
  let y = startY;
  const width = termWidth(term);
  const sep = "─".repeat(Math.max(0, width - 2));
  const currentRelease = state.releases[state.releaseIndex];
  const tag = currentRelease ? currentRelease.tag : state.pendingTag || "";

  renderLine(term, y++, () => {});
  renderLine(term, y++, () => {
    fg(term, themeColors.border, "┌");
    fg(term, themeColors.border, sep);
    fg(term, themeColors.border, "┐");
  });

  const header = ` Select backend ${tag} │ j/k navigate │ Enter install │ g back `;
  renderLine(term, y++, () => {
    fg(term, themeColors.border, "│");
    fg(term, themeColors.textMuted, header);
    const hPad = Math.max(0, width - header.length - 4);
    term(" ".repeat(hPad));
    fg(term, themeColors.border, "│");
  });

  renderLine(term, y++, () => {
    fg(term, themeColors.border, "├");
    fg(term, themeColors.border, sep);
    fg(term, themeColors.border, "┤");
  });

  const backends = state.availableBackends;
  const installedForTag = state.installedBackends[tag];

  for (let i = 0; i < backends.length; i++) {
    const b = backends[i];
    const selected = i === state.backendIndex;
    const alreadyInstalled = installedForTag && installedForTag.has(b.id);
    let line = ` ${b.label}`;
    if (alreadyInstalled) {
      line += " [installed]";
    }

    renderLine(term, y++, () => {
      fg(term, themeColors.border, "│");
      if (selected) {
        term.bold();
        fg(term, themeColors.accent, line);
        term.styleReset();
      } else if (alreadyInstalled) {
        fg(term, themeColors.textMuted, line);
      } else {
        fg(term, themeColors.text, line);
      }
      const pad = Math.max(0, width - line.length - 4);
      term(" ".repeat(pad));
      fg(term, themeColors.border, "│");
    });
  }

  if (backends.length === 0) {
    renderLine(term, y++, () => {
      fg(term, themeColors.border, "│");
      fg(term, themeColors.textMuted, " No backends available for this platform.");
      term(" ".repeat(Math.max(0, width - 54)));
      fg(term, themeColors.border, "│");
    });
  }

  renderLine(term, y++, () => {
    fg(term, themeColors.border, "└");
    fg(term, themeColors.border, sep);
    fg(term, themeColors.border, "┘");
  });

  return y;
}

function renderProgressBar(term: Terminal, startY: number): number {
  let y = startY;
  if (!state.installing) return y;

  const width = termWidth(term);
  const barWidth = Math.min(width - 10, 60);
  const filled = Math.round((state.installProgress / 100) * barWidth);
  const empty = barWidth - filled;

  renderLine(term, y++, () => {});
  renderLine(term, y++, () => {
    const spinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"][Math.floor(Date.now() / 100) % 10];
    fg(term, themeColors.accent, spinner);
    fg(term, themeColors.text, ` Installing... ${state.installLabel} (${state.installProgress}%)`);
  });

  renderLine(term, y++, () => {
    fg(term, themeColors.success, "█".repeat(filled));
    fg(term, themeColors.textMuted, "░".repeat(empty));
  });

  return y;
}

function renderEditMode(term: Terminal, startY: number): number {
  let y = startY;
  const width = termWidth(term);
  const prompt = ` Tag: ${state.editValue}`;

  renderLine(term, y++, () => {});
  renderLine(term, y++, () => {
    fg(term, themeColors.accent, "┌");
    fg(term, themeColors.accent, "─".repeat(Math.max(0, width - 2)));
    fg(term, themeColors.accent, "┐");
  });
  renderLine(term, y++, () => {
    fg(term, themeColors.accent, "│");
    term.bold();
    fg(term, themeColors.text, prompt);
    term.styleReset();
    const pad = Math.max(0, width - prompt.length - 4);
    term(" ".repeat(pad));
    fg(term, themeColors.accent, "│");
  });
  renderLine(term, y++, () => {
    fg(term, themeColors.accent, "└");
    fg(term, themeColors.accent, "─".repeat(Math.max(0, width - 2)));
    fg(term, themeColors.accent, "┘");
  });

  return y;
}

function initIfNeeded(app: any): void {
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
      scheduleRender(app);
    })();
  }
}

export function render(app: any): void {
  const term = app.term as Terminal;
  initIfNeeded(app);

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
    y = renderActionBar(term, y);
  } else if (state.focusArea === "actions") {
    y = renderVersionList(term, y);
    y = renderActionBar(term, y);
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

async function executeAction(action: string, app: any): Promise<void> {
  if (!state.config) return;

  switch (action) {
    case "switch": {
      if (state.versions.length === 0) {
        showMessage("No versions installed.", app);
        return;
      }
      const v = state.versions[state.selectedIndex];
      if (!v) {
        showMessage("No version selected.", app);
        return;
      }
      try {
        state.config = await switchVersion(state.config, v.version);
        await saveConfig(state.config);
        state.versions = await listVersions(state.config);
        state.installedBackends = buildInstalledBackends(state.versions);
        showMessage(`Switched to ${v.version}`, app);
      } catch (err: any) {
        showMessage(`Switch failed: ${err.message}`, app);
      }
      scheduleRender(app);
      break;
    }

    case "uninstall": {
      if (state.versions.length === 0) {
        showMessage("No versions installed.", app);
        return;
      }
      const v = state.versions[state.selectedIndex];
      if (!v) {
        showMessage("No version selected.", app);
        return;
      }
      if (v.active) {
        showMessage("Cannot uninstall active version.", app);
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
        showMessage(`Uninstalled ${v.version}`, app);
      } catch (err: any) {
        showMessage(`Uninstall failed: ${err.message}`, app);
      }
      scheduleRender(app);
      break;
    }

    case "check": {
      try {
        app.showMessage("Checking for updates...");
        const latest = await checkLatestVersion();
        const activeVersion = state.config.activeVersion;
        if (activeVersion && activeVersion.startsWith(latest.split("-")[0])) {
          showMessage(`Already on latest: ${latest}`, app);
        } else {
          showMessage(`Latest version: ${latest} (current: ${activeVersion || "none"})`, app);
        }
      } catch (err: any) {
        showMessage(`Check failed: ${err.message}`, app);
      }
      break;
    }

    case "install": {
      state.focusArea = "releases";
      state.releaseIndex = 0;
      state.fetchingReleases = true;
      app.showMessage("Fetching releases...");
      scheduleRender(app);
      try {
        state.releases = await listRecentVersions(20);
      } catch (err: any) {
        showMessage(`Failed to fetch releases: ${err.message}`, app);
        state.focusArea = "list";
      }
      state.fetchingReleases = false;
      scheduleRender(app);
      break;
    }
  }
}

async function installSelectedBackend(app: any): Promise<void> {
  const currentRelease = state.releases[state.releaseIndex];
  const backend = state.availableBackends[state.backendIndex];

  if (!currentRelease || !backend) {
    showMessage("No release or backend selected.", app);
    return;
  }

  if (!state.config) return;

  const tag = state.pendingTag || currentRelease.tag;

  state.installing = true;
  state.installProgress = 0;
  state.installLabel = "";
  app.setTextInputFocused(false);
  app.showMessage(`Installing ${tag} (${backend.label})...`);
  scheduleRender(app);

  try {
    const result = await installVersion(state.config, tag, backend.id, (pct, label) => {
      state.installProgress = pct;
      state.installLabel = label;
      scheduleRender(app);
    });

    state.config.activeVersion = result;
    await saveConfig(state.config);
    state.versions = await listVersions(state.config);
    state.totalSize = await getTotalVersionsSize(state.config);
    state.installedBackends = buildInstalledBackends(state.versions);
    showMessage(`Installed and activated ${result}`, app);
    state.focusArea = "list";
    state.selectedIndex = 0;
  } catch (err: any) {
    showMessage(`Install failed: ${err.message}`, app);
  } finally {
    state.installing = false;
    state.installProgress = 0;
    state.installLabel = "";
  }
  scheduleRender(app);
}

export function handleKey(app: any, key: string): boolean {
  if (state.installing) {
    return true;
  }

  if (state.editMode) {
    if (key === "return" || key === "enter") {
      const tag = state.editValue.trim();
      if (tag) {
        state.pendingTag = tag;
        state.editMode = false;
        app.setTextInputFocused(false);

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
              showMessage(`Tag not found: ${tag}`, app);
              state.editMode = false;
              state.pendingTag = null;
              state.focusArea = "releases";
            }
          } catch (err: any) {
            showMessage(`Failed to fetch tag: ${err.message}`, app);
            state.editMode = false;
            state.pendingTag = null;
            state.focusArea = "releases";
          }
          scheduleRender(app);
        })();
      }
      return true;
    } else if (key === "escape" || key === "CTRL_C") {
      state.editMode = false;
      state.editValue = "";
      state.pendingTag = null;
      app.setTextInputFocused(false);
      state.focusArea = "releases";
      scheduleRender(app);
      return true;
    } else if (key === "BACKSPACE" || key === "DELETE") {
      state.editValue = state.editValue.slice(0, -1);
      scheduleRender(app);
      return true;
    } else if (key.length === 1) {
      state.editValue += key;
      scheduleRender(app);
      return true;
    }
    return true;
  }

  const focus = state.focusArea;

  if (focus === "list") {
    if (key === "k" || key === "UP") {
      state.selectedIndex = Math.max(0, state.selectedIndex - 1);
      scheduleRender(app);
      return true;
    }
    if (key === "j" || key === "DOWN") {
      state.selectedIndex = Math.min(state.versions.length - 1, state.selectedIndex + 1);
      scheduleRender(app);
      return true;
    }
    if (key === "g") {
      state.focusArea = "actions";
      state.actionIndex = 0;
      scheduleRender(app);
      return true;
    }
    if (key === "return" || key === "enter") {
      if (state.versions.length > 0) {
        executeAction("switch", app).catch(() => {});
      }
      return true;
    }
  } else if (focus === "actions") {
    if (key === "h" || key === "LEFT") {
      state.actionIndex = Math.max(0, state.actionIndex - 1);
      scheduleRender(app);
      return true;
    }
    if (key === "l" || key === "RIGHT") {
      state.actionIndex = Math.min(ACTIONS.length - 1, state.actionIndex + 1);
      scheduleRender(app);
      return true;
    }
    if (key === "j" || key === "k" || key === "UP" || key === "DOWN") {
      state.focusArea = "list";
      scheduleRender(app);
      return true;
    }
    if (key === "return" || key === "enter") {
      const action = ACTIONS[state.actionIndex];
      executeAction(action, app).catch(() => {});
      if (state.focusArea === "actions") {
        state.focusArea = "list";
        scheduleRender(app);
      }
      return true;
    }
    if (key === "escape") {
      state.focusArea = "list";
      scheduleRender(app);
      return true;
    }
  } else if (focus === "releases") {
    if (key === "k" || key === "UP") {
      state.releaseIndex = Math.max(0, state.releaseIndex - 1);
      scheduleRender(app);
      return true;
    }
    if (key === "j" || key === "DOWN") {
      state.releaseIndex = Math.min(state.releases.length - 1, state.releaseIndex + 1);
      scheduleRender(app);
      return true;
    }
    if (key === "g" || key === "escape") {
      state.focusArea = "list";
      scheduleRender(app);
      return true;
    }
    if (key === "e") {
      state.editMode = true;
      state.editValue = "";
      app.setTextInputFocused(true);
      scheduleRender(app);
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
      scheduleRender(app);
      return true;
    }
  } else if (focus === "backends") {
    if (key === "k" || key === "UP") {
      state.backendIndex = Math.max(0, state.backendIndex - 1);
      scheduleRender(app);
      return true;
    }
    if (key === "j" || key === "DOWN") {
      state.backendIndex = Math.min(state.availableBackends.length - 1, state.backendIndex + 1);
      scheduleRender(app);
      return true;
    }
    if (key === "g" || key === "escape") {
      state.focusArea = "releases";
      scheduleRender(app);
      return true;
    }
    if (key === "return" || key === "enter") {
      if (state.availableBackends.length > 0) {
        const backend = state.availableBackends[state.backendIndex];
        const currentTag = state.pendingTag || (state.releases[state.releaseIndex]?.tag || "");
        const installedForTag = state.installedBackends[currentTag];
        if (installedForTag && installedForTag.has(backend.id)) {
          showMessage("Backend already installed.", app);
          return true;
        }
        installSelectedBackend(app).catch(() => {});
      }
      return true;
    }
  }

  return false;
}

export function dispose(): void {
  clearMessageTimer();
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
