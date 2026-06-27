import { Control } from "../ui/Control";
import { Column, Row } from "../ui/Layout";
import { Button } from "../ui/widgets/Button";
import { Label } from "../ui/widgets/Label";
import { Spacer } from "../ui/widgets/Spacer";
import { Table, TableItem } from "../ui/widgets/Table";
import { TextInput } from "../ui/widgets/TextInput";
import { Section } from "../ui/widgets/Section";
import { StyledText } from "../ui/widgets/StyledText";
import { focusManager } from "../ui/FocusManager";
import {
  listLocalModels,
  deleteModel,
  setActiveModel,
  downloadModel,
  LocalModel,
  formatSize,
  getTotalModelsSize,
} from "../../lib/models";
import { browseModels, listFiles, HFRepoInfo, HFFileInfo } from "../../lib/hf";
import { saveConfig } from "../../lib/config";
import { fireAsync, formatDate } from "../../lib/utils";
import { inspectGGUF } from "../../lib/gguf";
import { createDownloadDialog } from "../ui/widgets/DownloadDialog";
import { createConfirmDialog } from "../ui/widgets/ConfirmDialog";
import { GGUFInfoPanel } from "../specialized/GGUFInfoPanel";
import type { TabContext } from "../../lib/tabcontext";
import type { Size } from "../ui/types";

type ViewMode = "local" | "search" | "results" | "files";

export class ModelsControl extends Control {
  focusable = true;
  protected _ctx: TabContext | null = null;

  protected _view: ViewMode = "local";

  // Local models
  protected _column: Column;
  protected _buttonRow: Row;
  protected _browseBtn: Button;
  protected _removeBtn: Button;
  protected _modelListSection: Section;
  protected _detailsSection: Section;
  protected _modelList: Table<LocalModel>;
  protected _ggufPanel: GGUFInfoPanel;
  protected _summary: StyledText;
  protected _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  protected _lastInspectedPath = "";

  // HF Browser
  protected _hfColumn: Column;

  protected _hfSearchInput: TextInput;
  protected _hfSearchLabel: Label;
  protected _hfSearchBtn: Button;
  protected _hfBrowseBtn: Button;
  protected _hfContentColumn: Column;
  protected _hfResultsSection: Section;
  protected _hfResultsList: Table<HFRepoInfo>;
  protected _hfResultsEmpty: StyledText;
  protected _hfFilesSection: Section;
  protected _hfFilesList: Table<HFFileInfo>;
  protected _hfFilesEmpty: StyledText;
  protected _hfButtonRow: Row;
  protected _hfBackBtn: Button;
  protected _hfPrevBtn: Button;
  protected _hfNextBtn: Button;
  protected _hfCancelBtn: Button;

  // HF Browser state
  protected _searchQuery = "";
  protected _searchPage = 0;
  protected _allRepos: HFRepoInfo[] = [];
  protected _repos: HFRepoInfo[] = [];
  protected _selectedRepo: HFRepoInfo | null = null;
  protected _PAGE_SIZE = 20;
  protected _files: HFFileInfo[] = [];
  protected _downloadAbortController: AbortController | null = null;

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;

    this._summary = new StyledText();
    this._summary.flex = 1;

    // --- Local models view ---
    this._browseBtn = new Button({ label: "Browse HF" });
    this._removeBtn = new Button({ label: "Delete" });
    this._buttonRow = new Row();
    this._buttonRow.add(this._browseBtn);
    this._buttonRow.add(this._removeBtn);

    this._modelList = new Table<LocalModel>();
    this._modelList.showHeader = true;
    this._modelList.columns = [
      {
        label: "Name",
        width: 30,
        flex: 1,
        align: "left",
        format: (v, row: LocalModel) => {
          const m = row;
          return m.active ? `✓ ${m.repoId}/${m.filename}` : `  ${m.repoId}/${m.filename}`;
        },
      },
      {
        label: "Size",
        width: 10,
        align: "right",
        format: (v, row: LocalModel) => formatSize(row.sizeBytes),
      },
    ];

    this._modelList.setOnSelect((item) => {
      this.selectModel(item.data!);
    });

    this._modelList.setOnHighlight((item) => {
      this._handleHighlight(item);
    });

    this._modelListSection = new Section();
    this._modelListSection.title = "Downloaded Models";
    this._modelListSection.add(this._modelList);

    this._ggufPanel = new GGUFInfoPanel();

    this._detailsSection = new Section();
    this._detailsSection.title = "Model Details";
    this._detailsSection.add(this._ggufPanel);
    this._ggufPanel.flex = 1;

    this._modelListSection.flex = 1;
    const origDetailsMeasure = this._detailsSection.measure.bind(this._detailsSection);
    this._detailsSection.measure = (parentSize?: Size): Size => {
      const s = origDetailsMeasure(parentSize);
      return { width: 40, height: s.height };
    };

