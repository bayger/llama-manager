import type { Terminal } from "terminal-kit";
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
import path from "path";

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

let state: ModelsState | null = null;
let downloadTimer: ReturnType<typeof setInterval> | null = null;

function initState(): ModelsState {
  if (state) return state;
  state = {
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
  return state;
}

async function refreshModels(s: ModelsState): Promise<void> {
  if (!s.config) return;
  s.loading = true;
  try {
    s.models = await listLocalModels(s.config);
    s.totalSize = await getTotalModelsSize(s.config);
    if (s.selectedIndex >= s.models.length) {
      s.selectedIndex = Math.max(0, s.models.length - 1);
    }
  } catch {
    s.message = "Failed to load models";
  }
  s.loading = false;
}

function renderHeader(s: ModelsState, term: Terminal, width: number, startY: number): number {
  const innerW = width - 2;
  const titleLine = ` Models │ ${s.models.length} local │ ${formatSize(s.totalSize)} used`;
  const dirLine = ` Dir: ${s.config ? getModelsDir(s.config) : "N/A"}`;

  let y = renderBox({ term, width, borderColor: themeColors.border, startY }, [
    {
      render: () => {
        fg(term, themeColors.text, titleLine);
        term(" ".repeat(Math.max(0, innerW - titleLine.length)));
      },
    },
    {
      render: () => {
        fg(term, themeColors.textMuted, dirLine);
        term(" ".repeat(Math.max(0, innerW - dirLine.length)));
      },
    },
  ]);
  renderLine(term, y++, () => {});
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

function renderActions(s: ModelsState, term: Terminal, width: number, startY: number): number {
  const innerW = width - 2;
  const actionLabels = [
    "Set Active",
    "Delete",
    "Search",
    "Browse",
  ];

  const parts: string[] = [];
  for (let i = 0; i < actionLabels.length; i++) {
    if (i === s.actionIndex) {
      parts.push(` ${actionLabels[i]} `);
    } else {
      parts.push(actionLabels[i]);
    }
  }
  const bar = parts.join(" │ ");

  let y = renderBox({ term, width, borderColor: themeColors.border, startY }, [
    {
      render: () => {
        fg(term, themeColors.textMuted, " Actions:");
        term(" ".repeat(Math.max(0, innerW - " Actions:".length)));
      },
    },
    {
      render: () => {
        for (let i = 0; i < actionLabels.length; i++) {
          if (i > 0) fg(term, themeColors.textMuted, " │");
          if (i === s.actionIndex) {
            term.bold();
            fg(term, themeColors.selected, ` ${actionLabels[i]} `);
            term.styleReset();
          } else {
            fg(term, themeColors.text, actionLabels[i]);
          }
        }
        const used = bar.length;
        term(" ".repeat(Math.max(0, innerW - used)));
      },
    },
  ]);
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

  let y = startY;
  const barWidth = Math.min(40, width - 10);
  const filled = Math.round((s.dlProgress / 100) * barWidth);
  const empty = barWidth - filled;

  const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const frame = spinnerFrames[Math.floor(Date.now() / 100) % spinnerFrames.length];

  renderLine(term, y++, () => {
    fg(term, themeColors.warning, `${frame} Downloading... ${s.dlProgress}%`);
    fg(term, themeColors.textMuted, ` ${s.dlLabel}`);
  });

  renderLine(term, y++, () => {
    for (let i = 0; i < filled; i++) fg(term, themeColors.accent, "█");
    for (let i = 0; i < empty; i++) fg(term, themeColors.border, "░");
  });

  return y;
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
  let y = startY;
  renderLine(term, y++, () => {});
  renderLine(term, y++, () => {
    fg(term, themeColors.textMuted, helpTexts[s.focusArea] || "");
  });
  return y;
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

export function render(_app: any): void {
  const s = initState();
  const term = _app.term as Terminal;

  if (!s.config && !s.initPromise) {
    s.loading = true;
    s.initPromise = (async () => {
      s.config = await loadConfig();
      if (s.config) {
        await refreshModels(s);
      }
      s.loading = false;
      _app.scheduleRender();
    })();
  }

  const width = termWidth(term);
  const height = termHeight(term);

  if (s.loading && s.models.length === 0) {
    let y = 3;
    renderLine(term, y++, () => {
      fg(term, themeColors.textMuted, "  Loading models...");
    });
    return;
  }

  if (s.downloading) {
    let y = 3;
    y = renderHeader(s, term, width, y);
    y = renderModelList(s, term, width, y);
    y = renderDownloadProgress(s, term, width, y);
    return;
  }

  let y = 3;

  switch (s.focusArea) {
    case "list": {
      y = renderHeader(s, term, width, y);
      y = renderModelList(s, term, width, y);
      y = renderHelp(s, term, y);
      break;
    }

    case "actions": {
      y = renderHeader(s, term, width, y);
      y = renderModelList(s, term, width, y);
      y = renderActions(s, term, width, y);
      y = renderHelp(s, term, y);
      break;
    }

    case "search": {
      if (s.editMode) {
        y = renderHeader(s, term, width, y);
        renderLine(term, y++, () => {
          term.bold();
          fg(term, themeColors.accent, `  Search: ${s.editValue}`);
          term.styleReset();
        });
        y = renderHelp(s, term, y);
      } else {
        y = renderHeader(s, term, width, y);
        renderLine(term, y++, () => {
          fg(term, themeColors.textMuted, `  Query: ${s.searchQuery}`);
        });
        renderLine(term, y++, () => {});
        y = renderSearchResults(s, term, width, y);
        y = renderHelp(s, term, y);
      }
      break;
    }

    case "files": {
      y = renderHeader(s, term, width, y);
      y = renderRepoFiles(s, term, width, y);
      y = renderHelp(s, term, y);
      break;
    }

    case "browse": {
      if (s.browseEditMode) {
        y = renderHeader(s, term, width, y);
        renderLine(term, y++, () => {
          term.bold();
          fg(term, themeColors.accent, `  Browse search: ${s.browseEditValue}`);
          term.styleReset();
        });
        y = renderHelp(s, term, y);
      } else {
        y = renderHeader(s, term, width, y);
        renderLine(term, y++, () => {
          fg(term, themeColors.textMuted, `  Browse (${SORT_OPTIONS[s.browseSort]?.label})`);
        });
        renderLine(term, y++, () => {});
        y = renderBrowseResults(s, term, width, y);
        y = renderHelp(s, term, y);
      }
      break;
    }

    case "browsefilters": {
      y = renderHeader(s, term, width, y);
      y = renderBrowseResults(s, term, width, y);
      y = renderBrowseFilters(s, term, width, y);
      y = renderHelp(s, term, y);
      break;
    }

    case "browsesort": {
      y = renderHeader(s, term, width, y);
      y = renderBrowseResults(s, term, width, y);
      y = renderBrowseSort(s, term, width, y);
      y = renderHelp(s, term, y);
      break;
    }

    case "modelcard": {
      y = renderHeader(s, term, width, y);
      y = renderModelCard(s, term, width, y);
      y = renderHelp(s, term, y);
      break;
    }
  }

  renderMessage(s, term, y);
}

function clampIndex(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(value, max - 1));
}

async function executeAction(s: ModelsState, actionIndex: number, app: any): Promise<void> {
  const action = ACTIONS[actionIndex];
  if (!s.config) return;

  switch (action) {
    case "setactive": {
      if (s.models.length === 0 || s.selectedIndex >= s.models.length) {
        s.message = "No model selected";
        return;
      }
      const m = s.models[s.selectedIndex];
      try {
        const updated = await setActiveModel(s.config, m.repoId, m.filename);
        await saveConfig(updated);
        s.config = updated;
        await refreshModels(s);
        s.message = `Set active: ${m.repoId}/${m.filename}`;
        app.showMessage(s.message!);
      } catch (err: any) {
        s.message = `Error: ${err.message}`;
      }
      break;
    }

    case "delete": {
      if (s.models.length === 0 || s.selectedIndex >= s.models.length) {
        s.message = "No model selected";
        return;
      }
      const m = s.models[s.selectedIndex];
      try {
        const updated = await deleteModel(s.config, m.path);
        await saveConfig(updated);
        s.config = updated;
        await refreshModels(s);
        s.message = `Deleted: ${m.filename}`;
        app.showMessage(s.message!);
      } catch (err: any) {
        s.message = `Error: ${err.message}`;
      }
      break;
    }

    case "search": {
      s.focusArea = "search";
      s.editMode = true;
      s.editValue = "";
      s.searchResults = [];
      s.searchIndex = 0;
      app.setTextInputFocused(true);
      break;
    }

    case "browse": {
      s.focusArea = "browse";
      s.browseResults = [];
      s.browseIndex = 0;
      await fetchBrowse(s);
      break;
    }
  }
}

async function fetchBrowse(s: ModelsState): Promise<void> {
  if (!s.config) return;
  s.loading = true;
  s.message = null;
  try {
    const activeFilters: string[] = [];
    for (let i = 0; i < ALL_FILTERS.length; i++) {
      if (s.browseFilters[i] && ALL_FILTERS[i].filter) {
        activeFilters.push(ALL_FILTERS[i].filter);
      }
    }

    const sortValue = SORT_OPTIONS[s.sortIndex]?.value || "likes";
    const direction = s.browseDirection as 1 | -1;

    const results = await browseModels(
      {
        sort: sortValue as any,
        direction,
        filters: activeFilters,
        search: s.browseSearchQuery || undefined,
      },
      s.config.hfToken || undefined,
    );
    s.browseResults = results;
    s.browseIndex = 0;
  } catch (err: any) {
    s.message = `Browse error: ${err.message}`;
  }
  s.loading = false;
}

async function submitSearch(s: ModelsState, app: any): Promise<void> {
  if (!s.config || !s.editValue.trim()) {
    s.editMode = false;
    app.setTextInputFocused(false);
    return;
  }
  s.searchQuery = s.editValue.trim();
  s.editMode = false;
  s.searching = true;
  s.message = null;
  app.setTextInputFocused(false);
  try {
    const results = await searchRepos(
      s.searchQuery,
      s.config.hfToken || undefined,
    );
    s.searchResults = results;
    s.searchIndex = 0;
  } catch (err: any) {
    s.message = `Search error: ${err.message}`;
  }
  s.searching = false;
}

async function downloadSelectedFile(s: ModelsState, app: any): Promise<void> {
  if (!s.config || s.fileIndex >= s.repoFiles.length) return;
  const file = s.repoFiles[s.fileIndex];
  s.downloading = true;
  s.dlProgress = 0;
  s.dlLabel = "";
  s.message = null;
  try {
    await downloadModel(
      s.config,
      s.repoId,
      file.rfpath,
      file.size,
      (pct, label) => {
        s.dlProgress = pct;
        s.dlLabel = label;
      },
      s.config.hfToken || undefined,
    );
    s.message = `Downloaded: ${file.rfpath}`;
    app.showMessage(s.message!);
    await refreshModels(s);
  } catch (err: any) {
    s.message = `Download error: ${err.message}`;
  }
  s.downloading = false;
}

async function openRepoFiles(s: ModelsState, repoId: string, app: any): Promise<void> {
  if (!s.config) return;
  s.focusArea = "files";
  s.repoId = repoId;
  s.repoFiles = [];
  s.fileIndex = 0;
  s.fetchingFiles = true;
  s.message = null;
  try {
    const files = await listFiles(repoId, s.config.hfToken || undefined);
    s.repoFiles = files;
    s.fileIndex = 0;
  } catch (err: any) {
    s.message = `Files error: ${err.message}`;
  }
  s.fetchingFiles = false;
}

async function fetchModelCard(s: ModelsState, repoId: string, app: any): Promise<void> {
  if (!s.config) return;
  s.focusArea = "modelcard";
  s.fetchingCard = true;
  s.message = null;
  try {
    const info = await getModelInfo(repoId, s.config.hfToken || undefined);
    s.modelCard = info;
  } catch (err: any) {
    s.message = `Card error: ${err.message}`;
  }
  s.fetchingCard = false;
}

export function handleKey(_app: any, key: string): boolean {
  const s = initState();
  const app = _app;

  if (s.downloading) {
    return true;
  }

  if (s.searching || s.loading || s.fetchingFiles || s.fetchingCard) {
    return true;
  }

  if (s.editMode) {
    if (key === "\r" || key === "Return") {
      submitSearch(s, app);
      return true;
    }
    if (key === "\u0003" || key === "Escape" || key === "Ctrl+C") {
      s.editMode = false;
      s.editValue = "";
      app.setTextInputFocused(false);
      return true;
    }
    if (key === "\u007f" || key === "Backspace") {
      s.editValue = s.editValue.slice(0, -1);
      return true;
    }
    if (key.length === 1) {
      s.editValue += key;
      return true;
    }
    return true;
  }

  if (s.browseEditMode) {
    if (key === "\r" || key === "Return") {
      s.browseSearchQuery = s.browseEditValue.trim();
      s.browseEditMode = false;
      s.browseEditValue = "";
      app.setTextInputFocused(false);
      fetchBrowse(s);
      return true;
    }
    if (key === "\u0003" || key === "Escape" || key === "Ctrl+C") {
      s.browseEditMode = false;
      s.browseEditValue = "";
      app.setTextInputFocused(false);
      return true;
    }
    if (key === "\u007f" || key === "Backspace") {
      s.browseEditValue = s.browseEditValue.slice(0, -1);
      return true;
    }
    if (key.length === 1) {
      s.browseEditValue += key;
      return true;
    }
    return true;
  }

  switch (s.focusArea) {
    case "list": {
      switch (key) {
        case "k":
        case "up":
          s.selectedIndex = clampIndex(s.selectedIndex - 1, s.models.length);
          return true;
        case "j":
        case "down":
          s.selectedIndex = clampIndex(s.selectedIndex + 1, s.models.length);
          return true;
        case "g":
          s.focusArea = "actions";
          s.actionIndex = 0;
          return true;
        case "\r":
        case "Return":
          s.focusArea = "actions";
          s.actionIndex = 0;
          return true;
      }
      break;
    }

    case "actions": {
      switch (key) {
        case "h":
        case "left":
          s.actionIndex = clampIndex(s.actionIndex - 1, ACTIONS.length);
          return true;
        case "l":
        case "right":
          s.actionIndex = clampIndex(s.actionIndex + 1, ACTIONS.length);
          return true;
        case "j":
        case "k":
        case "up":
        case "down":
          s.focusArea = "list";
          return true;
        case "\r":
        case "Return":
          executeAction(s, s.actionIndex, app);
          return true;
        case "g":
          s.focusArea = "list";
          return true;
        case "Escape":
          s.focusArea = "list";
          return true;
      }
      break;
    }

    case "search": {
      switch (key) {
        case "k":
        case "up":
          s.searchIndex = clampIndex(s.searchIndex - 1, s.searchResults.length);
          return true;
        case "j":
        case "down":
          s.searchIndex = clampIndex(s.searchIndex + 1, s.searchResults.length);
          return true;
        case "g":
          s.focusArea = "list";
          return true;
        case "Escape":
          s.focusArea = "list";
          return true;
        case "e":
          s.editMode = true;
          s.editValue = s.searchQuery;
          app.setTextInputFocused(true);
          return true;
        case "\r":
        case "Return":
          if (s.searchResults.length > 0 && s.searchIndex < s.searchResults.length) {
            openRepoFiles(s, s.searchResults[s.searchIndex].id, app);
          }
          return true;
      }
      break;
    }

    case "files": {
      switch (key) {
        case "k":
        case "up":
          s.fileIndex = clampIndex(s.fileIndex - 1, s.repoFiles.length);
          return true;
        case "j":
        case "down":
          s.fileIndex = clampIndex(s.fileIndex + 1, s.repoFiles.length);
          return true;
        case "g":
          s.focusArea = "search";
          return true;
        case "Escape":
          s.focusArea = "search";
          return true;
        case "\r":
        case "Return":
          if (s.repoFiles.length > 0 && s.fileIndex < s.repoFiles.length) {
            downloadSelectedFile(s, app);
          }
          return true;
      }
      break;
    }

    case "browse": {
      switch (key) {
        case "k":
        case "up":
          s.browseIndex = clampIndex(s.browseIndex - 1, s.browseResults.length);
          return true;
        case "j":
        case "down":
          s.browseIndex = clampIndex(s.browseIndex + 1, s.browseResults.length);
          return true;
        case "g":
          s.focusArea = "list";
          return true;
        case "Escape":
          s.focusArea = "list";
          return true;
        case "f":
          s.focusArea = "browsefilters";
          s.filterIndex = 0;
          return true;
        case "s":
          s.focusArea = "browsesort";
          s.sortIndex = s.browseSort;
          return true;
        case "m":
          if (s.browseResults.length > 0 && s.browseIndex < s.browseResults.length) {
            fetchModelCard(s, s.browseResults[s.browseIndex].id, app);
          }
          return true;
        case "e":
          s.browseEditMode = true;
          s.browseEditValue = s.browseSearchQuery;
          app.setTextInputFocused(true);
          return true;
        case "\r":
        case "Return":
          if (s.browseResults.length > 0 && s.browseIndex < s.browseResults.length) {
            openRepoFiles(s, s.browseResults[s.browseIndex].id, app);
          }
          return true;
      }
      break;
    }

    case "browsefilters": {
      switch (key) {
        case "h":
        case "left":
          s.filterIndex = clampIndex(s.filterIndex - 1, ALL_FILTERS.length);
          return true;
        case "l":
        case "right":
          s.filterIndex = clampIndex(s.filterIndex + 1, ALL_FILTERS.length);
          return true;
        case "\r":
        case "Return": {
          const filterGroup = ALL_FILTERS[s.filterIndex];
          if (TASK_FILTERS.includes(filterGroup)) {
            for (let i = 0; i < TASK_FILTERS.length; i++) {
              s.browseFilters[i] = false;
            }
            const taskIdx = TASK_FILTERS.indexOf(filterGroup);
            if (taskIdx >= 0) {
              s.browseFilters[taskIdx] = true;
            }
          } else {
            s.browseFilters[s.filterIndex] = !s.browseFilters[s.filterIndex];
          }
          fetchBrowse(s);
          return true;
        }
        case "g":
          s.focusArea = "browse";
          return true;
        case "Escape":
          s.focusArea = "browse";
          return true;
        case "s":
          s.focusArea = "browsesort";
          s.sortIndex = s.browseSort;
          return true;
      }
      break;
    }

    case "browsesort": {
      switch (key) {
        case "h":
        case "left":
          s.sortIndex = clampIndex(s.sortIndex - 1, SORT_OPTIONS.length);
          return true;
        case "l":
        case "right":
          s.sortIndex = clampIndex(s.sortIndex + 1, SORT_OPTIONS.length);
          return true;
        case "R":
          s.browseDirection = s.browseDirection === -1 ? 1 : -1;
          fetchBrowse(s);
          return true;
        case "\r":
        case "Return":
          s.browseSort = s.sortIndex;
          fetchBrowse(s);
          s.focusArea = "browse";
          return true;
        case "g":
          s.focusArea = "browse";
          return true;
        case "Escape":
          s.focusArea = "browse";
          return true;
      }
      break;
    }

    case "modelcard": {
      switch (key) {
        case "g":
        case "m":
          s.focusArea = "browse";
          return true;
        case "Escape":
          s.focusArea = "browse";
          return true;
        case "\r":
        case "Return":
          if (s.modelCard) {
            openRepoFiles(s, s.modelCard.id, app);
          }
          return true;
      }
      break;
    }
  }

  return false;
}

export function dispose(): void {
  if (downloadTimer) {
    clearInterval(downloadTimer);
    downloadTimer = null;
  }
  state = null;
}
