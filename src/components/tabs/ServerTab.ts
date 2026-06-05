import type { Terminal } from "terminal-kit";
import { themeColors, fg, termWidth, termHeight, renderBox, renderLine } from "../../lib/theme.js";
import {
  loadConfig,
  saveConfig,
  getActivePresets,
  getActiveFreeFormArgs,
  PRESET_CATEGORIES,
  ConfigData,
  PresetFieldDef,
} from "../../lib/config.js";
import { startServer, stopServer, getStatus, listDevices } from "../../lib/server.js";

const CONTROLS = ["Start", "Stop", "Restart", "Create", "Rename", "Delete", "Devices"];

interface ServerTabState {
  config: ConfigData | null;
  serverState: "stopped" | "starting" | "running" | "stopping";
  pid: number | null;
  uptime: number;
  focusArea: "controls" | "form";
  controlIndex: number;
  collapsed: Set<number>;
  selectedIndex: number;
  scrollOffset: number;
  editMode: boolean;
  editKey: string | null;
  editFieldCategory: number | null;
  editFieldIndex: number | null;
  editValue: string;
  devicesOutput: string | null;
  statusInterval: ReturnType<typeof setInterval> | null;
  spinnerIndex: number;
  loading: boolean;
  renderApp: any;
}

const state: ServerTabState = {
  config: null,
  serverState: "stopped",
  pid: null,
  uptime: 0,
  focusArea: "controls",
  controlIndex: 0,
  collapsed: new Set(),
  selectedIndex: 0,
  scrollOffset: 0,
  editMode: false,
  editKey: null,
  editFieldCategory: null,
  editFieldIndex: null,
  editValue: "",
  devicesOutput: null,
  statusInterval: null,
  spinnerIndex: 0,
  loading: false,
  renderApp: null,
};

