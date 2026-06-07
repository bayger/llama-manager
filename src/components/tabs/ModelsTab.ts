import { Control } from "../ui/Control.js";
import { Column, Row } from "../ui/Layout.js";
import { Button } from "../ui/widgets/Button.js";
import { Divider } from "../ui/widgets/Divider.js";
import { Label } from "../ui/widgets/Label.js";
import { List, ListItem } from "../ui/widgets/List.js";
import { TextInput } from "../ui/widgets/TextInput.js";
import { ProgressBar } from "../ui/widgets/ProgressBar.js";
import { themeColors, fg, fgBg } from "../../lib/theme.js";
import { focusManager } from "../ui/FocusManager.js";
import {
  listLocalModels,
  deleteModel,
  setActiveModel,
  downloadModel,
  LocalModel,
  formatSize,
  getTotalModelsSize,
} from "../../lib/models.js";
import { browseModels, listFiles, HFRepoInfo, HFFileInfo } from "../../lib/hf.js";
import { saveConfig } from "../../lib/config.js";
import { fireAsync } from "../../lib/utils.js";
import type { TabContext } from "../../lib/tabcontext.js";
import type { Size } from "../ui/types.js";

type ViewMode = "local" | "search" | "results" | "files" | "downloading";

export class ModelsControl extends Control {
  protected _ctx: TabContext | null = null;
  protected _attached = false;

  protected _view: ViewMode = "local";

  // Local models
  protected _column: Column;
  protected _headerLabel: Label;
  protected _buttonRow: Row;
  protected _browseBtn: Button;
  protected _removeBtn: Button;
  protected _modelList: List<string>;

  // HF Browser
  protected _hfColumn: Column;
  protected _hfHeaderLabel: Label;
  protected _hfSearchRow: Row;
  protected _hfSearchInput: TextInput;
  protected _hfSearchBtn: Button;
  protected _hfBrowseBtn: Button;
  protected _hfContentColumn: Column;
  protected _hfResultsList: List<string>;
  protected _hfFilesList: List<string>;
  protected _hfProgressBar: ProgressBar;
  protected _hfButtonRow: Row;
  protected _hfBackBtn: Button;
  protected _hfNextBtn: Button;
  protected _hfCancelBtn: Button;

  // HF Browser state
  protected _searchQuery = "";
  protected _searchOffset = 0;
  protected _repos: HFRepoInfo[] = [];
  protected _selectedRepo: HFRepoInfo | null = null;
  protected _files: HFFileInfo[] = [];
  protected _downloadAbortController: AbortController | null = null;
  protected _downloadCancelled = false;

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;

    // --- Local models view ---
    this._headerLabel = new Label();
    this._headerLabel.text = "Models: 0  Size: 0 B";
    this._headerLabel.color = themeColors.text;

    this._browseBtn = new Button({ label: "Browse HF" });
    this._removeBtn = new Button({ label: "Remove" });
    this._buttonRow = new Row();
    this._buttonRow.add(this._browseBtn);
    this._buttonRow.add(this._removeBtn);

    this._modelList = new List<string>();
    this._modelList.flex = 1;
    this._modelList.setOnSelect((item) => {
      const model = (item as any).data as LocalModel;
      this.selectModel(model);
    });
    this._modelList.setRenderer((term, item, _index, isSelected, _x, rowY, width) => {
      const model = (item as any).data as LocalModel;
      const prefix = model.active ? "\u25cf " : "  ";
      const name = `${model.repoId}/${model.filename}`;
      const size = formatSize(model.sizeBytes);
      const line = ` ${prefix}${name}  ${size}`;

      if (isSelected) {
        fgBg(term, themeColors.accent, themeColors.canvas, line.padEnd(width));
        term.styleReset();
      } else {
        term.moveTo(_x, rowY);
        fg(term, model.active ? themeColors.success : themeColors.text, line);
      }
    });

    this._column = new Column();
    this._column.add(this._headerLabel);
    this._column.add(new Divider());
    this._column.add(this._buttonRow);
    this._column.add(new Divider());
    this._column.add(this._modelList);

    // --- HF Browser view ---
    this._hfHeaderLabel = new Label();
    this._hfHeaderLabel.text = "HuggingFace Browser";
    this._hfHeaderLabel.color = themeColors.accent;

    this._hfSearchInput = new TextInput();
    this._hfSearchInput.placeholder = "Search models...";
    this._hfSearchInput.prefix = "> ";