    const _contentRow = new Row();
    _contentRow.add(this._modelListSection);
    _contentRow.add(this._detailsSection);

    this._column = new Column();
    this._column.add(this._buttonRow);
    //this._column.add(new Spacer());
    this._column.add(_contentRow);
    _contentRow.flex = 1;

    // --- HF Browser view ---

    this._hfSearchInput = new TextInput();
    this._hfSearchInput.placeholder = "model name...";
    this._hfSearchInput.flex = 1;

    this._hfSearchLabel = new Label();
    this._hfSearchLabel.text = "Search: ";

    this._hfResultsList = new Table<HFRepoInfo>();
    this._hfResultsList.showHeader = true;
    this._hfResultsList.flex = 1;
    this._hfResultsList.columns = [
      {
        label: "Repo",
        width: 30,
        flex: 1,
        align: "left",
        format: (v, row: HFRepoInfo) => row.id,
      },
      {
        label: "Task",
        width: 20,
        align: "left",
        format: (v, row: HFRepoInfo) => row.pipeline_tag || "-",
      },
      {
        label: "Likes",
        width: 8,
        align: "right",
        format: (v, row: HFRepoInfo) => row.likes > 0 ? `\u2665 ${row.likes}` : "-",
      },
      {
        label: "Downloads",
        width: 10,
        align: "right",
        format: (v, row: HFRepoInfo) => row.downloads ? `\u2193 ${row.downloads}` : "-",
      },
      {
        label: "Date",
        width: 10,
        align: "right",
        format: (v, row: HFRepoInfo) => row.createdAt ? formatDate(row.createdAt) : "-",
      },
    ];

    this._hfResultsSection = new Section();
    this._hfResultsSection.title = "Results";
    this._hfResultsSection.add(this._hfResultsList);

    this._hfResultsEmpty = new StyledText();
    this._hfResultsEmpty.builder.muted("No models found.");
    this._hfResultsEmpty.flex = 1;
    this._hfResultsEmpty.visible = false;
    this._hfResultsSection.add(this._hfResultsEmpty);

    this._hfResultsList.setOnSelect((item) => {
      this.openRepoFiles(item.data!);
    });

    this._hfFilesList = new Table<HFFileInfo>();
    this._hfFilesList.showHeader = true;
    this._hfFilesList.flex = 1;
    this._hfFilesList.columns = [
      {
        label: "File",
        width: 30,
        flex: 1,
        align: "left",
        format: (v, row: HFFileInfo) => row.path,
      },
      {
        label: "Size",
        width: 10,
        align: "right",
        format: (v, row: HFFileInfo) => formatSize(row.size),
      },
    ];

    this._hfFilesSection = new Section();
    this._hfFilesSection.title = "Files";
    this._hfFilesSection.visible = false;
    this._hfFilesSection.add(this._hfFilesList);

    this._hfFilesEmpty = new StyledText();
    this._hfFilesEmpty.builder.muted("No GGUF files found in this repo.");
    this._hfFilesEmpty.flex = 1;
    this._hfFilesEmpty.visible = false;
    this._hfFilesSection.add(this._hfFilesEmpty);

    this._hfFilesList.setOnSelect((item) => {
      this.downloadSelectedFile(item.data!);
    });

    this._hfContentColumn = new Column();
    this._hfContentColumn.flex = 1;
    this._hfContentColumn.add(this._hfResultsSection);
    this._hfResultsSection.flex = 1;
    this._hfContentColumn.add(this._hfFilesSection);
    this._hfFilesSection.flex = 1;

    this._hfBackBtn = new Button({ label: "Back" });
    this._hfSearchBtn = new Button({ label: "Search" });
    this._hfBrowseBtn = new Button({ label: "Trending" });
    this._hfPrevBtn = new Button({ label: "Prev Page" });
    this._hfNextBtn = new Button({ label: "Next Page" });
    this._hfCancelBtn = new Button({ label: "Cancel" });
    this._hfBackBtn.visible = false;
    this._hfPrevBtn.visible = false;
    this._hfNextBtn.visible = false;
    this._hfCancelBtn.visible = false;
    this._hfButtonRow = new Row();
    this._hfButtonRow.add(this._hfBackBtn);
    this._hfButtonRow.add(this._hfBrowseBtn);
    this._hfButtonRow.add(this._hfPrevBtn);
    this._hfButtonRow.add(this._hfNextBtn);
    this._hfButtonRow.add(this._hfCancelBtn);
    this._hfButtonRow.add(this._hfSearchLabel);
    this._hfButtonRow.add(this._hfSearchInput);
    this._hfButtonRow.add(this._hfSearchBtn);