function formatUptime(ms: number): string {
  if (ms < 0) return "0s";
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m ${s}s`;
}

type FormRowType = "catHeader" | "field" | "spacer" | "freeHeader" | "freeArg" | "freeNone";

interface FormRow {
  type: FormRowType;
  categoryIndex?: number;
  fieldIndex?: number;
  field?: PresetFieldDef;
  value?: unknown;
  argIndex?: number;
  isFieldSelectable: boolean;
  globalFieldIndex?: number;
}

function buildFormRows(config: ConfigData): FormRow[] {
  const presets = getActivePresets(config);
  const rows: FormRow[] = [];
  let globalFieldIdx = 0;

  for (let ci = 0; ci < PRESET_CATEGORIES.length; ci++) {
    const cat = PRESET_CATEGORIES[ci];
    const presetData = presets[cat.presetKey];
    const isCollapsed = state.collapsed.has(ci);

    let visibleCount = 0;
    for (const field of cat.fields) {
      const value = presetData?.[field.key];
      if (value !== null && value !== undefined) visibleCount++;
      else if (field.type === "boolean") visibleCount++;
    }

    rows.push({ type: "catHeader", categoryIndex: ci, isFieldSelectable: false });

    if (isCollapsed) continue;

    for (let fi = 0; fi < cat.fields.length; fi++) {
      const field = cat.fields[fi];
      const value = presetData?.[field.key];
      if ((value === null || value === undefined) && field.type !== "boolean") continue;
      rows.push({
        type: "field",
        categoryIndex: ci,
        fieldIndex: fi,
        field,
        value,
        isFieldSelectable: true,
        globalFieldIndex: globalFieldIdx++,
      });
    }
  }

  rows.push({ type: "spacer", isFieldSelectable: false });
  rows.push({ type: "freeHeader", isFieldSelectable: false });

  const freeFormArgs = getActiveFreeFormArgs(config);
  if (freeFormArgs.length === 0) {
    rows.push({ type: "freeNone", isFieldSelectable: false });
  } else {
    for (let ai = 0; ai < freeFormArgs.length; ai++) {
      rows.push({ type: "freeArg", argIndex: ai, isFieldSelectable: false });
    }
  }

  return rows;
}

function countVisibleFields(config: ConfigData): number {
  return buildFormRows(config).filter(r => r.isFieldSelectable).length;
}

function getRowIndexOfField(config: ConfigData, fieldIndex: number): number {
  const rows = buildFormRows(config);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].isFieldSelectable && rows[i].globalFieldIndex === fieldIndex) return i;
  }
  return -1;
}

function getFormRowsCount(config: ConfigData): number {
  return buildFormRows(config).length;
}

function getVisibleFieldAt(config: ConfigData, index: number): { categoryIndex: number; fieldIndex: number; field: PresetFieldDef; value: unknown } | null {
  const rows = buildFormRows(config);
  for (const row of rows) {
    if (row.isFieldSelectable && row.globalFieldIndex === index) {
      return {
        categoryIndex: row.categoryIndex!,
        fieldIndex: row.fieldIndex!,
        field: row.field!,
        value: row.value,
      };
    }
  }
  return null;
}

function getFormViewportHeight(term: Terminal): number {
  // Tab content starts at row 3 (App tabs: rows 1-2). App status bar at last row.
  // Fixed: header(4) + controls(2) + help(1) + status(1) = 8
  const availableLines = Math.max(2, termHeight(term) - 3 - 8);
  return availableLines;
}

function clampScrollOffset(config: ConfigData, viewportHeight: number): void {
  const totalRows = getFormRowsCount(config);
  const maxOffset = Math.max(0, totalRows - viewportHeight);
  state.scrollOffset = Math.max(0, Math.min(state.scrollOffset, maxOffset));
}

function ensureFieldInViewport(config: ConfigData, viewportHeight: number): void {
  if (!state.editMode || state.editFieldCategory === null || state.editFieldIndex === null) return;
  const rows = buildFormRows(config);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.type === "field" && row.categoryIndex === state.editFieldCategory && row.fieldIndex === state.editFieldIndex) {
      if (i < state.scrollOffset) {
        state.scrollOffset = i;
      } else if (i >= state.scrollOffset + viewportHeight) {
        state.scrollOffset = i - viewportHeight + 1;
      }
      clampScrollOffset(config, viewportHeight);
      return;
    }
  }
}

function updateStatus(): void {
  const status = getStatus();
  if (status.running) {
    state.serverState = "running";
    state.pid = status.pid;
    state.uptime = status.uptime;
  } else {
    if (state.serverState === "starting" || state.serverState === "running") {
      state.serverState = "stopped";
    }
    state.pid = null;
    state.uptime = 0;
  }
}

function startStatusPolling(): void {
  if (state.statusInterval) clearInterval(state.statusInterval);
  state.statusInterval = setInterval(() => {
    updateStatus();
  }, 1000);
  updateStatus();
}

function stopStatusPolling(): void {
  if (state.statusInterval) {
    clearInterval(state.statusInterval);
    state.statusInterval = null;
  }
}

function renderHeader(term: Terminal, startY: number): number {
  const width = termWidth(term);
  const innerW = width - 2;

  const statusDot = state.serverState === "starting" || state.serverState === "stopping"
    ? ["-", "\\", "|", "/"][state.spinnerIndex % 4]
    : "\u25cf";

  const statusText =
    state.serverState === "running" ? "running" :
    state.serverState === "starting" ? "starting" :
    state.serverState === "stopping" ? "stopping" : "stopped";

  const pidText = state.pid ? `PID: ${state.pid}` : "";
  const uptimeText = state.uptime > 0 ? `Uptime: ${formatUptime(state.uptime)}` : "";

  let headerLine = ` Server │ ${statusDot} ${statusText}`;
  if (pidText) headerLine += ` │ ${pidText}`;
  if (uptimeText) headerLine += ` │ ${uptimeText}`;

  const version = state.config?.activeVersion || "none";
  let host = "127.0.0.1";
  let port = 8080;
  if (state.config) {
    const p = getActivePresets(state.config);
    host = String(p.server?.host || "127.0.0.1");
    port = Number(p.server?.port || 8080);
  }
  const url = `http://${host}:${port}`;
  const infoLine = ` Version: ${version} │ URL: ${url} `;

  return renderBox({ term, width, borderColor: themeColors.accent, startY }, [
    {
      render: () => {
        term.bold();
        fg(term, themeColors.text, headerLine.trim());
        term.styleReset();
        const pad = Math.max(0, innerW - headerLine.trim().length);
        term(" ".repeat(pad));
      },
    },
    {
      render: () => {
        fg(term, themeColors.textMuted, infoLine);
        const pad = Math.max(0, innerW - infoLine.length);
        term(" ".repeat(pad));
      },
    },
  ]);
}

