import { Column } from "../ui/Layout.js";
import { ButtonBar } from "../ui/widgets/ButtonBar.js";
import { Button } from "../ui/widgets/Button.js";
import { Divider } from "../ui/widgets/Divider.js";
import { HelpBar } from "../ui/widgets/HelpBar.js";
import { Label } from "../ui/widgets/Label.js";
import { Spacer } from "../ui/widgets/Spacer.js";
import { themeColors, fg, termWidth, termHeight, renderBox, renderLine } from "../../lib/theme.js";
import { loadConfig, saveConfig, getModelsDir, ConfigData } from "../../lib/config.js";
import {
  listLocalModels,
  deleteModel,
  formatSize,
  getTotalModelsSize,
  downloadModel,
  setActiveModel,
  LocalModel,
} from "../../lib/models.js";
import {
  searchRepos,
  listFiles,
  browseModels,
  getModelInfo,
  HFRepoInfo,
  HFFileInfo,
  HFModelInfo,
} from "../../lib/hf.js";
import type { TabContext } from "../../lib/tabcontext.js";
import type { RenderContext, Size } from "../ui/types.js";

const TASK_FILTERS = [
  { label: "All", filter: "" },
  { label: "Text Gen", filter: "pipeline_tag:text-generation" },
  { label: "Embedding", filter: "pipeline_tag:feature-extraction" },
  { label: "Infilling", filter: "pipeline_tag:text-generation-infilling" },
];

const QUANT_FILTERS = [
  { label: "Q4_K_M", filter: "tag:q4_k_m" },
  { label: "Q5_K_M", filter: "tag:q5_k_m" },
  { label: "Q8_0", filter: "tag:q8_0" },
  { label: "FP16", filter: "tag:fp16" },
];

const AUTHOR_FILTERS = [
  { label: "TheBloke", filter: "author:TheBloke" },
  { label: "bartowski", filter: "author:bartowski" },
  { label: "Qwen", filter: "author:Qwen" },
];

const ALL_FILTERS = [...TASK_FILTERS, ...QUANT_FILTERS, ...AUTHOR_FILTERS];

const SORT_OPTIONS = [
  { label: "Likes", value: "likes" },
  { label: "Downloads", value: "downloads" },
  { label: "Modified", value: "lastModified" },
  { label: "Trending", value: "trending" },
  { label: "Created", value: "created" },
];

function clampIndex(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(value, max - 1));
}

