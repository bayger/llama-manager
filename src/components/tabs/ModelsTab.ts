import { Control } from "../ui/Control";
import type { FramebufferCanvas } from "../../lib/framebuffer-canvas";
import { Column, Row } from "../ui/Layout";
import { Button } from "../ui/widgets/Button";
import { Spacer } from "../ui/widgets/Spacer";
import { List, ListItem } from "../ui/widgets/List";
import { TextInput } from "../ui/widgets/TextInput";
import { ProgressBar } from "../ui/widgets/ProgressBar";
import { Section } from "../ui/widgets/Section";
import { fg, fgBg } from "../../lib/theme";
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
import { fireAsync } from "../../lib/utils";
import type { TabContext } from "../../lib/tabcontext";
import type { Size } from "../ui/types";

type ViewMode = "local" | "search" | "results" | "files" | "downloading";

export class ModelsControl extends Control {
  focusable = true;
  protected _ctx: TabContext | null = null;

  protected _view: ViewMode = "local";

  // Local models
  protected _column: Column;
  protected _buttonRow: Row;
  protected _browseBtn: Button;
  protected _removeBtn: Button;
  protected _modelsSection: Section;
  protected _modelList: List<string, LocalModel>;
  protected _summary: StyledText;

  // HF Browser
  protected _hfColumn: Column;
  protected _hfSearchRow: Row;
  protected _hfSearchInput: TextInput;
  protected _hfSearchBtn: Button;
  protected _hfBrowseBtn: Button;
  protected _hfContentColumn: Column;
  protected _hfResultsSection: Section;
  protected _hfResultsList: List<string, HFRepoInfo>;
  protected _hfFilesSection: Section;
  protected _hfFilesList: List<string, HFFileInfo>;
  protected _hfProgressBar: ProgressBar;
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
  protected _downloadCancelled = false;

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;

    this._summary = new StyledText();

    // --- Local models view ---
    this._browseBtn = new Button({ label: "Browse HF" });
    this._removeBtn = new Button({ label: "Remove" });
    this._buttonRow = new Row();
    this._buttonRow.add(this._browseBtn);
    this._buttonRow.add(this._removeBtn);

    this._modelList = new List<string, LocalModel>();

    this._modelsSection = new Section();
    this._modelsSection.title = "Downloaded Models";
    this._modelsSection.add(this._modelList);
    this._modelList.flex = 1;

    this._modelList.setOnSelect((item) => {
      this.selectModel(item.data!);
    });
    this._modelList.setRenderer((canvas, item, _index, isSelected, _x, rowY, width) => {
      const model = item.data!;
      const prefix = model.active ? "✓ " : "  ";
      const name = `${model.repoId}/${model.filename}`;
      const size = formatSize(model.sizeBytes);
      const line = (`${prefix}${name}  ${size}`).padEnd(width);

      if (isSelected) {
        fgBg(canvas, "selectedText", "selectedBg", line.substring(0, width));
      } else if (model.active) {
        fgBg(canvas, "success", "canvasSubtle", line.substring(0, width));
      } else {
        fgBg(canvas, "text", "canvasSubtle", line.substring(0, width));
      }
    });

    this._column = new Column();
    this._column.add(this._buttonRow);
    //this._column.add(new Spacer());
    this._column.add(this._modelsSection);
    this._modelsSection.flex = 1;

    // --- HF Browser view ---

    this._hfSearchInput = new TextInput();
    this._hfSearchInput.placeholder = "Search models...";
    this._hfSearchInput.prefix = "> ";

    this._hfSearchRow = new Row();
    this._hfSearchRow.add(this._hfSearchInput);

    this._hfResultsList = new List<string, HFRepoInfo>();

    this._hfResultsSection = new Section();
    this._hfResultsSection.title = "Results";
    this._hfResultsSection.add(this._hfResultsList);

    this._hfResultsList.setOnSelect((item) => {
      this.openRepoFiles(item.data!);
    });
    this._hfResultsList.setRenderer((canvas, item, _index, isSelected, _x, rowY, width) => {
      const repo = item.data!;
      const likes = repo.likes > 0 ? `\u2665 ${repo.likes}` : "";
      const downloads = repo.downloads ? `\u2193 ${repo.downloads}` : "";
      const meta = [likes, downloads].filter(Boolean).join("  ");
      const line = (`${repo.id}${meta ? `  ${meta}` : ""}`).padEnd(width);

      if (isSelected) {
        fgBg(canvas, "selectedText", "selectedBg", line.substring(0, width));
      } else {
        fgBg(canvas, "text", "canvasSubtle", line.substring(0, width));
      }
    });