function renderControlsBar(term: Terminal, startY: number): number {
  const activeProfile = state.config?.server?.activeProfile || "Default";
  const profiles = state.config?.server?.profiles || {};
  const profileNames = Object.keys(profiles);

  let profileLine = `Profile: ${activeProfile}`;
  if (profileNames.length > 1) {
    profileLine += ` (${profileNames.length})`;
  }

  renderLine(term, startY, () => {
    fg(term, themeColors.textMuted, "  ");
    fg(term, themeColors.textMuted, profileLine);
  });

  renderLine(term, startY + 1, () => {
    fg(term, themeColors.textMuted, "  ");
    for (let i = 0; i < CONTROLS.length; i++) {
      const selected = i === state.controlIndex && state.focusArea === "controls";
      const ctrl = CONTROLS[i];
      if (i > 0) fg(term, themeColors.textMuted, " │");
      if (selected) {
        term.bold();
        fg(term, themeColors.selected, ` ${ctrl} `);
        term.styleReset();
      } else {
        fg(term, themeColors.text, ctrl);
      }
    }
  });

  return startY + 2;
}

function renderHelp(term: Terminal, startY: number): number {
  const width = termWidth(term);
  let hint = "";

  if (state.editMode) {
    if (state.editKey === "create") {
      hint = ` Profile name: ${state.editValue} │ Enter confirm │ Ctrl+C cancel `;
    } else if (state.editKey === "rename") {
      hint = ` New name: ${state.editValue} │ Enter confirm │ Ctrl+C cancel `;
    } else {
      hint = ` Value: ${state.editValue} │ Enter confirm │ Ctrl+C cancel `;
    }
  } else if (state.focusArea === "controls") {
    hint = " h/l controls │ j down to form │ Enter execute │ g form ";
  } else {
    hint = " j/k navigate │ Enter edit/toggle │ g controls │ space collapse │ Ctrl+D/U pg ";
  }

  const pad = Math.max(0, width - 2 - hint.length);
  const left = Math.floor(pad / 2);

  renderLine(term, startY, () => {
    term(" ".repeat(left));
    fg(term, themeColors.textMuted, hint);
  });

  return startY + 1;
}