    this._hfColumn = new Column();
    this._hfColumn.add(this._hfButtonRow);
    //this._hfColumn.add(new Spacer());
    this._hfColumn.add(this._hfContentColumn);
    this._hfColumn.visible = false;

    this._buttonRow.add(this._summary);
    this.add(this._column);
    this.add(this._hfColumn);
  }

  measure(parentSize?: Size): Size {
    return parentSize ? { width: parentSize.width, height: parentSize.height } : super.measure(parentSize);
  }

  onLayout(): void {
    const contentRect = {
      x: this.rect.x,
      y: this.rect.y,
      width: this.rect.width,
      height: this.rect.height,
    };

    if (this._view === "local") {
      this._column.visible = true;
      this._hfColumn.visible = false;
      this._column.layout(contentRect);
    } else {
      this._column.visible = false;
      this._hfColumn.visible = true;
      this._hfColumn.layout(contentRect);
    }
    this.markDirty();
  }

  onInit(): void {
    if (!this._ctx) return;

    this._browseBtn.setAction(() => {
      this.enterBrowseMode();
    });

    this._removeBtn.setAction(() => {
      this.deleteSelected();
    });

    this._hfSearchBtn.setAction(() => {
       this._searchQuery = this._hfSearchInput.value;
       this._searchPage = 0;
       this.searchRepos();
     });

   this._hfBrowseBtn.setAction(() => {
       this._searchQuery = "";
       this._hfSearchInput.value = "";
       this._searchPage = 0;
       this.browseTrending();
     });

this._hfBackBtn.setAction(() => {
     this.goBack();
   });

   this._hfPrevBtn.setAction(() => {
     if (this._view === "results" && this._searchPage > 0) {
       this._searchPage--;
       this.showPage();
     }
   });

   this._hfNextBtn.setAction(() => {
      if (this._view === "results") {
        this._searchPage++;
        this.showPage();
      }
    });

   this._hfCancelBtn.setAction(() => {
     this.cancelDownload();
   });

  this._hfSearchInput.setOnSubmit((value) => {
      this._searchQuery = value;
      this._searchPage = 0;
      this.searchRepos();
    });

this._hfResultsList.handleKey = (key: string) => {
     if (key === "n") {
       this._searchPage++;
       this.showPage();
       return true;
     }
     if (key === "p" && this._searchPage > 0) {
       this._searchPage--;
       this.showPage();
       return true;
     }
     if (key === "g" && !focusManager.isTextInputActive()) {
       this.goBack();
       return true;
     }
      return Table.prototype.handleKey.call(this._hfResultsList, key);
   };

   this._hfFilesList.handleKey = (key: string) => {
     if (key === "g" && !focusManager.isTextInputActive()) {
       this.goBack();
       return true;
     }
      return Table.prototype.handleKey.call(this._hfFilesList, key);
   };

   this.refreshModels();
  }

  onDestroy(): void {
    this._ctx = null;
    if (this._downloadAbortController) {
      this._downloadAbortController.abort();
      this._downloadAbortController = null;
    }
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
  }

  protected _handleHighlight(item: TableItem<LocalModel> | null): void {
    if (!item || !this._ctx) return;
    const modelPath = item.data!.path;
    if (modelPath === this._lastInspectedPath) return;
    this._lastInspectedPath = modelPath;
    this._ggufPanel.setLoading(true);

    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }
    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null;
      fireAsync(async () => {
        const config = this._ctx?.getConfig();
        if (!config) return;
        const info = await inspectGGUF(config, modelPath);
      this._ggufPanel.setInfo(info);
        }, this._ctx!);
    }, 1000);
  }

  onFocus(): void {
    super.onFocus();
    if (this._view === "local") {
      focusManager.setFocus(this._browseBtn);
    } else if (this._view === "search") {
      focusManager.setFocus(this._hfSearchInput);
      focusManager.activateTextInput(true);
    } else if (this._view === "results") {
      focusManager.setFocus(this._hfResultsList);
    } else if (this._view === "files") {
      focusManager.setFocus(this._hfFilesList);
    }
  }

  // --- Key handling ---
  handleKey(key: string): boolean {
    if (this._view !== "local" && key === "ESC") {
      this.goBack();
      return true;
    }
    return super.handleKey(key);
  }

  // --- View transitions ---
 enterBrowseMode(): void {
      this._view = "search";
      this._searchPage = 0;
      this._hfSearchInput.value = "";
      this._ggufPanel.setInfo(null);
      this._lastInspectedPath = "";
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

    // Content visibility
    this._hfResultsSection.visible = isResults;
    this._hfResultsList.visible = this._allRepos.length > 0;
    this._hfResultsEmpty.visible = this._allRepos.length === 0;
    this._hfFilesSection.visible = isFiles;
    this._hfFilesList.visible = this._files.length > 0;
    this._hfFilesEmpty.visible = this._files.length === 0;

    // Button visibility
    this._hfBackBtn.visible = true;
    this._hfSearchBtn.visible = isSearch;
    this._hfBrowseBtn.visible = isSearch;
    this._hfPrevBtn.visible = isResults && this._searchPage > 0;
    this._hfNextBtn.visible = isResults && (this._searchPage + 1) * this._PAGE_SIZE < this._allRepos.length;
    this._hfButtonRow.visible = true;

    // Header
    if (isSearch) {
      this._summary.builder.muted("HuggingFace Browser");
    } else if (isResults) {
      this._summary.builder.muted(`Search Results  Page ${this._searchPage + 1}  (${this._allRepos.length} repos)`);
    } else if (isFiles) {
      this._summary.builder.muted(this._selectedRepo ? this._selectedRepo.id : "Files");
    }

    // Focus
    if (isSearch) {
      focusManager.setFocus(this._hfSearchInput);
      focusManager.activateTextInput(true);
    } else if (isResults && this._allRepos.length > 0) {
      focusManager.activateTextInput(false);
      focusManager.setFocus(this._hfResultsList);
    } else if (isFiles && this._files.length > 0) {
      focusManager.activateTextInput(false);
      focusManager.setFocus(this._hfFilesList);
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
      const token = config?.hfToken ?? undefined;
      this._allRepos = await browseModels({
        search: this._searchQuery,
        sort: "likes",
        limit: 100,
      }, token);
      this._searchPage = 0;
      this.showPage();
    }, this._ctx!);
  }

  browseTrending(): void {
    fireAsync(async () => {
      const config = this._ctx?.getConfig();
      const token = config?.hfToken ?? undefined;
      this._allRepos = await browseModels({
        sort: "likes",
        limit: 100,
      }, token);
      this._searchPage = 0;
      this.showPage();
    }, this._ctx!);
  }

  showPage(): void {
    const start = this._searchPage * this._PAGE_SIZE;
    const end = start + this._PAGE_SIZE;
    this._repos = this._allRepos.slice(start, end);
    this.showResults();
  }

  showResults(): void {
    const items: TableItem<HFRepoInfo>[] = this._repos.map((repo, i) => ({
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
      const token = config?.hfToken ?? undefined;
      this._files = await listFiles(repo.id, token);
      const items: TableItem<HFFileInfo>[] = this._files.map((file, i) => ({
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
    if (!config || !this._selectedRepo || !this._ctx) return;

    this._downloadAbortController = new AbortController();
    const dialog = createDownloadDialog(file.path, "Preparing...");
    const handle = dialog.getHandle();

    const token = config.hfToken ?? undefined;

    fireAsync(async () => {
      try {
        await downloadModel(
          config,
          this._selectedRepo!.id,
          file.path,
          file.size,
          (pct, label) => {
            handle.update(pct, label);
          },
          token,
          this._downloadAbortController?.signal,
        );

        this._downloadAbortController = null;
        handle.update(100, "Download complete!");
        setTimeout(() => handle.close(), 500);
        await handle.promise;
        this._ctx?.showMessage(`Downloaded ${file.path}`);
        this._view = "local";
        this.updateView();
        this.refreshModels();
      } catch (err: any) {
        this._downloadAbortController = null;
        if (err.message === "Download cancelled") {
          return;
        }
        handle.close();
        throw err;
      }
    }, this._ctx);

    this._ctx.openModal(dialog);
  }

  cancelDownload(): void {
    if (this._downloadAbortController) {
      this._downloadAbortController.abort();
      this._downloadAbortController = null;
    }
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

      const items: TableItem<LocalModel>[] = models.map(m => ({
        id: m.path,
        label: `${m.repoId}/${m.filename}`,
        data: m,
      }));

      this._modelList.updateItems(items);
      this._summary.builder
        .muted("Models ")
        .accentColor(String(models.length))
        .muted("  Size ")
        .text(formatSize(totalSize));
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

   deleteSelected(): void {
    const selected = this._modelList.getSelectedItem();
    if (!selected) return;

    const config = this._ctx?.getConfig();
    if (!config) return;

    fireAsync(async () => {
      const model = selected.data!;
      const confirmed = await this._ctx!.openModal<boolean>(createConfirmDialog(
        "Delete Model",
        `Delete ${model.filename}? This will remove the file from disk.`
      ));
      if (!confirmed) return;
      const updated = await deleteModel(config, model.path);
      await saveConfig(updated);
      this._ctx?.setConfig(updated);
      this._ctx?.showMessage(`Deleted ${model.filename}`);
      this.refreshModels();
    }, this._ctx!);
  }

}

export function createModelsTab(ctx: TabContext): Control {
  return new ModelsControl(ctx);
}
