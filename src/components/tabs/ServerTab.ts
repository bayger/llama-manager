import { Column } from "../ui/Layout.js";
import { ButtonBar } from "../ui/widgets/ButtonBar.js";
import { Button } from "../ui/widgets/Button.js";
import { Divider } from "../ui/widgets/Divider.js";
import { HelpBar } from "../ui/widgets/HelpBar.js";
import { Label } from "../ui/widgets/Label.js";
import { themeColors, fg, termWidth, termHeight, renderLine, renderDivider } from "../../lib/theme.js";
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
import type { TabContext } from "../../lib/tabcontext.js";
import type { Size } from "../ui/types.js";

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

export class ServerControl extends Column {
  protected _ctx: TabContext | null = null;
  protected _config: ConfigData | null = null;
  protected _loading = false;
  protected _collapsed = new Set<number>();
  protected _selectedIndex = 0;
  protected _scrollOffset = 0;
  protected _editMode = false;
  protected _editKey: string | null = null;
  protected _editFieldCategory: number | null = null;
  protected _editFieldIndex: number | null = null;
  protected _editValue = "";
  protected _devicesOutput: string | null = null;
  protected _focusArea: "buttons" | "form" = "buttons";
  protected _buttonBar: ButtonBar;
  protected _helpBar: HelpBar | null = null;
  protected _headerLabel: Label | null = null;

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;
    this._buttonBar = new ButtonBar();
    this._buttonBar.add(new Button({ label: "Create", action: () => this._onCreateProfile() }));
    this._buttonBar.add(new Button({ label: "Rename", action: () => this._onRenameProfile() }));
    this._buttonBar.add(new Button({ label: "Delete", action: () => this._onDeleteProfile() }));
  }

  measure(_parentSize?: Size): Size {
    return { width: _parentSize?.width || 80, height: _parentSize?.height || 20 };
  }

  onAttach(): void {
    if (!this._config && !this._loading) {
      this._loading = true;
      fireAsync(async () => {
        this._config = await loadConfig();
        this._loading = false;
        this.markDirty();
        this._ctx?.scheduleRender();
      }, this._ctx!);
    }
  }

  render(): void {
    if (!this.visible || !this.needsRender || !this._ctx) return;
    const term = this.term;

    if (this._devicesOutput) {
      this._renderDevicesOverlay(term);
      this.needsRender = false;
      return;
    }

    let y = this.rect.y;

    y = this._renderHeader(term, y);
    y = this._renderProfileButtons(term, y);
    renderDivider(term, y++, themeColors.border);
    y = this._renderForm(term, y);

    y = this._renderHelp(term, y);

    renderLine(term, y, () => {
      fg(term, themeColors.textMuted, " ");
      if (this._loading) {
        fg(term, themeColors.warning, "Loading config...");
      } else {
        fg(term, themeColors.textMuted, "ready");
      }
    });

    this.needsRender = false;
  }

  handleKey(key: string): boolean {
    if (this._config === null) {
      return false;
    }

    if (this._devicesOutput) {
      this._devicesOutput = null;
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }

    if (this._editMode) {
      return this._handleEditModeKey(key);
    }

    if (this._focusArea === "buttons") {
      return this._handleButtonsKey(key);
    }

    return this._handleFormKey(key);
  }

  _handleEditModeKey(key: string): boolean {
    if (key === "RETURN" || key === "ENTER") {
      this._submitEdit();
      return true;
    }
    if (key === "ESC" || key === "CTRL_C") {
      this._cancelEdit();
      return true;
    }
    if (key === "BACKSPACE" || key === "DEL") {
      this._editValue = this._editValue.slice(0, -1);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "TAB") {
      return true;
    }
    if (key.length === 1 || key === "SPACE") {
      this._editValue += key;
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    return true;
  }

  _handleButtonsKey(key: string): boolean {
    if (key === "DOWN") {
      this._focusArea = "form";
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

  _handleFormKey(key: string): boolean {
    if (!this._config) return false;

    if (key === "UP") {
      if (this._selectedIndex === 0) {
        this._focusArea = "buttons";
        this._buttonBar.focus();
        this.markDirty();
        this._ctx?.scheduleRender();
        return true;
      }
      this._selectedIndex = Math.max(0, this._selectedIndex - 1);
      const rowIdx = this._getRowIndexOfField(this._selectedIndex);
      if (rowIdx >= 0 && rowIdx < this._scrollOffset) {
        this._scrollOffset = rowIdx;
      }
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }

    if (key === "RETURN" || key === "ENTER") {
      this._handleFormEnter();
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }

    if (key === "d") {
      if (!this._config?.activeVersion) {
        this._ctx?.showMessage("No active version selected");
        return true;
      }
      try {
        this._devicesOutput = listDevices(this._config);
        this._ctx?.showMessage("Device info loaded");
      } catch (err: any) {
        this._ctx?.showMessage(`Failed to list devices: ${err.message}`);
      }
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }

    if (key === "k") {
      this._selectedIndex = Math.max(0, this._selectedIndex - 1);
      const rowIdx = this._getRowIndexOfField(this._selectedIndex);
      if (rowIdx >= 0 && rowIdx < this._scrollOffset) {
        this._scrollOffset = rowIdx;
      }
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }

    if (key === "j" || key === "DOWN") {
      const total = this._countVisibleFields();
      this._selectedIndex = Math.min(total - 1, this._selectedIndex + 1);
      const vh = this._getFormViewportHeight() - 2;
      const rowIdx = this._getRowIndexOfField(this._selectedIndex);
      if (rowIdx >= 0 && rowIdx >= this._scrollOffset + vh) {
        this._scrollOffset = rowIdx - vh + 1;
      }
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }

    if (key === "CTRL_D") {
      const total = this._countVisibleFields();
      const vh = this._getFormViewportHeight() - 2;
      const pageStep = Math.floor(vh / 2);
      this._selectedIndex = Math.min(total - 1, this._selectedIndex + pageStep);
      const rowIdx = this._getRowIndexOfField(this._selectedIndex);
      if (rowIdx >= 0) {
        this._scrollOffset = Math.max(0, rowIdx - vh + 1);
      }
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }

    if (key === "CTRL_U") {
      const total = this._countVisibleFields();
      const vh = this._getFormViewportHeight() - 2;
      const pageStep = Math.floor(vh / 2);
      this._selectedIndex = Math.max(0, this._selectedIndex - pageStep);
      const rowIdx = this._getRowIndexOfField(this._selectedIndex);
      if (rowIdx >= 0 && rowIdx < this._scrollOffset) {
        this._scrollOffset = rowIdx;
      }
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }

    if (key === "SPACE") {
      const fieldInfo = this._getVisibleFieldAt(this._selectedIndex);
      if (!fieldInfo) return true;

      const catIdx = fieldInfo.categoryIndex;
      if (this._collapsed.has(catIdx)) {
        this._collapsed.delete(catIdx);
      } else {
        this._collapsed.add(catIdx);
      }

      const newTotal = this._countVisibleFields();
      if (newTotal > 0) {
        this._selectedIndex = Math.min(this._selectedIndex, newTotal - 1);
      }
      const viewportHeight = this._getFormViewportHeight() - 2;
      this._clampScrollOffset(viewportHeight);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }

    if (key === "CTRL_C") {
      return true;
    }

    return true;
  }

  // — Profile button logic —

  _updateButtons(): void {
    const isDefault = this._config?.server?.activeProfile === "Default";
    const profileCount = this._config ? Object.keys(this._config.server.profiles).length : 0;
    const canDelete = !isDefault && profileCount > 1;
    const buttons = this._buttonBar.getButtons();
    buttons[0].disabled = false;
    buttons[1].disabled = false;
    buttons[2].disabled = !canDelete;
  }

  _onCreateProfile(): void {
    this._editMode = true;
    this._editKey = "create";
    this._editValue = "";
    this._ctx?.setTextInputFocused(true);
    this.markDirty();
    this._ctx?.scheduleRender();
  }

  _onRenameProfile(): void {
    if (!this._config) return;
    this._editMode = true;
    this._editKey = "rename";
    this._editValue = this._config.server.activeProfile;
    this._ctx?.setTextInputFocused(true);
    this.markDirty();
    this._ctx?.scheduleRender();
  }

  _onDeleteProfile(): void {
    if (!this._config) return;
    const profileName = this._config.server.activeProfile;
    if (profileName === "Default") {
      this._ctx?.showMessage("Cannot delete the Default profile");
      return;
    }
    if (Object.keys(this._config.server.profiles).length <= 1) {
      this._ctx?.showMessage("Cannot delete the last profile");
      return;
    }
    fireAsync(async () => {
      const profiles = this._config!.server.profiles;
      delete profiles[profileName];
      this._config!.server.activeProfile = Object.keys(profiles)[0]!;
      await saveConfig(this._config!);
      this._ctx?.showMessage(`Deleted profile "${profileName}"`);
      this.markDirty();
      this._ctx?.scheduleRender();
    }, this._ctx!);
  }

  // — Form row building —

  _buildFormRows(): FormRow[] {
    if (!this._config) return [];
    const presets = getActivePresets(this._config);
    const rows: FormRow[] = [];
    let globalFieldIdx = 0;

    for (let ci = 0; ci < PRESET_CATEGORIES.length; ci++) {
      const cat = PRESET_CATEGORIES[ci];
      const presetData = presets[cat.presetKey];
      const isCollapsed = this._collapsed.has(ci);

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

    const freeFormArgs = getActiveFreeFormArgs(this._config);
    if (freeFormArgs.length === 0) {
      rows.push({ type: "freeNone", isFieldSelectable: false });
    } else {
      for (let ai = 0; ai < freeFormArgs.length; ai++) {
        rows.push({ type: "freeArg", argIndex: ai, isFieldSelectable: false });
      }
    }

    return rows;
  }

  _countVisibleFields(): number {
    return this._buildFormRows().filter(r => r.isFieldSelectable).length;
  }

  _getRowIndexOfField(fieldIndex: number): number {
    const rows = this._buildFormRows();
    for (let i = 0; i < rows.length; i++) {
      if (rows[i]?.isFieldSelectable && rows[i]?.globalFieldIndex === fieldIndex) return i;
    }
    return -1;
  }

  _getVisibleFieldAt(index: number): { categoryIndex: number; fieldIndex: number; field: PresetFieldDef; value: unknown } | null {
    const rows = this._buildFormRows();
    for (const row of rows) {
      if (row?.isFieldSelectable && row?.globalFieldIndex === index) {
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

  _getFormViewportHeight(): number {
    return Math.max(2, termHeight(this.term) - 3 - 5);
  }

  _clampScrollOffset(viewportHeight: number): void {
    const totalRows = this._buildFormRows().length;
    const maxOffset = Math.max(0, totalRows - viewportHeight);
    this._scrollOffset = Math.max(0, Math.min(this._scrollOffset, maxOffset));
  }

  _ensureFieldInViewport(viewportHeight: number): void {
    if (!this._editMode || this._editFieldCategory === null || this._editFieldIndex === null) return;
    const rows = this._buildFormRows();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row?.type === "field" && row.categoryIndex === this._editFieldCategory && row.fieldIndex === this._editFieldIndex) {
        if (i < this._scrollOffset) {
          this._scrollOffset = i;
        } else if (i >= this._scrollOffset + viewportHeight) {
          this._scrollOffset = i - viewportHeight + 1;
        }
        this._clampScrollOffset(viewportHeight);
        return;
      }
    }
  }

  // — Edit mode —

  _submitEdit(): void {
    if (!this._config) return;

    if (this._editKey === "create") {
      const name = this._editValue.trim();
      if (!name) {
        this._cancelEdit();
        this._ctx?.showMessage("Profile name cannot be empty");
        return;
      }
      if (this._config.server.profiles[name]) {
        this._cancelEdit();
        this._ctx?.showMessage(`Profile "${name}" already exists`);
        return;
      }
      fireAsync(async () => {
        const activeProfile = this._config!.server.activeProfile;
        const source = this._config!.server.profiles[activeProfile];
        this._config!.server.profiles[name] = {
          presets: JSON.parse(JSON.stringify(source.presets)),
          freeFormArgs: [...source.freeFormArgs],
        };
        this._config!.server.activeProfile = name;
        await saveConfig(this._config!);
        this._cancelEdit();
        this._ctx?.showMessage(`Created profile "${name}"`);
        this.markDirty();
        this._ctx?.scheduleRender();
      }, this._ctx!);
    } else if (this._editKey === "rename") {
      const name = this._editValue.trim();
      if (!name) {
        this._cancelEdit();
        this._ctx?.showMessage("Profile name cannot be empty");
        return;
      }
      if (this._config.server.profiles[name]) {
        this._cancelEdit();
        this._ctx?.showMessage(`Profile "${name}" already exists`);
        return;
      }
      fireAsync(async () => {
        const oldName = this._config!.server.activeProfile;
        this._config!.server.profiles[name] = this._config!.server.profiles[oldName];
        delete this._config!.server.profiles[oldName];
        this._config!.server.activeProfile = name;
        await saveConfig(this._config!);
        this._cancelEdit();
        this._ctx?.showMessage(`Renamed profile to "${name}"`);
        this.markDirty();
        this._ctx?.scheduleRender();
      }, this._ctx!);
    } else if (this._editKey === "field" && this._editFieldCategory !== null && this._editFieldIndex !== null) {
      const cat = PRESET_CATEGORIES[this._editFieldCategory];
      const field = cat.fields[this._editFieldIndex];
      let newValue: unknown;

      if (field.type === "number") {
        const num = Number(this._editValue);
        if (isNaN(num)) {
          this._ctx?.showMessage("Invalid number");
          return;
        }
        newValue = num;
      } else if (field.type === "enum") {
        if (field.options && !field.options.includes(this._editValue)) {
          this._ctx?.showMessage(`Invalid option. Choose from: ${field.options.join(", ")}`);
          return;
        }
        newValue = this._editValue;
      } else {
        newValue = this._editValue === "" ? null : this._editValue;
      }

      fireAsync(async () => {
        const profile = this._config!.server.profiles[this._config!.server.activeProfile];
        if (profile) {
          profile.presets[cat.presetKey][field.key] = newValue;
        }
        await saveConfig(this._config!);
        this._cancelEdit();
        this._ctx?.showMessage(`Updated ${field.flag} = ${newValue}`);
        this.markDirty();
        this._ctx?.scheduleRender();
      }, this._ctx!);
    }
  }

  _cancelEdit(): void {
    this._editMode = false;
    this._editKey = null;
    this._editValue = "";
    this._editFieldCategory = null;
    this._editFieldIndex = null;
    this._ctx?.setTextInputFocused(false);
    this.markDirty();
    this._ctx?.scheduleRender();
  }

  _startFieldEdit(categoryIndex: number, fieldIndex: number, field: PresetFieldDef, value: unknown): void {
    this._editMode = true;
    this._editKey = "field";
    this._editFieldCategory = categoryIndex;
    this._editFieldIndex = fieldIndex;
    this._editValue = value !== null && value !== undefined ? String(value) : "";
    this._ctx?.setTextInputFocused(true);
  }

  _handleFormEnter(): void {
    if (!this._config) return;
    const fieldInfo = this._getVisibleFieldAt(this._selectedIndex);
    if (!fieldInfo) return;

    if (fieldInfo.field.type === "boolean") {
      const cat = PRESET_CATEGORIES[fieldInfo.categoryIndex];
      const presetKey = cat.presetKey;
      const profile = this._config.server.profiles[this._config.server.activeProfile];
      if (profile) {
        const currentVal = profile.presets[presetKey][fieldInfo.field.key];
        profile.presets[presetKey][fieldInfo.field.key] = !currentVal;
      }
      fireAsync(async () => {
        await saveConfig(this._config!);
        this._ctx?.showMessage(`${fieldInfo.field.flag} = ${!fieldInfo.value}`);
        this.markDirty();
        this._ctx?.scheduleRender();
      }, this._ctx!);
    } else if (fieldInfo.field.type === "enum" && fieldInfo.field.options) {
      const cat = PRESET_CATEGORIES[fieldInfo.categoryIndex];
      const presetKey = cat.presetKey;
      const profile = this._config.server.profiles[this._config.server.activeProfile];
      const currentVal = fieldInfo.value;
      const opts = fieldInfo.field.options;
      const currentIdx = opts.indexOf(String(currentVal));
      const nextIdx = (currentIdx + 1) % opts.length;
      const nextVal = opts[nextIdx]!;
      if (profile) {
        profile.presets[presetKey][fieldInfo.field.key] = nextVal;
      }
      fireAsync(async () => {
        await saveConfig(this._config!);
        this._ctx?.showMessage(`${fieldInfo.field.flag} = ${nextVal}`);
        this.markDirty();
        this._ctx?.scheduleRender();
      }, this._ctx!);
    } else {
      this._startFieldEdit(fieldInfo.categoryIndex, fieldInfo.fieldIndex, fieldInfo.field, fieldInfo.value);
    }
  }

  // — Rendering —

  _renderHeader(term: any, startY: number): number {
    const version = this._config?.activeVersion || "none";
    const activeProfile = this._config?.server?.activeProfile || "Default";

    let y = startY;
    renderLine(term, y++, () => {
      term.bold();
      fg(term, themeColors.text, `  Profiles │ ${activeProfile} │ Version: ${version}`);
      term.styleReset();
    });
    renderDivider(term, y++, themeColors.border);
    return y;
  }

  _renderProfileButtons(term: any, startY: number): number {
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

  _renderForm(term: any, startY: number): number {
    if (!this._config) return startY;

    const rows = this._buildFormRows();
    const totalRows = rows.length;
    const availableLines = this._getFormViewportHeight();
    const hasOverflow = totalRows > availableLines;
    const indicatorLines = hasOverflow ? 2 : 0;
    const viewportHeight = Math.max(1, availableLines - indicatorLines);

    this._clampScrollOffset(viewportHeight);
    this._ensureFieldInViewport(viewportHeight);

    const scrollStart = this._scrollOffset;
    const scrollEnd = Math.min(scrollStart + viewportHeight, totalRows);
    const showScrollUp = this._scrollOffset > 0;
    const showScrollDown = scrollEnd < totalRows;

    let y = startY;

    if (showScrollUp) {
      renderLine(term, y, () => {
        fg(term, themeColors.textMuted, "  \u25b2");
      });
      y++;
    }

    for (let ri = scrollStart; ri < scrollEnd; ri++) {
      const row = rows[ri];
      if (!row) continue;

      if (row.type === "catHeader") {
        const cat = PRESET_CATEGORIES[row.categoryIndex!]!;
        const presets = getActivePresets(this._config);
        const presetData = presets[cat.presetKey];
        const isCollapsed = this._collapsed.has(row.categoryIndex!);

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
        const presets = getActivePresets(this._config);
        const value = presets[cat.presetKey]?.[field.key] ?? row.value;
        const selected = row.globalFieldIndex === this._selectedIndex && !this._editMode;
        const isEditing = this._editMode && this._editFieldCategory === row.categoryIndex && this._editFieldIndex === row.fieldIndex;

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
            fg(term, themeColors.success, `   ${flagPadded} `);
            fg(term, themeColors.selected, this._editValue);
            term.styleReset();
          } else if (selected) {
            term.bold();
            fg(term, themeColors.success, `   ${flagPadded} `);
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
        const freeFormArgs = getActiveFreeFormArgs(this._config);
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

  _renderHelp(term: any, startY: number): number {
    let hint = "";

    if (this._editMode) {
      if (this._editKey === "create") {
        hint = ` Profile name: ${this._editValue} │ Enter confirm │ Ctrl+C cancel `;
      } else if (this._editKey === "rename") {
        hint = ` New name: ${this._editValue} │ Enter confirm │ Ctrl+C cancel `;
      } else {
        hint = ` Value: ${this._editValue} │ Enter confirm │ Ctrl+C cancel `;
      }
    } else {
      hint = " h/l/j/k buttons │ UP/DOWN sections │ j/k fields │ Enter edit │ space collapse │ Ctrl+D/U pg │ Devices d ";
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

  _renderDevicesOverlay(term: any): void {
    if (!this._devicesOutput) return;

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

    const lines = this._devicesOutput.split("\n");
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

  onDetach(): void {
    this._config = null;
    this._collapsed = new Set();
    this._selectedIndex = 0;
    this._scrollOffset = 0;
    this._editMode = false;
    this._editKey = null;
    this._editValue = "";
    this._editFieldCategory = null;
    this._editFieldIndex = null;
    this._devicesOutput = null;
    this._loading = false;
    this._focusArea = "buttons";
  }
}

export function createServerTab(ctx: TabContext) {
  return new ServerControl(ctx);
}