function renderForm(term: Terminal, startY: number): number {
  if (!state.config) return startY;

  const presets = getActivePresets(state.config);
  const rows = buildFormRows(state.config);
  const totalRows = rows.length;

  const availableLines = getFormViewportHeight(term);
  const hasOverflow = totalRows > availableLines;
  const indicatorLines = hasOverflow ? 2 : 0;
  const viewportHeight = Math.max(1, availableLines - indicatorLines);

  clampScrollOffset(state.config, viewportHeight);
  ensureFieldInViewport(state.config, viewportHeight);

  const scrollStart = state.scrollOffset;
  const scrollEnd = Math.min(scrollStart + viewportHeight, totalRows);
  const showScrollUp = state.scrollOffset > 0;
  const showScrollDown = scrollEnd < totalRows;

  let y = startY;

  // Scroll up indicator
  if (showScrollUp) {
    renderLine(term, y, () => {
      fg(term, themeColors.textMuted, "  \u25b2");
    });
    y++;
  }

  for (let ri = scrollStart; ri < scrollEnd; ri++) {
    const row = rows[ri]!;

    if (row.type === "catHeader") {
      const cat = PRESET_CATEGORIES[row.categoryIndex!]!;
      const presetData = presets[cat.presetKey];
      const isCollapsed = state.collapsed.has(row.categoryIndex!);

      let visibleCount = 0;
      for (const field of cat.fields) {
        const value = presetData?.[field.key];
        if (value !== null && value !== undefined) visibleCount++;
        else if (field.type === "boolean") visibleCount++;
      }

      const arrow = isCollapsed ? "\u25b6" : "\u25bc";
      renderLine(term, y, () => {
        term.bold();
        fg(term, themeColors.accent, ` ${arrow} ${cat.name} (${visibleCount})`);
        term.styleReset();
      });

    } else if (row.type === "field") {
      const field = row.field!;
      const cat = PRESET_CATEGORIES[row.categoryIndex!]!;
      const value = presets[cat.presetKey]?.[field.key] ?? row.value;
      const selected = row.globalFieldIndex === state.selectedIndex && state.focusArea === "form" && !state.editMode;
      const isEditing = state.editMode && state.editFieldCategory === row.categoryIndex && state.editFieldIndex === row.fieldIndex;

      let displayValue: string;
      if (field.type === "boolean") {
        displayValue = value ? "[on] " : "[off] ";
      } else {
        displayValue = String(value ?? "");
      }

      const flagPadded = field.flag.padEnd(22);

      renderLine(term, y, () => {
        if (isEditing) {
          term.bold();
          fg(term, themeColors.selectedText, `   ${flagPadded} `);
          fg(term, themeColors.selected, state.editValue);
          term.styleReset();
        } else if (selected) {
          term.bold();
          fg(term, themeColors.selectedText, `   ${flagPadded} `);
          term.styleReset();
          fg(term, themeColors.selected, displayValue);
          if (field.type !== "boolean") {
            fg(term, themeColors.selected, " [edit]");
          }
        } else {
          fg(term, themeColors.textMuted, `   ${flagPadded} `);
          if (field.type === "boolean") {
            fg(term, value ? themeColors.success : themeColors.textMuted, displayValue);
          } else if (value === null || value === undefined) {
            fg(term, themeColors.textMuted, "(default)");
          } else {
            fg(term, themeColors.text, displayValue);
          }
        }
      });

    } else if (row.type === "spacer") {
      renderLine(term, y, () => {});

    } else if (row.type === "freeHeader") {
      renderLine(term, y, () => {
        term.bold();
        fg(term, themeColors.accent, " Free-form args (arbitrary flags)");
        term.styleReset();
      });

    } else if (row.type === "freeNone") {
      renderLine(term, y, () => {
        fg(term, themeColors.textMuted, "   None configured");
      });

    } else if (row.type === "freeArg") {
      const freeFormArgs = getActiveFreeFormArgs(state.config);
      renderLine(term, y, () => {
        fg(term, themeColors.text, `   ${freeFormArgs[row.argIndex!]}`);
      });
    }

    y++;
  }

  // Scroll down indicator
  if (showScrollDown) {
    renderLine(term, y, () => {
      fg(term, themeColors.textMuted, "  \u25bc");
    });
    y++;
  }

  return y;
}

