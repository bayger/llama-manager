import type { Terminal } from "terminal-kit";
import { themeColors, fg, termWidth, termHeight, renderBox, renderLine, renderDivider } from "../../lib/theme.js";
import { renderProgressBar as renderSharedProgressBar } from "../shared/ProgressBar.js";
import { renderHelpBar } from "../shared/HelpBar.js";
import { renderButtonBar } from "../shared/Button.js";
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
import { TabContext } from "../../lib/tabcontext.js";

const ACTIONS = ["setactive", "delete", "search", "browse"];

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

interface ModelsState {
  config: ConfigData | null;
  models: LocalModel[];
  selectedIndex: number;
  focusArea:
    | "list"
    | "actions"
    | "search"
    | "files"
    | "browse"
    | "browsefilters"
    | "browsesort"
    | "modelcard";
  actionIndex: number;
  loading: boolean;
  message: string | null;
  totalSize: number;
  searching: boolean;
  searchQuery: string;
  searchResults: HFRepoInfo[];
  searchIndex: number;
  downloading: boolean;
  dlProgress: number;
  dlLabel: string;
  repoFiles: HFFileInfo[];
  repoId: string;
  fileIndex: number;
  fetchingFiles: boolean;
  editMode: boolean;
  editValue: string;
  browseResults: HFRepoInfo[];
  browseIndex: number;
  browseSort: number;
  browseDirection: number;
  browseFilters: boolean[];
  filterIndex: number;
  sortIndex: number;
  modelCard: HFModelInfo | null;
  fetchingCard: boolean;
  browseSearchQuery: string;
  browseEditMode: boolean;
  browseEditValue: string;
  initPromise: Promise<void> | null;
}

const ACTION_LABELS = ["Set Active", "Delete", "Search", "Browse"];

function clampIndex(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(value, max - 1));
}

function renderHeader(s: ModelsState, term: Terminal, width: number, startY: number): number {
  const titleLine = ` Models │ ${s.models.length} local │ ${formatSize(s.totalSize)} used`;
  const dirLine = ` Dir: ${s.config ? getModelsDir(s.config) : "N/A"}`;

  let y = startY;
  renderLine(term, y++, () => {
    fg(term, themeColors.text, titleLine);
    term(" ".repeat(Math.max(0, width - titleLine.length)));
  });
  renderLine(term, y++, () => {
    fg(term, themeColors.textMuted, dirLine);
    term(" ".repeat(Math.max(0, width - dirLine.length)));
  });
  renderDivider(term, y++, themeColors.border);
  return y;
}