    this._hfSearchBtn = new Button({ label: "Search" });
    this._hfBrowseBtn = new Button({ label: "Trending" });
    this._hfSearchRow = new Row();
    this._hfSearchRow.add(this._hfSearchInput);
    this._hfSearchRow.add(this._hfSearchBtn);
    this._hfSearchRow.add(this._hfBrowseBtn);

    this._hfResultsList = new List<string>();
    this._hfResultsList.flex = 1;
    this._hfResultsList.setOnSelect((item) => {
      const repo = (item as any).data as HFRepoInfo;
      this.openRepoFiles(repo);
    });
    this._hfResultsList.setRenderer((term, item, _index, isSelected, _x, rowY, width) => {
      const repo = (item as any).data as HFRepoInfo;
      const likes = repo.likes > 0 ? `\u2665 ${repo.likes}` : "";
      const downloads = repo.downloads ? `\u2193 ${repo.downloads}` : "";
      const meta = [likes, downloads].filter(Boolean).join("  ");
      const line = ` ${repo.id}${meta ? `  ${meta}` : ""}`;

      if (isSelected) {
        fgBg(term, themeColors.accent, themeColors.canvas, line.padEnd(width));
        term.styleReset();
      } else {
        term.moveTo(_x, rowY);
        fg(term, themeColors.text, line);
      }
    });

    this._hfFilesList = new List<string>();
    this._hfFilesList.flex = 1;
    this._hfFilesList.visible = false;
    this._hfFilesList.setOnSelect((item) => {
      const file = (item as any).data as HFFileInfo;
      this.downloadSelectedFile(file);
    });
    this._hfFilesList.setRenderer((term, item, _index, isSelected, _x, rowY, width) => {
      const file = (item as any).data as HFFileInfo;
      const size = formatSize(file.size);
      const line = ` ${file.path}  ${size}`;

      if (isSelected) {
        fgBg(term, themeColors.accent, themeColors.canvas, line.padEnd(width));
        term.styleReset();
      } else {
        term.moveTo(_x, rowY);
        fg(term, themeColors.text, line);
      }
    });

    this._hfProgressBar = new ProgressBar();
    this._hfProgressBar.visible = false;
    this._hfProgressBar.filledColor = themeColors.success;

    this._hfContentColumn = new Column();
    this._hfContentColumn.add(this._hfResultsList);
    this._hfContentColumn.add(this._hfFilesList);
    this._hfContentColumn.add(this._hfProgressBar);

    this._hfBackBtn = new Button({ label: "Back" });
    this._hfNextBtn = new Button({ label: "Next Page" });
    this._hfCancelBtn = new Button({ label: "Cancel" });
    this._hfBackBtn.visible = false;
    this._hfNextBtn.visible = false;
    this._hfCancelBtn.visible = false;
    this._hfButtonRow = new Row();
    this._hfButtonRow.add(this._hfBackBtn);
    this._hfButtonRow.add(this._hfNextBtn);
    this._hfButtonRow.add(this._hfCancelBtn);

    this._hfColumn = new Column();
    this._hfColumn.add(this._hfHeaderLabel);
    this._hfColumn.add(new Divider());
    this._hfColumn.add(this._hfSearchRow);
    this._hfColumn.add(new Divider());
    this._hfColumn.add(this._hfContentColumn);
    this._hfColumn.add(new Divider());
    this._hfColumn.add(this._hfButtonRow);
    this._hfColumn.visible = false;