function renderDevicesOutput(term: Terminal): void {
  if (!state.devicesOutput) return;

  const width = termWidth(term);
  const sep = "\u2500".repeat(Math.max(0, width - 2));

  let y = 3;

  renderLine(term, y++, () => {
    fg(term, themeColors.border, "\u250c");
    fg(term, themeColors.border, sep);
    fg(term, themeColors.border, "\u2510");
  });

  renderLine(term, y++, () => {
    fg(term, themeColors.border, "\u2502");
    term.bold();
    fg(term, themeColors.accent, " Device Info");
    term.styleReset();
    const headerPad = Math.max(0, width - 15);
    term(" ".repeat(headerPad));
    fg(term, themeColors.border, "\u2502");
  });

  renderLine(term, y++, () => {
    fg(term, themeColors.border, "\u251c");
    fg(term, themeColors.border, sep);
    fg(term, themeColors.border, "\u2524");
  });

  const lines = state.devicesOutput.split("\n");
  for (const line of lines) {
    renderLine(term, y++, () => {
      fg(term, themeColors.border, "\u2502");
      fg(term, themeColors.text, ` ${line}`);
      const pad = Math.max(0, width - 4 - line.length);
      term(" ".repeat(pad));
      fg(term, themeColors.border, "\u2502");
    });
  }

  renderLine(term, y++, () => {
    fg(term, themeColors.border, "\u2514");
    fg(term, themeColors.border, sep);
    fg(term, themeColors.border, "\u2518");
  });

  renderLine(term, y++, () => {
    fg(term, themeColors.textMuted, "  Press any key to dismiss");
  });
}

function fireAsync(fn: () => Promise<void>, app: any): void {
  fn().catch((err) => {
    app.showMessage(`Error: ${err.message}`);
  });
}

function executeControl(controlIndex: number, app: any): void {
  if (!state.config) {
    app.showMessage("No configuration loaded");
    return;
  }

  const control = CONTROLS[controlIndex];

  switch (control) {
    case "Start": {
      if (state.serverState === "running" || state.serverState === "starting") {
        app.showMessage("Server already running");
        return;
      }
      if (!state.config.activeVersion) {
        app.showMessage("No active version selected. Install one from the Versions tab.");
        return;
      }
      const startConfig = state.config;
      fireAsync(async () => {
        state.serverState = "starting";
        const pid = await startServer(startConfig);
        state.pid = pid;
        state.uptime = 0;
        state.serverState = "running";
        startStatusPolling();
        app.showMessage(`Server started (PID ${pid})`);
      }, app);
      break;
    }

    case "Stop": {
      if (state.serverState !== "running") {
        app.showMessage("Server not running");
        return;
      }
      fireAsync(async () => {
        state.serverState = "stopping";
        await stopServer();
        state.serverState = "stopped";
        state.pid = null;
        state.uptime = 0;
        stopStatusPolling();
        app.showMessage("Server stopped");
      }, app);
      break;
    }

    case "Restart": {
      if (state.serverState !== "running") {
        app.showMessage("Server not running");
        return;
      }
      if (!state.config.activeVersion) {
        app.showMessage("No active version selected");
        return;
      }
      fireAsync(async () => {
        state.serverState = "stopping";
        await stopServer();
        if (!state.config) return;
        state.serverState = "starting";
        const pid = await startServer(state.config);
        state.pid = pid;
        state.uptime = 0;
        state.serverState = "running";
        startStatusPolling();
        app.showMessage(`Server restarted (PID ${pid})`);
      }, app);
      break;
    }

    case "Create": {
      state.editMode = true;
      state.editKey = "create";
      state.editValue = "";
      state.editFieldCategory = null;
      state.editFieldIndex = null;
      app.setTextInputFocused(true);
      break;
    }

    case "Rename": {
      state.editMode = true;
      state.editKey = "rename";
      state.editValue = state.config.server.activeProfile;
      state.editFieldCategory = null;
      state.editFieldIndex = null;
      app.setTextInputFocused(true);
      break;
    }

    case "Delete": {
      const profiles = state.config.server.profiles;
      if (Object.keys(profiles).length <= 1) {
        app.showMessage("Cannot delete the last profile");
        return;
      }
      fireAsync(async () => {
        const activeProfile = state.config!.server.activeProfile;
        delete profiles[activeProfile];
        state.config!.server.activeProfile = Object.keys(profiles)[0]!;
        state.selectedIndex = 0;
        await saveConfig(state.config!);
        app.showMessage(`Deleted profile "${activeProfile}"`);
      }, app);
      break;
    }

    case "Devices": {
      if (!state.config.activeVersion) {
        app.showMessage("No active version selected");
        return;
      }
      try {
        state.devicesOutput = listDevices(state.config);
        app.showMessage("Device info loaded");
      } catch (err: any) {
        app.showMessage(`Failed to list devices: ${err.message}`);
      }
      break;
    }
  }
}