function renderModelList(s: ModelsState, term: Terminal, width: number, startY: number): number {
  let y = startY;

  if (s.models.length === 0) {
    renderLine(term, y++, () => {
      fg(term, themeColors.textMuted, "  No models found.");
    });
    renderLine(term, y++, () => {});
    return y;
  }

  for (let i = 0; i < s.models.length; i++) {
    const m = s.models[i];
    const label = `${m.repoId}/${m.filename}`;
    const sizeLabel = ` (${formatSize(m.sizeBytes)})`;
    const activeLabel = m.active ? " (active)" : "";

    if (i === s.selectedIndex) {
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

function renderSearchResults(s: ModelsState, term: Terminal, width: number, startY: number): number {
  let y = startY;

  if (s.searchResults.length === 0) {
    renderLine(term, y++, () => {
      fg(term, themeColors.textMuted, "  No results.");
    });
    renderLine(term, y++, () => {});
    return y;
  }

  for (let i = 0; i < s.searchResults.length; i++) {
    const r = s.searchResults[i];
    const label = `${r.id} (${r.likes} likes)`;
    if (i === s.searchIndex) {
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

function renderRepoFiles(s: ModelsState, term: Terminal, width: number, startY: number): number {
  let y = startY;

  renderLine(term, y++, () => {
    fg(term, themeColors.textMuted, `  Repo: ${s.repoId}`);
  });
  renderLine(term, y++, () => {});

  if (s.repoFiles.length === 0) {
    renderLine(term, y++, () => {
      fg(term, themeColors.textMuted, "  No GGUF files.");
    });
    renderLine(term, y++, () => {});
    return y;
  }

  for (let i = 0; i < s.repoFiles.length; i++) {
    const f = s.repoFiles[i];
    const label = `${f.rfpath} (${formatSize(f.size)})`;
    if (i === s.fileIndex) {
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

function renderBrowseResults(s: ModelsState, term: Terminal, width: number, startY: number): number {
  let y = startY;

  if (s.browseResults.length === 0) {
    renderLine(term, y++, () => {
      fg(term, themeColors.textMuted, "  No results.");
    });
    renderLine(term, y++, () => {});
    return y;
  }

  for (let i = 0; i < s.browseResults.length; i++) {
    const r = s.browseResults[i];
    const label = `${r.id} │ ${r.likes} ♥ │ ${r.downloads ?? 0} ↓`;
    if (i === s.browseIndex) {
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

function renderBrowseFilters(s: ModelsState, term: Terminal, width: number, startY: number): number {
  const innerW = width - 2;
  const parts: string[] = [];
  for (let i = 0; i < ALL_FILTERS.length; i++) {
    const f = ALL_FILTERS[i];
    const active = s.browseFilters[i] ? f.label : f.label;
    const prefix = s.browseFilters[i] ? "●" : "○";
    if (i === s.filterIndex) {
      parts.push(` ${prefix} ${active} `);
    } else {
      parts.push(`${prefix} ${active}`);
    }
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
          const prefix = s.browseFilters[i] ? "●" : "○";
          if (i === s.filterIndex) {
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

function renderBrowseSort(s: ModelsState, term: Terminal, width: number, startY: number): number {
  const innerW = width - 2;
  const parts: string[] = [];
  for (let i = 0; i < SORT_OPTIONS.length; i++) {
    const opt = SORT_OPTIONS[i];
    const arrow = s.browseDirection === -1 && i === s.sortIndex ? " ▼" : "";
    if (i === s.sortIndex) {
      parts.push(` ${opt.label}${arrow} `);
    } else {
      parts.push(opt.label);
    }
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
          const arrow = s.browseDirection === -1 && i === s.sortIndex ? " ▼" : "";
          if (i === s.sortIndex) {
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

function renderModelCard(s: ModelsState, term: Terminal, width: number, startY: number): number {
  const innerW = width - 2;
  let y = startY;

  if (!s.modelCard) {
    renderLine(term, y++, () => {
      fg(term, themeColors.textMuted, "  No model info.");
    });
    renderLine(term, y++, () => {});
    return y;
  }
  const c = s.modelCard;
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

function renderDownloadProgress(s: ModelsState, term: Terminal, width: number, startY: number): number {
  if (!s.downloading) return startY;
  return renderSharedProgressBar({
    term,
    startY,
    progress: s.dlProgress,
    label: "Downloading...",
    extraLabel: s.dlLabel,
    barWidth: Math.min(40, width - 10),
  });
}

function renderHelp(s: ModelsState, term: Terminal, startY: number): number {
  const helpTexts: Record<string, string> = {
    list: "j/k navigate │ g actions │ Enter select",
    actions: "h/l navigate │ Enter execute │ j/k list",
    search: "j/k navigate │ Enter open │ g back │ e new search",
    files: "j/k navigate │ Enter download │ g back",
    browse: "j/k navigate │ f filters │ s sort │ m card │ Enter open │ g back │ e search",
    browsefilters: "h/l navigate │ Enter toggle │ g back",
    browsesort: "h/l navigate │ Enter apply │ R reverse │ g back",
    modelcard: "m/g close │ Enter open repo",
  };
  return renderHelpBar({ term, y: startY, text: helpTexts[s.focusArea] || "" });
}

function renderMessage(s: ModelsState, term: Terminal, startY: number): number {
  if (s.message) {
    renderLine(term, startY, () => {
      fg(term, themeColors.warning, `  ${s.message}`);
    });
    return startY + 1;
  }
  return startY;
}

export function createModelsTab(ctx: TabContext) {
  const state: ModelsState = {
    config: null,
    models: [],
    selectedIndex: 0,
    focusArea: "list",
    actionIndex: 0,
    loading: false,
    message: null,
    totalSize: 0,
    searching: false,
    searchQuery: "",
    searchResults: [],
    searchIndex: 0,
    downloading: false,
    dlProgress: 0,
    dlLabel: "",
    repoFiles: [],
    repoId: "",
    fileIndex: 0,
    fetchingFiles: false,
    editMode: false,
    editValue: "",
    browseResults: [],
    browseIndex: 0,
    browseSort: 0,
    browseDirection: -1,
    browseFilters: new Array(ALL_FILTERS.length).fill(false),
    filterIndex: 0,
    sortIndex: 0,
    modelCard: null,
    fetchingCard: false,
    browseSearchQuery: "",
    browseEditMode: false,
    browseEditValue: "",
    initPromise: null,
  };

  let downloadTimer: ReturnType<typeof setInterval> | null = null;

  const scheduleRender = ctx.scheduleRender.bind(ctx);
  const showMessage = ctx.showMessage.bind(ctx);
  const setTextInputFocused = ctx.setTextInputFocused.bind(ctx);

  async function refreshModels(): Promise<void> {
    if (!state.config) return;
    state.loading = true;
    try {
      state.models = await listLocalModels(state.config);
      state.totalSize = await getTotalModelsSize(state.config);
      if (state.selectedIndex >= state.models.length) {
        state.selectedIndex = Math.max(0, state.models.length - 1);
      }
    } catch {
      state.message = "Failed to load models";
    }
    state.loading = false;
  }

  async function executeAction(actionIndex: number): Promise<void> {
    const action = ACTIONS[actionIndex];
    if (!state.config) return;

    switch (action) {
      case "setactive": {
        if (state.models.length === 0 || state.selectedIndex >= state.models.length) {
          state.message = "No model selected";
          return;
        }
        const m = state.models[state.selectedIndex];
        try {
          const updated = await setActiveModel(state.config, m.repoId, m.filename);
          await saveConfig(updated);
          state.config = updated;
          await refreshModels();
          state.message = `Set active: ${m.repoId}/${m.filename}`;
          showMessage(state.message!);
        } catch (err: any) {
          state.message = `Error: ${err.message}`;
        }
        break;
      }

      case "delete": {
        if (state.models.length === 0 || state.selectedIndex >= state.models.length) {
          state.message = "No model selected";
          return;
        }
        const m = state.models[state.selectedIndex];
        try {
          const updated = await deleteModel(state.config, m.path);
          await saveConfig(updated);
          state.config = updated;
          await refreshModels();
          state.message = `Deleted: ${m.filename}`;
          showMessage(state.message!);
        } catch (err: any) {
          state.message = `Error: ${err.message}`;
        }
        break;
      }

      case "search": {
        state.focusArea = "search";
        state.editMode = true;
        state.editValue = "";
        state.searchResults = [];
        state.searchIndex = 0;
        setTextInputFocused(true);
        scheduleRender();
        break;
      }

      case "browse": {
        state.focusArea = "browse";
        state.browseResults = [];
        state.browseIndex = 0;
        await fetchBrowse();
        break;
      }
    }
  }

  async function fetchBrowse(): Promise<void> {
    if (!state.config) return;
    state.loading = true;
    state.message = null;
    try {
      const activeFilters: string[] = [];
      for (let i = 0; i < ALL_FILTERS.length; i++) {
        if (state.browseFilters[i] && ALL_FILTERS[i].filter) {
          activeFilters.push(ALL_FILTERS[i].filter);
        }
      }

      const sortValue = SORT_OPTIONS[state.sortIndex]?.value || "likes";
      const direction = state.browseDirection as 1 | -1;

      const results = await browseModels(
        {
          sort: sortValue as any,
          direction,
          filters: activeFilters,
          search: state.browseSearchQuery || undefined,
        },
        state.config.hfToken || undefined,
      );
      state.browseResults = results;
      state.browseIndex = 0;
    } catch (err: any) {
      state.message = `Browse error: ${err.message}`;
    }
    state.loading = false;
    scheduleRender();
  }

  async function submitSearch(): Promise<void> {
    if (!state.config || !state.editValue.trim()) {
      state.editMode = false;
      setTextInputFocused(false);
      scheduleRender();
      return;
    }
    state.searchQuery = state.editValue.trim();
    state.editMode = false;
    state.searching = true;
    state.message = null;
    setTextInputFocused(false);
    try {
      const results = await searchRepos(
        state.searchQuery,
        state.config.hfToken || undefined,
      );
      state.searchResults = results;
      state.searchIndex = 0;
    } catch (err: any) {
      state.message = `Search error: ${err.message}`;
    }
    state.searching = false;
    scheduleRender();
  }

  async function downloadSelectedFile(): Promise<void> {
    if (!state.config || state.fileIndex >= state.repoFiles.length) return;
    const file = state.repoFiles[state.fileIndex];
    state.downloading = true;
    state.dlProgress = 0;
    state.dlLabel = "";
    state.message = null;
    try {
      await downloadModel(
        state.config,
        state.repoId,
        file.rfpath,
        file.size,
        (pct, label) => {
          state.dlProgress = pct;
          state.dlLabel = label;
          scheduleRender();
        },
        state.config.hfToken || undefined,
      );
      state.message = `Downloaded: ${file.rfpath}`;
      showMessage(state.message!);
      await refreshModels();
    } catch (err: any) {
      state.message = `Download error: ${err.message}`;
    }
    state.downloading = false;
    scheduleRender();
  }

  async function openRepoFiles(repoId: string): Promise<void> {
    if (!state.config) return;
    state.focusArea = "files";
    state.repoId = repoId;
    state.repoFiles = [];
    state.fileIndex = 0;
    state.fetchingFiles = true;
    state.message = null;
    try {
      const files = await listFiles(repoId, state.config.hfToken || undefined);
      state.repoFiles = files;
      state.fileIndex = 0;
    } catch (err: any) {
      state.message = `Files error: ${err.message}`;
    }
    state.fetchingFiles = false;
    scheduleRender();
  }

  async function fetchModelCard(repoId: string): Promise<void> {
    if (!state.config) return;
    state.focusArea = "modelcard";
    state.fetchingCard = true;
    state.message = null;
    try {
      const info = await getModelInfo(repoId, state.config.hfToken || undefined);
      state.modelCard = info;
    } catch (err: any) {
      state.message = `Card error: ${err.message}`;
    }
    state.fetchingCard = false;
    scheduleRender();
  }

  function render(): void {
    const term = ctx.term;

    if (!state.config && !state.initPromise) {
      state.loading = true;
      state.initPromise = (async () => {
        state.config = await loadConfig();
        if (state.config) {
          await refreshModels();
        }
        state.loading = false;
        scheduleRender();
      })();
    }

    const width = termWidth(term);

    if (state.loading && state.models.length === 0) {
      let y = 3;
      renderLine(term, y++, () => {
        fg(term, themeColors.textMuted, "  Loading models...");
      });
      return;
    }

    if (state.downloading) {
      let y = 3;
      y = renderHeader(state, term, width, y);
      y = renderModelList(state, term, width, y);
      y = renderDownloadProgress(state, term, width, y);
      return;
    }

    let y = 3;

    switch (state.focusArea) {
      case "list": {
        y = renderHeader(state, term, width, y);
        y = renderModelList(state, term, width, y);
        y = renderHelp(state, term, y);
        break;
      }

      case "actions": {
        y = renderHeader(state, term, width, y);
        y = renderModelList(state, term, width, y);
        y = renderButtonBar({
          term,
          startY: y,
          items: ACTION_LABELS.map(label => ({ label })),
          selectedIndex: state.actionIndex,
          label: "Actions:",
        });
        renderLine(term, y++, () => {});
        y = renderHelp(state, term, y);
        break;
      }

      case "search": {
        if (state.editMode) {
          y = renderHeader(state, term, width, y);
          renderLine(term, y++, () => {
            term.bold();
            fg(term, themeColors.accent, `  Search: ${state.editValue}`);
            term.styleReset();
          });
          y = renderHelp(state, term, y);
        } else {
          y = renderHeader(state, term, width, y);
          renderLine(term, y++, () => {
            fg(term, themeColors.textMuted, `  Query: ${state.searchQuery}`);
          });
          renderLine(term, y++, () => {});
          y = renderSearchResults(state, term, width, y);
          y = renderHelp(state, term, y);
        }
        break;
      }

      case "files": {
        y = renderHeader(state, term, width, y);
        y = renderRepoFiles(state, term, width, y);
        y = renderHelp(state, term, y);
        break;
      }

      case "browse": {
        if (state.browseEditMode) {
          y = renderHeader(state, term, width, y);
          renderLine(term, y++, () => {
            term.bold();
            fg(term, themeColors.accent, `  Browse search: ${state.browseEditValue}`);
            term.styleReset();
          });
          y = renderHelp(state, term, y);
        } else {
          y = renderHeader(state, term, width, y);
          renderLine(term, y++, () => {
            fg(term, themeColors.textMuted, `  Browse (${SORT_OPTIONS[state.browseSort]?.label})`);
          });
          renderLine(term, y++, () => {});
          y = renderBrowseResults(state, term, width, y);
          y = renderHelp(state, term, y);
        }
        break;
      }

      case "browsefilters": {
        y = renderHeader(state, term, width, y);
        y = renderBrowseResults(state, term, width, y);
        y = renderBrowseFilters(state, term, width, y);
        y = renderHelp(state, term, y);
        break;
      }

      case "browsesort": {
        y = renderHeader(state, term, width, y);
        y = renderBrowseResults(state, term, width, y);
        y = renderBrowseSort(state, term, width, y);
        y = renderHelp(state, term, y);
        break;
      }

      case "modelcard": {
        y = renderHeader(state, term, width, y);
        y = renderModelCard(state, term, width, y);
        y = renderHelp(state, term, y);
        break;
      }
    }

    renderMessage(state, term, y);
  }

  function handleKey(key: string): boolean {
    if (state.downloading) {
      return true;
    }

    if (state.searching || state.loading || state.fetchingFiles || state.fetchingCard) {
      return true;
    }

    if (state.editMode) {
      if (key === "\r" || key === "Return") {
        submitSearch();
        return true;
      }
      if (key === "\u0003" || key === "Escape" || key === "Ctrl+C") {
        state.editMode = false;
        state.editValue = "";
        setTextInputFocused(false);
        scheduleRender();
        return true;
      }
      if (key === "\u007f" || key === "Backspace") {
        state.editValue = state.editValue.slice(0, -1);
        return true;
      }
      if (key.length === 1) {
        state.editValue += key;
        return true;
      }
      return true;
    }

    if (state.browseEditMode) {
      if (key === "\r" || key === "Return") {
        state.browseSearchQuery = state.browseEditValue.trim();
        state.browseEditMode = false;
        state.browseEditValue = "";
        setTextInputFocused(false);
        scheduleRender();
        fetchBrowse();
        return true;
      }
      if (key === "\u0003" || key === "Escape" || key === "Ctrl+C") {
        state.browseEditMode = false;
        state.browseEditValue = "";
        setTextInputFocused(false);
        scheduleRender();
        return true;
      }
      if (key === "\u007f" || key === "Backspace") {
        state.browseEditValue = state.browseEditValue.slice(0, -1);
        return true;
      }
      if (key.length === 1) {
        state.browseEditValue += key;
        return true;
      }
      return true;
    }

    switch (state.focusArea) {
      case "list": {
        switch (key) {
          case "k":
          case "up":
            state.selectedIndex = clampIndex(state.selectedIndex - 1, state.models.length);
            return true;
          case "j":
          case "down":
            state.selectedIndex = clampIndex(state.selectedIndex + 1, state.models.length);
            return true;
          case "g":
            state.focusArea = "actions";
            state.actionIndex = 0;
            return true;
          case "\r":
          case "Return":
            state.focusArea = "actions";
            state.actionIndex = 0;
            return true;
        }
        break;
      }

      case "actions": {
        switch (key) {
          case "h":
          case "left":
            state.actionIndex = clampIndex(state.actionIndex - 1, ACTIONS.length);
            return true;
          case "l":
          case "right":
            state.actionIndex = clampIndex(state.actionIndex + 1, ACTIONS.length);
            return true;
          case "j":
          case "k":
          case "up":
          case "down":
            state.focusArea = "list";
            return true;
          case "\r":
          case "Return":
            executeAction(state.actionIndex);
            return true;
          case "g":
            state.focusArea = "list";
            return true;
          case "Escape":
            state.focusArea = "list";
            return true;
        }
        break;
      }

      case "search": {
        switch (key) {
          case "k":
          case "up":
            state.searchIndex = clampIndex(state.searchIndex - 1, state.searchResults.length);
            return true;
          case "j":
          case "down":
            state.searchIndex = clampIndex(state.searchIndex + 1, state.searchResults.length);
            return true;
          case "g":
            state.focusArea = "list";
            return true;
          case "Escape":
            state.focusArea = "list";
            return true;
          case "e":
            state.editMode = true;
            state.editValue = state.searchQuery;
            setTextInputFocused(true);
            scheduleRender();
            return true;
          case "\r":
          case "Return":
            if (state.searchResults.length > 0 && state.searchIndex < state.searchResults.length) {
              openRepoFiles(state.searchResults[state.searchIndex].id);
            }
            return true;
        }
        break;
      }

      case "files": {
        switch (key) {
          case "k":
          case "up":
            state.fileIndex = clampIndex(state.fileIndex - 1, state.repoFiles.length);
            return true;
          case "j":
          case "down":
            state.fileIndex = clampIndex(state.fileIndex + 1, state.repoFiles.length);
            return true;
          case "g":
            state.focusArea = "search";
            return true;
          case "Escape":
            state.focusArea = "search";
            return true;
          case "\r":
          case "Return":
            if (state.repoFiles.length > 0 && state.fileIndex < state.repoFiles.length) {
              downloadSelectedFile();
            }
            return true;
        }
        break;
      }

      case "browse": {
        switch (key) {
          case "k":
          case "up":
            state.browseIndex = clampIndex(state.browseIndex - 1, state.browseResults.length);
            return true;
          case "j":
          case "down":
            state.browseIndex = clampIndex(state.browseIndex + 1, state.browseResults.length);
            return true;
          case "g":
            state.focusArea = "list";
            return true;
          case "Escape":
            state.focusArea = "list";
            return true;
          case "f":
            state.focusArea = "browsefilters";
            state.filterIndex = 0;
            return true;
          case "s":
            state.focusArea = "browsesort";
            state.sortIndex = state.browseSort;
            return true;
          case "m":
            if (state.browseResults.length > 0 && state.browseIndex < state.browseResults.length) {
              fetchModelCard(state.browseResults[state.browseIndex].id);
            }
            return true;
          case "e":
            state.browseEditMode = true;
            state.browseEditValue = state.browseSearchQuery;
            setTextInputFocused(true);
            scheduleRender();
            return true;
          case "\r":
          case "Return":
            if (state.browseResults.length > 0 && state.browseIndex < state.browseResults.length) {
              openRepoFiles(state.browseResults[state.browseIndex].id);
            }
            return true;
        }
        break;
      }

      case "browsefilters": {
        switch (key) {
          case "h":
          case "left":
            state.filterIndex = clampIndex(state.filterIndex - 1, ALL_FILTERS.length);
            return true;
          case "l":
          case "right":
            state.filterIndex = clampIndex(state.filterIndex + 1, ALL_FILTERS.length);
            return true;
          case "\r":
          case "Return": {
            const filterGroup = ALL_FILTERS[state.filterIndex];
            if (TASK_FILTERS.includes(filterGroup)) {
              for (let i = 0; i < TASK_FILTERS.length; i++) {
                state.browseFilters[i] = false;
              }
              const taskIdx = TASK_FILTERS.indexOf(filterGroup);
              if (taskIdx >= 0) {
                state.browseFilters[taskIdx] = true;
              }
            } else {
              state.browseFilters[state.filterIndex] = !state.browseFilters[state.filterIndex];
            }
            fetchBrowse();
            return true;
          }
          case "g":
            state.focusArea = "browse";
            return true;
          case "Escape":
            state.focusArea = "browse";
            return true;
          case "s":
            state.focusArea = "browsesort";
            state.sortIndex = state.browseSort;
            return true;
        }
        break;
      }

      case "browsesort": {
        switch (key) {
          case "h":
          case "left":
            state.sortIndex = clampIndex(state.sortIndex - 1, SORT_OPTIONS.length);
            return true;
          case "l":
          case "right":
            state.sortIndex = clampIndex(state.sortIndex + 1, SORT_OPTIONS.length);
            return true;
          case "R":
            state.browseDirection = state.browseDirection === -1 ? 1 : -1;
            fetchBrowse();
            return true;
          case "\r":
          case "Return":
            state.browseSort = state.sortIndex;
            fetchBrowse();
            state.focusArea = "browse";
            return true;
          case "g":
            state.focusArea = "browse";
            return true;
          case "Escape":
            state.focusArea = "browse";
            return true;
        }
        break;
      }

      case "modelcard": {
        switch (key) {
          case "g":
          case "m":
            state.focusArea = "browse";
            return true;
          case "Escape":
            state.focusArea = "browse";
            return true;
          case "\r":
          case "Return":
            if (state.modelCard) {
              openRepoFiles(state.modelCard.id);
            }
            return true;
        }
        break;
      }
    }

    return false;
  }

  function dispose(): void {
    if (downloadTimer) {
      clearInterval(downloadTimer);
      downloadTimer = null;
    }
  }

  return {
    render,
    handleKey,
    dispose,
  };
}