    this.add(this._column);
    this.add(this._hfColumn);
  }

  measure(parentSize?: Size): Size {
    return parentSize ? { width: parentSize.width, height: parentSize.height } : super.measure(parentSize);
  }

  onLayout(): void {
    if (this._view === "local") {
      this._column.visible = true;
      this._hfColumn.visible = false;
      this._column.layout(this.rect);
    } else {
      this._column.visible = false;
      this._hfColumn.visible = true;
      this._hfColumn.layout(this.rect);
    }
    this.needsRender = true;
  }

  onAttach(): void {
    if (!this._ctx || this._attached) return;
    this._attached = true;

    this._browseBtn.setAction(() => {
      this.enterBrowseMode();
    });

    this._removeBtn.setAction(() => {
      this.removeSelected();
    });

    this._hfSearchBtn.setAction(() => {
      this._searchQuery = this._hfSearchInput.value;
      this._searchOffset = 0;
      this.searchRepos();
    });

    this._hfBrowseBtn.setAction(() => {
      this._searchQuery = "";
      this._hfSearchInput.value = "";
      this._searchOffset = 0;
      this.browseTrending();
    });

    this._hfBackBtn.setAction(() => {
      this.goBack();
    });

    this._hfNextBtn.setAction(() => {
      this._searchOffset += 20;
      if (this._view === "results") {
        this.loadResults();
      }
    });

    this._hfCancelBtn.setAction(() => {
      this.cancelDownload();
    });

    this._hfSearchInput.setOnSubmit((value) => {
      this._searchQuery = value;
      this._searchOffset = 0;
      this.searchRepos();
    });

    this.refreshModels();
  }

  onDetach(): void {
    this._attached = false;
    this._ctx = null;
    if (this._downloadAbortController) {
      this._downloadAbortController.abort();
      this._downloadAbortController = null;
    }
  }

  onFocus(): void {
    super.onFocus();
    if (this._view === "local") {
      focusManager.setFocus(this._browseBtn);
    }
  }

  // --- Key handling ---
  handleKey(key: string): boolean {
    if (this._view !== "local" && key === "ESC") {
      if (this._view === "downloading") {
        this.cancelDownload();
      } else {
        this.goBack();
      }
      return true;
    }
    return super.handleKey(key);
  }

  // --- View transitions ---
  enterBrowseMode(): void {
    this._view = "search";
    this._searchOffset = 0;
    this._hfSearchInput.value = "";
    this.updateView();
    focusManager.setFocus(this._hfSearchInput);
    focusManager.activateTextInput(true);
  }

  goBack(): void {
    if (this._view === "results") {
      this._view = "search";
      this._hfResultsList.selectedIndex = -1;
    } else if (this._view === "files") {
      this._view = "results";
      this._hfFilesList.selectedIndex = -1;
      const idx = this._repos.indexOf(this._selectedRepo!);
      if (idx !== -1) this._hfResultsList.selectedIndex = idx;
    } else if (this._view === "downloading") {
      this.cancelDownload();
      return;
    } else if (this._view === "search") {
      this._view = "local";
      focusManager.activateTextInput(false);
      this.refreshModels();
    } else {
      this._view = "local";
      focusManager.activateTextInput(false);
      this.refreshModels();
    }
    this.updateView();
  }

  updateView(): void {
    const isSearch = this._view === "search";
    const isResults = this._view === "results";
    const isFiles = this._view === "files";
    const isDownloading = this._view === "downloading";

    // Search row visibility
    this._hfSearchRow.visible = isSearch;

    // Content visibility
    this._hfResultsList.visible = isResults;
    this._hfFilesList.visible = isFiles;
    this._hfProgressBar.visible = isDownloading;

    // Button visibility
    this._hfBackBtn.visible = !isSearch;
    this._hfNextBtn.visible = isResults;
    this._hfCancelBtn.visible = isDownloading;

    // Header
    if (isSearch) {
      this._hfHeaderLabel.text = "HuggingFace Browser";
    } else if (isResults) {
      this._hfHeaderLabel.text = `Search Results (${this._repos.length})`;
    } else if (isFiles) {
      this._hfHeaderLabel.text = this._selectedRepo ? this._selectedRepo.id : "Files";
    } else if (isDownloading) {
      this._hfHeaderLabel.text = "Downloading...";
    }

    // Focus
    if (isSearch) {
      focusManager.setFocus(this._hfSearchInput);
      focusManager.activateTextInput(true);
    } else if (isResults) {
      focusManager.activateTextInput(false);
      focusManager.setFocus(this._hfBackBtn);
    } else if (isFiles) {
      focusManager.activateTextInput(false);
      focusManager.setFocus(this._hfBackBtn);
    }

    this.markDirty();
  }

  // --- HF Search ---
  searchRepos(): void {
    if (!this._searchQuery.trim()) {
      this.browseTrending();
      return;
    }
    fireAsync(async () => {
      const config = this._ctx?.getConfig();
      const token = config?.app?.hfToken || undefined;
      this._repos = await browseModels({
        search: this._searchQuery,
        sort: "likes",
        limit: 20,
      }, token);
      this.showResults();
    }, this._ctx!);
  }

  browseTrending(): void {
    fireAsync(async () => {
      const config = this._ctx?.getConfig();
      const token = config?.app?.hfToken || undefined;
      this._repos = await browseModels({
        sort: "likes",
        limit: 20,
      }, token);
      this.showResults();
    }, this._ctx!);
  }

  loadResults(): void {
    fireAsync(async () => {
      const config = this._ctx?.getConfig();
      const token = config?.app?.hfToken || undefined;
      const repos = await browseModels({
        search: this._searchQuery || undefined,
        sort: "likes",
        limit: 20,
        offset: this._searchOffset,
      }, token);
      this._repos = repos;
      this.showResults();
    }, this._ctx!);
  }

  showResults(): void {
    const items: ListItem<string>[] = this._repos.map((repo, i) => ({
      id: String(i),
      label: repo.id,
      data: repo,
    }));
    this._hfResultsList.updateItems(items);
    this._view = "results";
    this.updateView();
  }

  // --- Repo files ---
  openRepoFiles(repo: HFRepoInfo): void {
    this._selectedRepo = repo;
    fireAsync(async () => {
      const config = this._ctx?.getConfig();
      const token = config?.app?.hfToken || undefined;
      this._files = await listFiles(repo.id, token);
      const items: ListItem<string>[] = this._files.map((file, i) => ({
        id: String(i),
        label: file.path,
        data: file,
      }));
      this._hfFilesList.updateItems(items);
      this._view = "files";
      this.updateView();
    }, this._ctx!);
  }

  // --- Download ---
  downloadSelectedFile(file: HFFileInfo): void {
    const config = this._ctx?.getConfig();
    if (!config || !this._selectedRepo) return;

    this._downloadAbortController = new AbortController();
    this._view = "downloading";
    this._hfProgressBar.progress = 0;
    this._hfProgressBar.label = "Preparing...";
    this._hfProgressBar.extraLabel = "";
    this.updateView();

    const token = config.app?.hfToken || undefined;

    fireAsync(async () => {
      await downloadModel(
        config,
        this._selectedRepo!.id,
        file.path,
        file.size,
        (pct, label) => {
          this._hfProgressBar.progress = pct;
          this._hfProgressBar.label = `${this._selectedRepo!.id}/${file.path}`;
          this._hfProgressBar.extraLabel = label;
          this.markDirty();
        },
        token,
        this._downloadAbortController?.signal,
      );

      this._downloadAbortController = null;
      if (this._downloadCancelled) {
        this._downloadCancelled = false;
        return;
      }
      this._ctx?.showMessage(`Downloaded ${file.path}`);
      this._view = "local";
      this.updateView();
      this.refreshModels();
    }, this._ctx!);
  }

  cancelDownload(): void {
    this._downloadCancelled = true;
    if (this._downloadAbortController) {
      this._downloadAbortController.abort();
      this._downloadAbortController = null;
    }
    this._view = "files";
    this.updateView();
  }

  // --- Local models ---
  refreshModels(): void {
    const config = this._ctx?.getConfig();
    if (!config) return;

    (async () => {
      const [models, totalSize] = await Promise.all([
        listLocalModels(config),
        getTotalModelsSize(config),
      ]);

      const items: ListItem<string>[] = models.map(m => ({
        id: m.path,
        label: `${m.repoId}/${m.filename}`,
        data: m,
      }));

      this._modelList.updateItems(items);
      this._headerLabel.text = `Models: ${models.length}  Size: ${formatSize(totalSize)}`;
      this.markDirty();
    })();
  }

  selectModel(model: LocalModel): void {
    const config = this._ctx?.getConfig();
    if (!config) return;

    (async () => {
      const updated = await setActiveModel(config, model.repoId, model.filename);
      const profile = updated.server.profiles[updated.server.activeProfile];
      if (profile && profile.presets.model) {
        profile.presets.model.model = model.path;
      }
      await saveConfig(updated);
      this._ctx?.setConfig(updated);
      this._ctx?.showMessage(`Selected ${model.filename}`);
      this.refreshModels();
    })();
  }

  removeSelected(): void {
    const selected = this._modelList.getSelectedItem();
    if (!selected) return;

    const config = this._ctx?.getConfig();
    if (!config) return;

    (async () => {
      const model = (selected as any).data as LocalModel;
      const updated = await deleteModel(config, model.path);
      await saveConfig(updated);
      this._ctx?.setConfig(updated);
      this._ctx?.showMessage(`Removed ${model.filename}`);
      this.refreshModels();
    })();
  }

  override markDirty(): void {
    super.markDirty();
    this._ctx?.scheduleRender();
  }
}

export function createModelsTab(ctx: TabContext): Control {
  return new ModelsControl(ctx);
}