function submitEdit(app: any): void {
  if (!state.config) return;

  if (state.editKey === "create") {
    const name = state.editValue.trim();
    if (!name) {
      cancelEdit(app);
      app.showMessage("Profile name cannot be empty");
      return;
    }
    if (state.config.server.profiles[name]) {
      cancelEdit(app);
      app.showMessage(`Profile "${name}" already exists`);
      return;
    }
    fireAsync(async () => {
      const activeProfile = state.config!.server.activeProfile;
      const source = state.config!.server.profiles[activeProfile];
      state.config!.server.profiles[name] = {
        presets: JSON.parse(JSON.stringify(source.presets)),
        freeFormArgs: [...source.freeFormArgs],
      };
      state.config!.server.activeProfile = name;
      await saveConfig(state.config!);
      cancelEdit(app);
      app.showMessage(`Created profile "${name}"`);
    }, app);
  } else if (state.editKey === "rename") {
    const name = state.editValue.trim();
    if (!name) {
      cancelEdit(app);
      app.showMessage("Profile name cannot be empty");
      return;
    }
    if (state.config.server.profiles[name]) {
      cancelEdit(app);
      app.showMessage(`Profile "${name}" already exists`);
      return;
    }
    fireAsync(async () => {
      const oldName = state.config!.server.activeProfile;
      state.config!.server.profiles[name] = state.config!.server.profiles[oldName];
      delete state.config!.server.profiles[oldName];
      state.config!.server.activeProfile = name;
      await saveConfig(state.config!);
      cancelEdit(app);
      app.showMessage(`Renamed profile to "${name}"`);
    }, app);
  } else if (state.editKey === "field" && state.editFieldCategory !== null && state.editFieldIndex !== null) {
    const cat = PRESET_CATEGORIES[state.editFieldCategory];
    const field = cat.fields[state.editFieldIndex];
    let newValue: unknown;

    if (field.type === "number") {
      const num = Number(state.editValue);
      if (isNaN(num)) {
        app.showMessage("Invalid number");
        return;
      }
      newValue = num;
    } else if (field.type === "enum") {
      if (field.options && !field.options.includes(state.editValue)) {
        app.showMessage(`Invalid option. Choose from: ${field.options.join(", ")}`);
        return;
      }
      newValue = state.editValue;
    } else {
      newValue = state.editValue === "" ? null : state.editValue;
    }

    fireAsync(async () => {
      const profile = state.config!.server.profiles[state.config!.server.activeProfile];
      if (profile) {
        profile.presets[cat.presetKey][field.key] = newValue;
      }
      await saveConfig(state.config!);
      cancelEdit(app);
      app.showMessage(`Updated ${field.flag} = ${newValue}`);
    }, app);
  }
}

function cancelEdit(app: any): void {
  state.editMode = false;
  state.editKey = null;
  state.editValue = "";
  state.editFieldCategory = null;
  state.editFieldIndex = null;
  app.setTextInputFocused(false);
}

function startFieldEdit(categoryIndex: number, fieldIndex: number, field: PresetFieldDef, value: unknown, app: any): void {
  state.editMode = true;
  state.editKey = "field";
  state.editFieldCategory = categoryIndex;
  state.editFieldIndex = fieldIndex;
  state.editValue = value !== null && value !== undefined ? String(value) : "";
  app.setTextInputFocused(true);
}

