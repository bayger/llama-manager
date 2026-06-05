import type { Terminal } from "terminal-kit";
import { themeColors, fg, termWidth, termHeight, renderBox, renderLine, renderDivider } from "../../lib/theme.js";
import { renderHelpBar } from "../shared/HelpBar.js";
import { renderButtonBar, moveButtonIndex, ButtonItem } from "../shared/Button.js";
import {
  loadConfig,
  saveConfig,
  getActivePresets,
  getActiveFreeFormArgs,
  PRESET_CATEGORIES,
  ConfigData,
  PresetFieldDef,
} from "../../lib/config.js";
import { listDevices } from "../../lib/server.js";
import { fireAsync } from "../../lib/utils.js";
import { TabContext } from "../../lib/tabcontext.js";

const PROFILE_ACTIONS = ["Create", "Rename", "Delete"] as const;

interface ServerTabState {
  config: ConfigData | null;
  collapsed: Set<number>;
  selectedIndex: number;
  scrollOffset: number;
  editMode: boolean;
  editKey: string | null;
  editFieldCategory: number | null;
  editFieldIndex: number | null;
  editValue: string;
  devicesOutput: string | null;
  loading: boolean;
  focusArea: "buttons" | "form";
  buttonIndex: number;
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

export function createServerTab(ctx: TabContext) {
  const state: ServerTabState = {
    config: null,
    collapsed: new Set(),
    selectedIndex: 0,
    scrollOffset: 0,
    editMode: false,
    editKey: null,
    editFieldCategory: null,
    editFieldIndex: null,
    editValue: "",
    devicesOutput: null,
    loading: false,
    focusArea: "buttons",
    buttonIndex: 0,
  };

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
    const availableLines = Math.max(2, termHeight(term) - 3 - 5);
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

  function renderHeader(term: Terminal, startY: number): number {
    const version = state.config?.activeVersion || "none";
    const activeProfile = state.config?.server?.activeProfile || "Default";

    let y = startY;
    renderLine(term, y++, () => {
      term.bold();
      fg(term, themeColors.text, `  Profiles │ ${activeProfile} │ Version: ${version}`);
      term.styleReset();
    });
    renderDivider(term, y++, themeColors.border);
    return y;
  }

  function getProfileButtonItems(): ButtonItem[] {
    const isDefault = state.config?.server?.activeProfile === "Default";
    const profileCount = state.config ? Object.keys(state.config.server.profiles).length : 0;
    const canDelete = !isDefault && profileCount > 1;
    return [
      { label: "Create" },
      { label: "Rename" },
      { label: "Delete", disabled: !canDelete },
    ];
  }

  function renderProfileButtons(term: Terminal, startY: number): number {
    return renderButtonBar({
      term,
      startY,
      items: getProfileButtonItems(),
      selectedIndex: state.focusArea === "buttons" ? state.buttonIndex : -1,
    });
  }

  function executeProfileAction(index: number): void {
    if (!state.config) return;

    const action = PROFILE_ACTIONS[index];

    switch (action) {
      case "Create": {
        state.editMode = true;
        state.editKey = "create";
        state.editValue = "";
        ctx.setTextInputFocused(true);
        break;
      }

      case "Rename": {
        state.editMode = true;
        state.editKey = "rename";
        state.editValue = state.config.server.activeProfile;
        ctx.setTextInputFocused(true);
        break;
      }

      case "Delete": {
        const profileName = state.config.server.activeProfile;
        if (profileName === "Default") {
          ctx.showMessage("Cannot delete the Default profile");
          return;
        }
        if (Object.keys(state.config.server.profiles).length <= 1) {
          ctx.showMessage("Cannot delete the last profile");
          return;
        }
        fireAsync(async () => {
          const profiles = state.config!.server.profiles;
          delete profiles[profileName];
          state.config!.server.activeProfile = Object.keys(profiles)[0]!;
          await saveConfig(state.config!);
          ctx.showMessage(`Deleted profile "${profileName}"`);
        }, ctx);
        break;
      }
    }
  }

  function renderHelp(term: Terminal, startY: number): number {
    let hint = "";

    if (state.editMode) {
      if (state.editKey === "create") {
        hint = ` Profile name: ${state.editValue} │ Enter confirm │ Ctrl+C cancel `;
      } else if (state.editKey === "rename") {
        hint = ` New name: ${state.editValue} │ Enter confirm │ Ctrl+C cancel `;
      } else {
        hint = ` Value: ${state.editValue} │ Enter confirm │ Ctrl+C cancel `;
      }
    } else {
      hint = " h/l/j/k buttons │ UP/DOWN sections │ j/k fields │ Enter edit │ space collapse │ Ctrl+D/U pg │ Devices d ";
    }

    return renderHelpBar({ term, y: startY, text: hint });
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
        const selected = row.globalFieldIndex === state.selectedIndex && !state.editMode;
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

  function submitEdit(): void {
    if (!state.config) return;

    if (state.editKey === "create") {
      const name = state.editValue.trim();
      if (!name) {
        cancelEdit();
        ctx.showMessage("Profile name cannot be empty");
        return;
      }
      if (state.config.server.profiles[name]) {
        cancelEdit();
        ctx.showMessage(`Profile "${name}" already exists`);
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
        cancelEdit();
        ctx.showMessage(`Created profile "${name}"`);
      }, ctx);
    } else if (state.editKey === "rename") {
      const name = state.editValue.trim();
      if (!name) {
        cancelEdit();
        ctx.showMessage("Profile name cannot be empty");
        return;
      }
      if (state.config.server.profiles[name]) {
        cancelEdit();
        ctx.showMessage(`Profile "${name}" already exists`);
        return;
      }
      fireAsync(async () => {
        const oldName = state.config!.server.activeProfile;
        state.config!.server.profiles[name] = state.config!.server.profiles[oldName];
        delete state.config!.server.profiles[oldName];
        state.config!.server.activeProfile = name;
        await saveConfig(state.config!);
        cancelEdit();
        ctx.showMessage(`Renamed profile to "${name}"`);
      }, ctx);
    } else if (state.editKey === "field" && state.editFieldCategory !== null && state.editFieldIndex !== null) {
      const cat = PRESET_CATEGORIES[state.editFieldCategory];
      const field = cat.fields[state.editFieldIndex];
      let newValue: unknown;

      if (field.type === "number") {
        const num = Number(state.editValue);
        if (isNaN(num)) {
          ctx.showMessage("Invalid number");
          return;
        }
        newValue = num;
      } else if (field.type === "enum") {
        if (field.options && !field.options.includes(state.editValue)) {
          ctx.showMessage(`Invalid option. Choose from: ${field.options.join(", ")}`);
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
        cancelEdit();
        ctx.showMessage(`Updated ${field.flag} = ${newValue}`);
      }, ctx);
    }
  }

  function cancelEdit(): void {
    state.editMode = false;
    state.editKey = null;
    state.editValue = "";
    state.editFieldCategory = null;
    state.editFieldIndex = null;
    ctx.setTextInputFocused(false);
  }

  function startFieldEdit(categoryIndex: number, fieldIndex: number, field: PresetFieldDef, value: unknown): void {
    state.editMode = true;
    state.editKey = "field";
    state.editFieldCategory = categoryIndex;
    state.editFieldIndex = fieldIndex;
    state.editValue = value !== null && value !== undefined ? String(value) : "";
    ctx.setTextInputFocused(true);
  }

  function handleFormEnter(): void {
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
        ctx.showMessage(`${fieldInfo.field.flag} = ${!fieldInfo.value}`);
      }, ctx);
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
        ctx.showMessage(`${fieldInfo.field.flag} = ${nextVal}`);
      }, ctx);
    } else {
      startFieldEdit(fieldInfo.categoryIndex, fieldInfo.fieldIndex, fieldInfo.field, fieldInfo.value);
    }
  }

  function render(): void {
    const term = ctx.term;

    if (!state.config && !state.loading) {
      state.loading = true;
      fireAsync(async () => {
        state.config = await loadConfig();
        state.loading = false;
        ctx.scheduleRender();
      }, ctx);
    }

    if (state.devicesOutput) {
      renderDevicesOutput(term);
      return;
    }

    let y = 3;
    y = renderHeader(term, y);
    y = renderProfileButtons(term, y);
    renderDivider(term, y++, themeColors.border);
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

  function handleKey(key: string): boolean {
    if (state.config === null) {
      return false;
    }

    if (state.devicesOutput) {
      state.devicesOutput = null;
      return true;
    }

    if (state.editMode) {
      if (key === "RETURN" || key === "ENTER") {
        submitEdit();
        ctx.scheduleRender();
        return true;
      }
      if (key === "ESC" || key === "CTRL_C") {
        cancelEdit();
        ctx.scheduleRender();
        return true;
      }
      if (key === "BACKSPACE" || key === "DEL") {
        state.editValue = state.editValue.slice(0, -1);
        ctx.scheduleRender();
        return true;
      }
      if (key === "TAB") {
        return true;
      }
      if (key.length === 1 || key === "SPACE") {
        state.editValue += key;
        ctx.scheduleRender();
        return true;
      }
      return true;
    }

    if (state.focusArea === "buttons") {
      if (key === "h" || key === "LEFT" || key === "k") {
        state.buttonIndex = moveButtonIndex(getProfileButtonItems(), state.buttonIndex, -1);
        ctx.scheduleRender();
        return true;
      }
      if (key === "l" || key === "RIGHT" || key === "j") {
        state.buttonIndex = moveButtonIndex(getProfileButtonItems(), state.buttonIndex, 1);
        ctx.scheduleRender();
        return true;
      }
      if (key === "RETURN" || key === "ENTER") {
        const items = getProfileButtonItems();
        if (!items[state.buttonIndex]?.disabled) {
          executeProfileAction(state.buttonIndex);
        }
        ctx.scheduleRender();
        return true;
      }
      if (key === "DOWN") {
        state.focusArea = "form";
        ctx.scheduleRender();
        return true;
      }
    } else {
      if (key === "UP") {
        if (state.selectedIndex === 0) {
          state.focusArea = "buttons";
          ctx.scheduleRender();
          return true;
        }
        state.selectedIndex = Math.max(0, state.selectedIndex - 1);
        const rowIdx = getRowIndexOfField(state.config, state.selectedIndex);
        if (rowIdx >= 0 && rowIdx < state.scrollOffset) {
          state.scrollOffset = rowIdx;
        }
        ctx.scheduleRender();
        return true;
      }
    }

    const total = state.config ? countVisibleFields(state.config) : 0;
    if (key === "RETURN" || key === "ENTER") {
      handleFormEnter();
      ctx.scheduleRender();
      return true;
    }

    if (key === "d") {
      if (!state.config?.activeVersion) {
        ctx.showMessage("No active version selected");
        return true;
      }
      try {
        state.devicesOutput = listDevices(state.config);
        ctx.showMessage("Device info loaded");
      } catch (err: any) {
        ctx.showMessage(`Failed to list devices: ${err.message}`);
      }
      return true;
    }

    if (key === "k") {
      state.selectedIndex = Math.max(0, state.selectedIndex - 1);
      const rowIdx = getRowIndexOfField(state.config, state.selectedIndex);
      if (rowIdx >= 0 && rowIdx < state.scrollOffset) {
        state.scrollOffset = rowIdx;
      }
      ctx.scheduleRender();
      return true;
    }
    if (key === "j" || key === "DOWN") {
      state.selectedIndex = Math.min(total - 1, state.selectedIndex + 1);
      const vh = getFormViewportHeight(ctx.term) - 2;
      const rowIdx = getRowIndexOfField(state.config, state.selectedIndex);
      if (rowIdx >= 0 && rowIdx >= state.scrollOffset + vh) {
        state.scrollOffset = rowIdx - vh + 1;
      }
      ctx.scheduleRender();
      return true;
    }

    if (key === "CTRL_D") {
      const vh = getFormViewportHeight(ctx.term) - 2;
      const pageStep = Math.floor(vh / 2);
      state.selectedIndex = Math.min(total - 1, state.selectedIndex + pageStep);
      const rowIdx = getRowIndexOfField(state.config, state.selectedIndex);
      if (rowIdx >= 0) {
        state.scrollOffset = Math.max(0, rowIdx - vh + 1);
      }
      ctx.scheduleRender();
      return true;
    }
    if (key === "CTRL_U") {
      const vh = getFormViewportHeight(ctx.term) - 2;
      const pageStep = Math.floor(vh / 2);
      state.selectedIndex = Math.max(0, state.selectedIndex - pageStep);
      const rowIdx = getRowIndexOfField(state.config, state.selectedIndex);
      if (rowIdx >= 0 && rowIdx < state.scrollOffset) {
        state.scrollOffset = rowIdx;
      }
      ctx.scheduleRender();
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
      const viewportHeight = getFormViewportHeight(ctx.term) - 2;
      clampScrollOffset(state.config, viewportHeight);
      ctx.scheduleRender();
      return true;
    }

    if (key === "CTRL_C") {
      return true;
    }

    return true;
  }

  function dispose(): void {
    state.config = null;
    state.collapsed = new Set();
    state.selectedIndex = 0;
    state.scrollOffset = 0;
    state.editMode = false;
    state.editKey = null;
    state.editValue = "";
    state.editFieldCategory = null;
    state.editFieldIndex = null;
    state.devicesOutput = null;
    state.loading = false;
    state.focusArea = "buttons";
    state.buttonIndex = 0;
  }

  return { render, handleKey, dispose };
}