export class ModelsControl extends Column {
  protected _ctx: TabContext | null = null;
  protected _config: ConfigData | null = null;
  protected _models: LocalModel[] = [];
  protected _selectedIndex = 0;
  protected _focusArea: "list" | "buttons" | "search" | "files" | "browse" | "browsefilters" | "browsesort" | "modelcard" = "buttons";
  protected _buttonBar: ButtonBar;
  protected _loading = false;
  protected _message: string | null = null;
  protected _totalSize = 0;
  protected _searching = false;
  protected _searchQuery = "";
  protected _searchResults: HFRepoInfo[] = [];
  protected _searchIndex = 0;
  protected _downloading = false;
  protected _dlProgress = 0;
  protected _dlLabel = "";
  protected _repoFiles: HFFileInfo[] = [];
  protected _repoId = "";
  protected _fileIndex = 0;
  protected _fetchingFiles = false;
  protected _editMode = false;
  protected _editValue = "";
  protected _browseResults: HFRepoInfo[] = [];
  protected _browseIndex = 0;
  protected _browseSort = 0;
  protected _browseDirection = -1;
  protected _browseFilters: boolean[] = new Array(ALL_FILTERS.length).fill(false);
  protected _filterIndex = 0;
  protected _sortIndex = 0;
  protected _modelCard: HFModelInfo | null = null;
  protected _fetchingCard = false;
  protected _browseSearchQuery = "";
  protected _browseEditMode = false;
  protected _browseEditValue = "";
  protected _initPromise: Promise<void> | null = null;
  protected _divider: Divider;
  protected _helpSpacer: Spacer;
  protected _helpBar: HelpBar;
  protected _loadingLabel: Label;

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;
    this._buttonBar = new ButtonBar();
    this._buttonBar.add(new Button({ label: "Set Active", action: () => this._onSetActive() }));
    this._buttonBar.add(new Button({ label: "Delete", action: () => this._onDelete() }));
    this._buttonBar.add(new Button({ label: "Search", action: () => this._onSearch() }));
    this._buttonBar.add(new Button({ label: "Browse", action: () => this._onBrowse() }));
    this._divider = new Divider();
    this._helpSpacer = new Spacer();
    this._helpBar = new HelpBar();
    this._loadingLabel = new Label();
    this._loadingLabel.color = themeColors.textMuted;
    this._loadingLabel.text = "  Loading models...";
  }

  measure(_parentSize?: Size): Size {
    return { width: _parentSize?.width || 80, height: _parentSize?.height || 20 };
  }

  attach(renderContext: RenderContext): void {
    super.attach(renderContext);
    this._buttonBar.attach(renderContext);
    this._divider.attach(renderContext);
    this._helpSpacer.attach(renderContext);
    this._helpBar.attach(renderContext);
    this._loadingLabel.attach(renderContext);
  }

  detach(): void {
    this._buttonBar.detach();
    this._divider.detach();
    this._helpSpacer.detach();
    this._helpBar.detach();
    this._loadingLabel.detach();
    super.detach();
  }

  onAttach(): void {
    this._initIfNeeded();
  }

  render(): void {
    if (!this.visible || !this.needsRender || !this._ctx) return;
    const term = this.term;
    this._initIfNeeded();

    if (this._loading && this._models.length === 0) {
      renderLine(term, this.rect.y, () => {
        fg(term, themeColors.textMuted, "  Loading models...");
      });
      this.needsRender = false;
      return;
    }

    const width = termWidth(term);
    let y = this.rect.y;

    if (this._downloading) {
      y = this._renderHeader(term, width, y);
      y = this._renderModelList(term, width, y);
      y = this._renderDownloadProgress(term, width, y);
      this.needsRender = false;
      return;
    }

    switch (this._focusArea) {
      case "list":
      case "buttons": {
        y = this._renderHeader(term, width, y);
        y = this._renderButtons(term, y);
        y = this._renderDividerAt(y, width);
        y = this._renderModelList(term, width, y);
        y = this._renderHelp(y);
        break;
      }
      case "search": {
        if (this._editMode) {
          y = this._renderHeader(term, width, y);
          renderLine(term, y++, () => {
            term.bold();
            fg(term, themeColors.accent, `  Search: ${this._editValue}`);
            term.styleReset();
          });
          y = this._renderHelp(y);
        } else {
          y = this._renderHeader(term, width, y);
          renderLine(term, y++, () => {
            fg(term, themeColors.textMuted, `  Query: ${this._searchQuery}`);
          });
          renderLine(term, y++, () => {});
          y = this._renderSearchResults(term, width, y);
          y = this._renderHelp(y);
        }
        break;
      }
      case "files": {
        y = this._renderHeader(term, width, y);
        y = this._renderRepoFiles(term, width, y);
        y = this._renderHelp(y);
        break;
      }
      case "browse": {
        if (this._browseEditMode) {
          y = this._renderHeader(term, width, y);
          renderLine(term, y++, () => {
            term.bold();
            fg(term, themeColors.accent, `  Browse search: ${this._browseEditValue}`);
            term.styleReset();
          });
          y = this._renderHelp(y);
        } else {
          y = this._renderHeader(term, width, y);
          renderLine(term, y++, () => {
            fg(term, themeColors.textMuted, `  Browse (${SORT_OPTIONS[this._browseSort]?.label})`);
          });
          renderLine(term, y++, () => {});
          y = this._renderBrowseResults(term, width, y);
          y = this._renderHelp(y);
        }
        break;
      }
      case "browsefilters": {
        y = this._renderHeader(term, width, y);
        y = this._renderBrowseResults(term, width, y);
        y = this._renderBrowseFilters(term, width, y);
        y = this._renderHelp(y);
        break;
      }
      case "browsesort": {
        y = this._renderHeader(term, width, y);
        y = this._renderBrowseResults(term, width, y);
        y = this._renderBrowseSort(term, width, y);
        y = this._renderHelp(y);
        break;
      }
      case "modelcard": {
        y = this._renderHeader(term, width, y);
        y = this._renderModelCard(term, width, y);
        y = this._renderHelp(y);
        break;
      }
    }

    if (this._message) {
      renderLine(term, y++, () => {
        fg(term, themeColors.warning, `  ${this._message}`);
      });
    }

    this.needsRender = false;
  }

  handleKey(key: string): boolean {
    if (this._downloading) return true;
    if (this._searching || this._loading || this._fetchingFiles || this._fetchingCard) return true;

    if (this._editMode) {
      return this._handleSearchEditModeKey(key);
    }
    if (this._browseEditMode) {
      return this._handleBrowseEditModeKey(key);
    }

    switch (this._focusArea) {
      case "list": return this._handleListKey(key);
      case "buttons": return this._handleButtonsKey(key);
      case "search": return this._handleSearchKey(key);
      case "files": return this._handleFilesKey(key);
      case "browse": return this._handleBrowseKey(key);
      case "browsefilters": return this._handleBrowseFiltersKey(key);
      case "browsesort": return this._handleBrowseSortKey(key);
      case "modelcard": return this._handleModelCardKey(key);
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
    if (this._browseEditMode && char.length === 1) {
      this._browseEditValue += char;
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
          await this._refreshModels();
        }
        this._loading = false;
        this.markDirty();
        this._ctx?.scheduleRender();
      })();
    }
  }

  async _refreshModels(): Promise<void> {
    if (!this._config) return;
    this._loading = true;
    try {
      this._models = await listLocalModels(this._config);
      this._totalSize = await getTotalModelsSize(this._config);
      if (this._selectedIndex >= this._models.length) {
        this._selectedIndex = Math.max(0, this._models.length - 1);
      }
    } catch {
      this._message = "Failed to load models";
    }
    this._loading = false;
  }

  // — Actions —

  _updateButtons(): void {
    const hasSelection = this._models.length > 0 && this._selectedIndex < this._models.length;
    const buttons = this._buttonBar.getButtons();
    buttons[0].disabled = !hasSelection;
    buttons[1].disabled = !hasSelection;
    buttons[2].disabled = false;
    buttons[3].disabled = false;
  }

  async _onSetActive(): Promise<void> {
    if (!this._config) return;
    if (this._models.length === 0 || this._selectedIndex >= this._models.length) {
      this._message = "No model selected";
      return;
    }
    const m = this._models[this._selectedIndex];
    try {
      const updated = await setActiveModel(this._config, m.repoId, m.filename);
      await saveConfig(updated);
      this._config = updated;
      await this._refreshModels();
      this._message = `Set active: ${m.repoId}/${m.filename}`;
      this._ctx?.showMessage(this._message!);
    } catch (err: any) {
      this._message = `Error: ${err.message}`;
    }
    this.markDirty();
    this._ctx?.scheduleRender();
  }

  async _onDelete(): Promise<void> {
    if (!this._config) return;
    if (this._models.length === 0 || this._selectedIndex >= this._models.length) {
      this._message = "No model selected";
      return;
    }
    const m = this._models[this._selectedIndex];
    try {
      const updated = await deleteModel(this._config, m.path);
      await saveConfig(updated);
      this._config = updated;
      await this._refreshModels();
      this._message = `Deleted: ${m.filename}`;
      this._ctx?.showMessage(this._message!);
    } catch (err: any) {
      this._message = `Error: ${err.message}`;
    }
    this.markDirty();
    this._ctx?.scheduleRender();
  }

  _onSearch(): void {
    this._focusArea = "search";
    this._editMode = true;
    this._editValue = "";
    this._searchResults = [];
    this._searchIndex = 0;
    this._ctx?.setTextInputFocused(true);
    this.markDirty();
    this._ctx?.scheduleRender();
  }

  _onBrowse(): void {
    this._focusArea = "browse";
    this._browseResults = [];
    this._browseIndex = 0;
    this._fetchBrowse().catch(() => {});
  }

  async _fetchBrowse(): Promise<void> {
    if (!this._config) return;
    this._loading = true;
    this._message = null;
    try {
      const activeFilters: string[] = [];
      for (let i = 0; i < ALL_FILTERS.length; i++) {
        if (this._browseFilters[i] && ALL_FILTERS[i].filter) {
          activeFilters.push(ALL_FILTERS[i].filter);
        }
      }
      const sortValue = SORT_OPTIONS[this._sortIndex]?.value || "likes";
      const direction = this._browseDirection as 1 | -1;
      const results = await browseModels(
        {
          sort: sortValue as any,
          direction,
          filters: activeFilters,
          search: this._browseSearchQuery || undefined,
        },
        this._config.hfToken || undefined,
      );
      this._browseResults = results;
      this._browseIndex = 0;
    } catch (err: any) {
      this._message = `Browse error: ${err.message}`;
    }
    this._loading = false;
    this.markDirty();
    this._ctx?.scheduleRender();
  }

  async _submitSearch(): Promise<void> {
    if (!this._config || !this._editValue.trim()) {
      this._editMode = false;
      this._ctx?.setTextInputFocused(false);
      this.markDirty();
      this._ctx?.scheduleRender();
      return;
    }
    this._searchQuery = this._editValue.trim();
    this._editMode = false;
    this._searching = true;
    this._message = null;
    this._ctx?.setTextInputFocused(false);
    try {
      const results = await searchRepos(
        this._searchQuery,
        this._config.hfToken || undefined,
      );
      this._searchResults = results;
      this._searchIndex = 0;
    } catch (err: any) {
      this._message = `Search error: ${err.message}`;
    }
    this._searching = false;
    this.markDirty();
    this._ctx?.scheduleRender();
  }

  async _downloadSelectedFile(): Promise<void> {
    if (!this._config || this._fileIndex >= this._repoFiles.length) return;
    const file = this._repoFiles[this._fileIndex];
    this._downloading = true;
    this._dlProgress = 0;
    this._dlLabel = "";
    this._message = null;
    try {
      await downloadModel(
        this._config,
        this._repoId,
        file.rfpath,
        file.size,
        (pct, label) => {
          this._dlProgress = pct;
          this._dlLabel = label;
          this.markDirty();
          this._ctx?.scheduleRender();
        },
        this._config.hfToken || undefined,
      );
      this._message = `Downloaded: ${file.rfpath}`;
      this._ctx?.showMessage(this._message!);
      await this._refreshModels();
    } catch (err: any) {
      this._message = `Download error: ${err.message}`;
    }
    this._downloading = false;
    this.markDirty();
    this._ctx?.scheduleRender();
  }

  async _openRepoFiles(repoId: string): Promise<void> {
    if (!this._config) return;
    this._focusArea = "files";
    this._repoId = repoId;
    this._repoFiles = [];
    this._fileIndex = 0;
    this._fetchingFiles = true;
    this._message = null;
    try {
      const files = await listFiles(repoId, this._config.hfToken || undefined);
      this._repoFiles = files;
      this._fileIndex = 0;
    } catch (err: any) {
      this._message = `Files error: ${err.message}`;
    }
    this._fetchingFiles = false;
    this.markDirty();
    this._ctx?.scheduleRender();
  }

  async _fetchModelCard(repoId: string): Promise<void> {
    if (!this._config) return;
    this._focusArea = "modelcard";
    this._fetchingCard = true;
    this._message = null;
    try {
      const info = await getModelInfo(repoId, this._config.hfToken || undefined);
      this._modelCard = info;
    } catch (err: any) {
      this._message = `Card error: ${err.message}`;
    }
    this._fetchingCard = false;
    this.markDirty();
    this._ctx?.scheduleRender();
  }

  // — Key handlers —

  _handleSearchEditModeKey(key: string): boolean {
    if (key === "RETURN" || key === "ENTER") {
      this._submitSearch();
      return true;
    }
    if (key === "ESC" || key === "CTRL_C") {
      this._editMode = false;
      this._editValue = "";
      this._ctx?.setTextInputFocused(false);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "BACKSPACE" || key === "DEL") {
      this._editValue = this._editValue.slice(0, -1);
      return true;
    }
    return true;
  }

  _handleBrowseEditModeKey(key: string): boolean {
    if (key === "RETURN" || key === "ENTER") {
      this._browseSearchQuery = this._browseEditValue.trim();
      this._browseEditMode = false;
      this._browseEditValue = "";
      this._ctx?.setTextInputFocused(false);
      this.markDirty();
      this._ctx?.scheduleRender();
      this._fetchBrowse();
      return true;
    }
    if (key === "ESC" || key === "CTRL_C") {
      this._browseEditMode = false;
      this._browseEditValue = "";
      this._ctx?.setTextInputFocused(false);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "BACKSPACE" || key === "DEL") {
      this._browseEditValue = this._browseEditValue.slice(0, -1);
      return true;
    }
    return true;
  }

  _handleListKey(key: string): boolean {
    if (key === "k" || key === "UP") {
      if (this._selectedIndex === 0) {
        this._focusArea = "buttons";
        this._buttonBar.focus();
        this.markDirty();
        this._ctx?.scheduleRender();
        return true;
      }
      this._selectedIndex = clampIndex(this._selectedIndex - 1, this._models.length);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "j" || key === "DOWN") {
      this._selectedIndex = clampIndex(this._selectedIndex + 1, this._models.length);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "RETURN" || key === "ENTER") {
      this._focusArea = "buttons";
      this._buttonBar.focus();
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    return false;
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

  _handleSearchKey(key: string): boolean {
    if (key === "k" || key === "UP") {
      this._searchIndex = clampIndex(this._searchIndex - 1, this._searchResults.length);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "j" || key === "DOWN") {
      this._searchIndex = clampIndex(this._searchIndex + 1, this._searchResults.length);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "g" || key === "ESC") {
      this._focusArea = "list";
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "e") {
      this._editMode = true;
      this._editValue = this._searchQuery;
      this._ctx?.setTextInputFocused(true);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "RETURN" || key === "ENTER") {
      if (this._searchResults.length > 0 && this._searchIndex < this._searchResults.length) {
        this._openRepoFiles(this._searchResults[this._searchIndex].id);
      }
      return true;
    }
    return false;
  }

  _handleFilesKey(key: string): boolean {
    if (key === "k" || key === "UP") {
      this._fileIndex = clampIndex(this._fileIndex - 1, this._repoFiles.length);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "j" || key === "DOWN") {
      this._fileIndex = clampIndex(this._fileIndex + 1, this._repoFiles.length);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "g" || key === "ESC") {
      this._focusArea = "search";
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "RETURN" || key === "ENTER") {
      if (this._repoFiles.length > 0 && this._fileIndex < this._repoFiles.length) {
        this._downloadSelectedFile().catch(() => {});
      }
      return true;
    }
    return false;
  }

  _handleBrowseKey(key: string): boolean {
    if (key === "k" || key === "UP") {
      this._browseIndex = clampIndex(this._browseIndex - 1, this._browseResults.length);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "j" || key === "DOWN") {
      this._browseIndex = clampIndex(this._browseIndex + 1, this._browseResults.length);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "g" || key === "ESC") {
      this._focusArea = "list";
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "f") {
      this._focusArea = "browsefilters";
      this._filterIndex = 0;
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "s") {
      this._focusArea = "browsesort";
      this._sortIndex = this._browseSort;
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "m") {
      if (this._browseResults.length > 0 && this._browseIndex < this._browseResults.length) {
        this._fetchModelCard(this._browseResults[this._browseIndex].id).catch(() => {});
      }
      return true;
    }
    if (key === "e") {
      this._browseEditMode = true;
      this._browseEditValue = this._browseSearchQuery;
      this._ctx?.setTextInputFocused(true);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "RETURN" || key === "ENTER") {
      if (this._browseResults.length > 0 && this._browseIndex < this._browseResults.length) {
        this._openRepoFiles(this._browseResults[this._browseIndex].id);
      }
      return true;
    }
    return false;
  }

  _handleBrowseFiltersKey(key: string): boolean {
    if (key === "h" || key === "LEFT") {
      this._filterIndex = clampIndex(this._filterIndex - 1, ALL_FILTERS.length);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "l" || key === "RIGHT") {
      this._filterIndex = clampIndex(this._filterIndex + 1, ALL_FILTERS.length);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "RETURN" || key === "ENTER") {
      const filterGroup = ALL_FILTERS[this._filterIndex];
      if (TASK_FILTERS.includes(filterGroup)) {
        for (let i = 0; i < TASK_FILTERS.length; i++) {
          this._browseFilters[i] = false;
        }
        const taskIdx = TASK_FILTERS.indexOf(filterGroup);
        if (taskIdx >= 0) {
          this._browseFilters[taskIdx] = true;
        }
      } else {
        this._browseFilters[this._filterIndex] = !this._browseFilters[this._filterIndex];
      }
      this._fetchBrowse().catch(() => {});
      return true;
    }
    if (key === "g" || key === "ESC") {
      this._focusArea = "browse";
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "s") {
      this._focusArea = "browsesort";
      this._sortIndex = this._browseSort;
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    return false;
  }

  _handleBrowseSortKey(key: string): boolean {
    if (key === "h" || key === "LEFT") {
      this._sortIndex = clampIndex(this._sortIndex - 1, SORT_OPTIONS.length);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "l" || key === "RIGHT") {
      this._sortIndex = clampIndex(this._sortIndex + 1, SORT_OPTIONS.length);
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "R") {
      this._browseDirection = this._browseDirection === -1 ? 1 : -1;
      this._fetchBrowse().catch(() => {});
      return true;
    }
    if (key === "RETURN" || key === "ENTER") {
      this._browseSort = this._sortIndex;
      this._fetchBrowse().catch(() => {});
      this._focusArea = "browse";
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "g" || key === "ESC") {
      this._focusArea = "browse";
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    return false;
  }

  _handleModelCardKey(key: string): boolean {
    if (key === "g" || key === "m" || key === "ESC") {
      this._focusArea = "browse";
      this.markDirty();
      this._ctx?.scheduleRender();
      return true;
    }
    if (key === "RETURN" || key === "ENTER") {
      if (this._modelCard) {
        this._openRepoFiles(this._modelCard.id);
      }
      return true;
    }
    return false;
  }

  // — Rendering —

  _renderDividerAt(y: number, width: number): number {
    this._divider.rect = { x: 0, y, width, height: 1 };
    this._divider.needsRender = true;
    this._divider.render();
    return y + 1;
  }

  _renderHeader(term: any, width: number, startY: number): number {
    const titleLine = ` Models │ ${this._models.length} local │ ${formatSize(this._totalSize)} used`;
    const dirLine = ` Dir: ${this._config ? getModelsDir(this._config) : "N/A"}`;

    let y = startY;
    renderLine(term, y++, () => {
      fg(term, themeColors.text, titleLine);
      term(" ".repeat(Math.max(0, width - titleLine.length)));
    });
    renderLine(term, y++, () => {
      fg(term, themeColors.textMuted, dirLine);
      term(" ".repeat(Math.max(0, width - dirLine.length)));
    });
    return this._renderDividerAt(y, width);
  }

  _renderModelList(term: any, width: number, startY: number): number {
    let y = startY;

    if (this._models.length === 0) {
      renderLine(term, y++, () => {
        fg(term, themeColors.textMuted, "  No models found.");
      });
      renderLine(term, y++, () => {});
      return y;
    }

    for (let i = 0; i < this._models.length; i++) {
      const m = this._models[i];
      const label = `${m.repoId}/${m.filename}`;
      const sizeLabel = ` (${formatSize(m.sizeBytes)})`;
      const activeLabel = m.active ? " (active)" : "";

      if (i === this._selectedIndex) {
        renderLine(term, y++, () => {
          term.bold();
          fg(term, themeColors.selectedText, "  ");
          term.bgColorRgbHex(themeColors.selectedBg)(
            `● ${label}${sizeLabel}${activeLabel}`,
          );
          term.styleReset();
        });
      } else {
        renderLine(term, y++, () => {
          fg(term, m.active ? themeColors.success : themeColors.text, "  ");
          fg(
            term,
            m.active ? themeColors.success : themeColors.text,
            `○ ${label}${sizeLabel}${activeLabel}`,
          );
        });
      }
    }
    renderLine(term, y++, () => {});
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

  _renderSearchResults(term: any, width: number, startY: number): number {
    let y = startY;

    if (this._searchResults.length === 0) {
      renderLine(term, y++, () => {
        fg(term, themeColors.textMuted, "  No results.");
      });
      renderLine(term, y++, () => {});
      return y;
    }

    for (let i = 0; i < this._searchResults.length; i++) {
      const r = this._searchResults[i];
      const label = `${r.id} (${r.likes} likes)`;
      if (i === this._searchIndex) {
        renderLine(term, y++, () => {
          term.bold();
          fg(term, themeColors.selectedText, "  ");
          term.bgColorRgbHex(themeColors.selectedBg)(`▸ ${label}`);
          term.styleReset();
        });
      } else {
        renderLine(term, y++, () => {
          fg(term, themeColors.text, "  ");
          fg(term, themeColors.text, `  ${label}`);
        });
      }
    }
    renderLine(term, y++, () => {});
    return y;
  }

  _renderRepoFiles(term: any, width: number, startY: number): number {
    let y = startY;

    renderLine(term, y++, () => {
      fg(term, themeColors.textMuted, `  Repo: ${this._repoId}`);
    });
    renderLine(term, y++, () => {});

    if (this._repoFiles.length === 0) {
      renderLine(term, y++, () => {
        fg(term, themeColors.textMuted, "  No GGUF files.");
      });
      renderLine(term, y++, () => {});
      return y;
    }

    for (let i = 0; i < this._repoFiles.length; i++) {
      const f = this._repoFiles[i];
      const label = `${f.rfpath} (${formatSize(f.size)})`;
      if (i === this._fileIndex) {
        renderLine(term, y++, () => {
          term.bold();
          fg(term, themeColors.selectedText, "  ");
          term.bgColorRgbHex(themeColors.selectedBg)(`▸ ${label}`);
          term.styleReset();
        });
      } else {
        renderLine(term, y++, () => {
          fg(term, themeColors.text, "  ");
          fg(term, themeColors.text, `  ${label}`);
        });
      }
    }
    renderLine(term, y++, () => {});
    return y;
  }

  _renderBrowseResults(term: any, width: number, startY: number): number {
    let y = startY;

    if (this._browseResults.length === 0) {
      renderLine(term, y++, () => {
        fg(term, themeColors.textMuted, "  No results.");
      });
      renderLine(term, y++, () => {});
      return y;
    }

    for (let i = 0; i < this._browseResults.length; i++) {
      const r = this._browseResults[i];
      const label = `${r.id} │ ${r.likes} ♥ │ ${r.downloads ?? 0} ↓`;
      if (i === this._browseIndex) {
        renderLine(term, y++, () => {
          term.bold();
          fg(term, themeColors.selectedText, "  ");
          term.bgColorRgbHex(themeColors.selectedBg)(`▸ ${label}`);
          term.styleReset();
        });
      } else {
        renderLine(term, y++, () => {
          fg(term, themeColors.text, "  ");
          fg(term, themeColors.text, `  ${label}`);
        });
      }
    }
    renderLine(term, y++, () => {});
    return y;
  }

  _renderBrowseFilters(term: any, width: number, startY: number): number {
    const innerW = width - 2;
    const parts: string[] = [];
    for (let i = 0; i < ALL_FILTERS.length; i++) {
      const f = ALL_FILTERS[i];
      const prefix = this._browseFilters[i] ? "●" : "○";
      parts.push(`${prefix} ${f.label}`);
    }
    const bar = parts.join(" │ ");

    let y = renderBox({ term, width, borderColor: themeColors.border, startY }, [
      {
        render: () => {
          fg(term, themeColors.textMuted, " Filters:");
          term(" ".repeat(Math.max(0, innerW - " Filters:".length)));
        },
      },
      {
        render: () => {
          for (let i = 0; i < ALL_FILTERS.length; i++) {
            if (i > 0) fg(term, themeColors.textMuted, " │");
            const prefix = this._browseFilters[i] ? "●" : "○";
            if (i === this._filterIndex) {
              term.bold();
              fg(term, themeColors.selected, ` ${prefix} ${ALL_FILTERS[i].label} `);
              term.styleReset();
            } else {
              fg(term, themeColors.text, `${prefix} ${ALL_FILTERS[i].label}`);
            }
          }
          term(" ".repeat(Math.max(0, innerW - bar.length)));
        },
      },
    ]);
    renderLine(term, y++, () => {});
    return y;
  }

  _renderBrowseSort(term: any, width: number, startY: number): number {
    const innerW = width - 2;
    const parts: string[] = [];
    for (let i = 0; i < SORT_OPTIONS.length; i++) {
      const opt = SORT_OPTIONS[i];
      const arrow = this._browseDirection === -1 && i === this._sortIndex ? " ▼" : "";
      parts.push(opt.label + arrow);
    }
    const bar = parts.join(" │ ");

    let y = renderBox({ term, width, borderColor: themeColors.border, startY }, [
      {
        render: () => {
          fg(term, themeColors.textMuted, " Sort:");
          term(" ".repeat(Math.max(0, innerW - " Sort:".length)));
        },
      },
      {
        render: () => {
          for (let i = 0; i < SORT_OPTIONS.length; i++) {
            if (i > 0) fg(term, themeColors.textMuted, " │");
            const opt = SORT_OPTIONS[i];
            const arrow = this._browseDirection === -1 && i === this._sortIndex ? " ▼" : "";
            if (i === this._sortIndex) {
              term.bold();
              fg(term, themeColors.selected, ` ${opt.label}${arrow} `);
              term.styleReset();
            } else {
              fg(term, themeColors.text, opt.label);
            }
          }
          term(" ".repeat(Math.max(0, innerW - bar.length)));
        },
      },
    ]);
    renderLine(term, y++, () => {});
    return y;
  }

  _renderModelCard(term: any, width: number, startY: number): number {
    const innerW = width - 2;
    let y = startY;

    if (!this._modelCard) {
      renderLine(term, y++, () => {
        fg(term, themeColors.textMuted, "  No model info.");
      });
      renderLine(term, y++, () => {});
      return y;
    }
    const c = this._modelCard;
    const cardLines = [
      ` ID: ${c.id}`,
      ` Author: ${c.author}`,
      ` Likes: ${c.likes}  Downloads: ${c.downloads}`,
      ` Tags: ${(c.tags || []).join(", ")}`,
      ` Pipeline: ${c.pipelineTag || "N/A"}`,
      ` Created: ${c.createdAt}`,
      ` Modified: ${c.lastModified}`,
    ];
    y = renderBox({ term, width, borderColor: themeColors.border, startY: y }, cardLines.map(line => ({
      render: () => {
        fg(term, themeColors.text, line);
        term(" ".repeat(Math.max(0, innerW - line.length)));
      },
    })));
    renderLine(term, y++, () => {});
    return y;
  }

  _renderDownloadProgress(term: any, width: number, startY: number): number {
    if (!this._downloading) return startY;

    const progress = this._dlProgress;
    const label = "Downloading...";
    const barWidth = Math.min(40, width - 10);
    const filled = Math.floor((progress / 100) * barWidth);
    const empty = barWidth - filled;

    renderLine(term, startY++, () => {
      fg(term, themeColors.text, ` ${label} `);
      fg(term, themeColors.border, "\u250c");
      fg(term, themeColors.success, "\u2588".repeat(filled));
      fg(term, themeColors.textMuted, "\u2591".repeat(empty));
      fg(term, themeColors.border, "\u2510");
      fg(term, themeColors.text, ` ${progress}%`);
      if (this._dlLabel) {
        fg(term, themeColors.textMuted, ` ${this._dlLabel}`);
      }
    });

    return startY;
  }

  _renderHelp(startY: number): number {
    const helpTexts: Record<string, string> = {
      list: "j/k navigate │ UP to actions │ Enter select",
      buttons: "h/l navigate │ Enter execute │ DOWN to list",
      search: "j/k navigate │ Enter open │ g back │ e new search",
      files: "j/k navigate │ Enter download │ g back",
      browse: "j/k navigate │ f filters │ s sort │ m card │ Enter open │ g back │ e search",
      browsefilters: "h/l navigate │ Enter toggle │ g back",
      browsesort: "h/l navigate │ Enter apply │ R reverse │ g back",
      modelcard: "m/g close │ Enter open repo",
    };

    const hint = helpTexts[this._focusArea] || "";

    this._helpSpacer.rect = { x: 0, y: startY, width: this.rect.width, height: 1 };
    this._helpSpacer.needsRender = true;
    this._helpSpacer.render();

    this._helpBar.text = hint;
    this._helpBar.rect = { x: 0, y: startY + 1, width: this.rect.width, height: 1 };
    this._helpBar.needsRender = true;
    this._helpBar.render();

    return startY + 2;
  }

  onDetach(): void {
    this._config = null;
    this._models = [];
    this._selectedIndex = 0;
    this._focusArea = "buttons";
    this._loading = false;
    this._message = null;
    this._totalSize = 0;
    this._searching = false;
    this._searchQuery = "";
    this._searchResults = [];
    this._searchIndex = 0;
    this._downloading = false;
    this._dlProgress = 0;
    this._dlLabel = "";
    this._repoFiles = [];
    this._repoId = "";
    this._fileIndex = 0;
    this._fetchingFiles = false;
    this._editMode = false;
    this._editValue = "";
    this._browseResults = [];
    this._browseIndex = 0;
    this._browseSort = 0;
    this._browseDirection = -1;
    this._browseFilters = new Array(ALL_FILTERS.length).fill(false);
    this._filterIndex = 0;
    this._sortIndex = 0;
    this._modelCard = null;
    this._fetchingCard = false;
    this._browseSearchQuery = "";
    this._browseEditMode = false;
    this._browseEditValue = "";
    this._initPromise = null;
  }
}

export function createModelsTab(ctx: TabContext) {
  return new ModelsControl(ctx);
}