function handleFormEnter(app: any): void {
  if (!state.config) return;
  const fieldInfo = getVisibleFieldAt(state.config, state.selectedIndex);
  if (!fieldInfo) return;

  if (fieldInfo.field.type === "boolean") {
    const cat = PRESET_CATEGORIES[fieldInfo.categoryIndex];
    const presetKey = cat.presetKey;
    const profile = state.config.server.profiles[state.config.server.activeProfile];
    if (profile) {
      const currentVal = profile.presets[presetKey][fieldInfo.field.key];
      profile.presets[presetKey][fieldInfo.field.key] = !currentVal;
    }
    fireAsync(async () => {
      await saveConfig(state.config!);
      app.showMessage(`${fieldInfo.field.flag} = ${!fieldInfo.value}`);
    }, app);
  } else if (fieldInfo.field.type === "enum" && fieldInfo.field.options) {
    const cat = PRESET_CATEGORIES[fieldInfo.categoryIndex];
    const presetKey = cat.presetKey;
    const profile = state.config.server.profiles[state.config.server.activeProfile];
    const currentVal = fieldInfo.value;
    const opts = fieldInfo.field.options;
    const currentIdx = opts.indexOf(String(currentVal));
    const nextIdx = (currentIdx + 1) % opts.length;
    const nextVal = opts[nextIdx]!;
    if (profile) {
      profile.presets[presetKey][fieldInfo.field.key] = nextVal;
    }
    fireAsync(async () => {
      await saveConfig(state.config!);
      app.showMessage(`${fieldInfo.field.flag} = ${nextVal}`);
    }, app);
  } else {
    startFieldEdit(fieldInfo.categoryIndex, fieldInfo.fieldIndex, fieldInfo.field, fieldInfo.value, app);
  }
}

export function render(app: any): void {
  const term = app.term as Terminal;
  state.renderApp = app;

  if (!state.config && !state.loading) {
    state.loading = true;
    fireAsync(async () => {
      state.config = await loadConfig();
      if (state.config) {
        startStatusPolling();
      }
      state.loading = false;
      app.scheduleRender();
    }, app);
  }

  state.spinnerIndex = (state.spinnerIndex + 1) % 4;

  if (state.devicesOutput) {
    renderDevicesOutput(term);
    return;
  }

  let y = 3;
  y = renderHeader(term, y);
  y = renderControlsBar(term, y);
  y = renderForm(term, y);
  y = renderHelp(term, y);
  renderLine(term, y, () => {
    fg(term, themeColors.textMuted, " ");
    if (state.loading) {
      fg(term, themeColors.warning, "Loading config...");
    } else {
      fg(term, themeColors.textMuted, "ready");
    }
  });
}