    this._hfFilesList = new List<string, HFFileInfo>();

    this._hfFilesSection = new Section();
    this._hfFilesSection.title = "Files";
    this._hfFilesSection.visible = false;
    this._hfFilesSection.add(this._hfFilesList);

    this._hfFilesList.setOnSelect((item) => {
      this.downloadSelectedFile(item.data!);
    });
    this._hfFilesList.setRenderer((canvas, item, _index, isSelected, _x, rowY, width) => {
      const file = item.data!;
      const size = formatSize(file.size);
      const line = (`${file.path}  ${size}`).padEnd(width);

      if (isSelected) {
        fgBg(canvas, "selectedText", "selectedBg", line.substring(0, width));
      } else {
        fgBg(canvas, "text", "canvasSubtle", line.substring(0, width));
      }
    });

    this._hfProgressBar = new ProgressBar();
    this._hfProgressBar.visible = false;
    this._hfProgressBar.filledColor = "success";

    this._hfContentColumn = new Column();
    this._hfContentColumn.flex = 1;
    this._hfContentColumn.add(this._hfResultsSection);
    this._hfResultsSection.flex = 1;
    this._hfContentColumn.add(this._hfFilesSection);
    this._hfFilesSection.flex = 1;
    this._hfContentColumn.add(this._hfProgressBar);

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
    this._hfButtonRow.add(this._hfSearchBtn);
    this._hfButtonRow.add(this._hfBrowseBtn);
    this._hfButtonRow.add(this._hfPrevBtn);
    this._hfButtonRow.add(this._hfNextBtn);
    this._hfButtonRow.add(this._hfCancelBtn);

    this._hfColumn = new Column();
    this._hfColumn.add(this._hfSearchRow);
    this._hfColumn.add(new Spacer());
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
      this.removeSelected();
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
     return List.prototype.handleKey.call(this._hfResultsList, key);
   };

   this._hfFilesList.handleKey = (key: string) => {
     if (key === "g" && !focusManager.isTextInputActive()) {
       this.goBack();
       return true;
     }
     return List.prototype.handleKey.call(this._hfFilesList, key);
   };

   this.refreshModels();
  }

  onDestroy(): void {
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
     this._searchPage = 0;
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
    this._hfSearchRow.visible = true;

    // Content visibility
    this._hfResultsSection.visible = isResults;
    this._hfFilesSection.visible = isFiles;
    this._hfProgressBar.visible = isDownloading;

    // Button visibility
    this._hfBackBtn.visible = true;
    this._hfSearchBtn.visible = isSearch;
    this._hfBrowseBtn.visible = isSearch;
    this._hfPrevBtn.visible = isResults && this._searchPage > 0;
    this._hfNextBtn.visible = isResults && (this._searchPage + 1) * this._PAGE_SIZE < this._allRepos.length;
    this._hfCancelBtn.visible = isDownloading;
    this._hfButtonRow.visible = true;

    // Header
    if (isSearch) {
      this._summary.builder.muted("HuggingFace Browser");
    } else if (isResults) {
      this._summary.builder.muted(`Search Results  Page ${this._searchPage + 1}  (${this._allRepos.length} repos)`);
    } else if (isFiles) {
      this._summary.builder.muted(this._selectedRepo ? this._selectedRepo.id : "Files");
    } else if (isDownloading) {
      this._summary.builder.muted("Downloading...");
    }

    // Focus
    if (isSearch) {
      focusManager.setFocus(this._hfSearchInput);
      focusManager.activateTextInput(true);
    } else if (isResults) {
      focusManager.activateTextInput(false);
      focusManager.setFocus(this._hfResultsList);
    } else if (isFiles) {
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
    const items: ListItem<string, HFRepoInfo>[] = this._repos.map((repo, i) => ({
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
      const items: ListItem<string, HFFileInfo>[] = this._files.map((file, i) => ({
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

    const token = config.hfToken ?? undefined;

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

      const items: ListItem<string, LocalModel>[] = models.map(m => ({
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

  removeSelected(): void {
    const selected = this._modelList.getSelectedItem();
    if (!selected) return;

    const config = this._ctx?.getConfig();
    if (!config) return;

    (async () => {
      const model = selected.data!;
      const updated = await deleteModel(config, model.path);
      await saveConfig(updated);
      this._ctx?.setConfig(updated);
      this._ctx?.showMessage(`Removed ${model.filename}`);
      this.refreshModels();
    })();
  }

}

export function createModelsTab(ctx: TabContext): Control {
  return new ModelsControl(ctx);
}