export function handleKey(app: any, key: string): boolean {
  if (state.config === null) {
    return false;
  }

  if (state.devicesOutput) {
    state.devicesOutput = null;
    return true;
  }

  if (state.editMode) {
    if (key === "RETURN" || key === "ENTER") {
      submitEdit(app);
      app.scheduleRender();
      return true;
    }
    if (key === "ESC" || key === "CTRL_C") {
      cancelEdit(app);
      app.scheduleRender();
      return true;
    }
    if (key === "BACKSPACE" || key === "DEL") {
      state.editValue = state.editValue.slice(0, -1);
      app.scheduleRender();
      return true;
    }
    if (key === "TAB") {
      return true;
    }
    if (key.length === 1 || key === "SPACE") {
      state.editValue += key;
      app.scheduleRender();
      return true;
    }
    return true;
  }

  if (state.focusArea === "controls") {
    if (key === "h" || key === "LEFT") {
      state.controlIndex = Math.max(0, state.controlIndex - 1);
      app.scheduleRender();
      return true;
    }
    if (key === "l" || key === "RIGHT") {
      state.controlIndex = Math.min(CONTROLS.length - 1, state.controlIndex + 1);
      app.scheduleRender();
      return true;
    }
    if (key === "j" || key === "DOWN") {
      state.focusArea = "form";
      state.scrollOffset = 0;
      state.selectedIndex = 0;
      app.scheduleRender();
      return true;
    }
    if (key === "RETURN" || key === "ENTER") {
      executeControl(state.controlIndex, app);
      app.scheduleRender();
      return true;
    }
    if (key === "g") {
      state.focusArea = "form";
      state.scrollOffset = 0;
      state.selectedIndex = 0;
      app.scheduleRender();
      return true;
    }
    return true;
  }

  if (state.focusArea === "form") {
    const total = state.config ? countVisibleFields(state.config) : 0;
    if (key === "RETURN" || key === "ENTER") {
      handleFormEnter(app);
      app.scheduleRender();
      return true;
    }

    if (key === "g") {
      state.focusArea = "controls";
      app.scheduleRender();
      return true;
    }

    if (key === "k" || key === "UP") {
      state.selectedIndex = Math.max(0, state.selectedIndex - 1);
      const rowIdx = getRowIndexOfField(state.config, state.selectedIndex);
      if (rowIdx >= 0 && rowIdx < state.scrollOffset) {
        state.scrollOffset = rowIdx;
      }
      app.scheduleRender();
      return true;
    }
    if (key === "j" || key === "DOWN") {
      state.selectedIndex = Math.min(total - 1, state.selectedIndex + 1);
      const vh = getFormViewportHeight(app.term) - 2;
      const rowIdx = getRowIndexOfField(state.config, state.selectedIndex);
      if (rowIdx >= 0 && rowIdx >= state.scrollOffset + vh) {
        state.scrollOffset = rowIdx - vh + 1;
      }
      app.scheduleRender();
      return true;
    }

    if (key === "CTRL_D") {
      const vh = getFormViewportHeight(app.term) - 2;
      const pageStep = Math.floor(vh / 2);
      state.selectedIndex = Math.min(total - 1, state.selectedIndex + pageStep);
      const rowIdx = getRowIndexOfField(state.config, state.selectedIndex);
      if (rowIdx >= 0) {
        state.scrollOffset = Math.max(0, rowIdx - vh + 1);
      }
      app.scheduleRender();
      return true;
    }
    if (key === "CTRL_U") {
      const vh = getFormViewportHeight(app.term) - 2;
      const pageStep = Math.floor(vh / 2);
      state.selectedIndex = Math.max(0, state.selectedIndex - pageStep);
      const rowIdx = getRowIndexOfField(state.config, state.selectedIndex);
      if (rowIdx >= 0 && rowIdx < state.scrollOffset) {
        state.scrollOffset = rowIdx;
      }
      app.scheduleRender();
      return true;
    }

    if (key === "SPACE") {
      if (!state.config) return true;
      const fieldInfo = getVisibleFieldAt(state.config, state.selectedIndex);
      if (!fieldInfo) return true;

      const catIdx = fieldInfo.categoryIndex;
      if (state.collapsed.has(catIdx)) {
        state.collapsed.delete(catIdx);
      } else {
        state.collapsed.add(catIdx);
      }

      const newTotal = countVisibleFields(state.config);
      if (newTotal > 0) {
        state.selectedIndex = Math.min(state.selectedIndex, newTotal - 1);
      }
      const viewportHeight = getFormViewportHeight(app.term) - 2;
      clampScrollOffset(state.config, viewportHeight);
      app.scheduleRender();
      return true;
    }

    if (key === "CTRL_C") {
      return true;
    }

    return true;
  }

  return false;
}

export function dispose(): void {
  stopStatusPolling();
  state.config = null;
  state.serverState = "stopped";
  state.pid = null;
  state.uptime = 0;
  state.focusArea = "controls";
  state.controlIndex = 0;
  state.collapsed = new Set();
  state.selectedIndex = 0;
  state.scrollOffset = 0;
  state.editMode = false;
  state.editKey = null;
  state.editValue = "";
  state.editFieldCategory = null;
  state.editFieldIndex = null;
  state.devicesOutput = null;
  state.spinnerIndex = 0;
  state.loading = false;
  state.renderApp = null;
}
