import React from "react";
import path from "path";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { useOnClick } from "@ink-tools/ink-mouse";
import { loadConfig, saveConfig, ConfigData, getModelsDir } from "../../lib/config.js";
import { listLocalModels, deleteModel, formatSize, getTotalModelsSize, downloadModel, setActiveModel, LocalModel, DownloadProgress } from "../../lib/models.js";
import { searchRepos, listFiles, browseModels, getModelInfo, HFRepoInfo, HFFileInfo, HFModelInfo } from "../../lib/hf.js";

type FocusArea = "list" | "actions" | "search" | "files" | "browse" | "browsefilters" | "browsesort" | "modelcard";
type Action = "setactive" | "delete" | "search" | "browse";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatLikes(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return `${count}`;
}

function formatDownloads(count: number | undefined): string {
  if (!count) return "—";
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return `${count}`;
}

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
] as const;

function ActionButton({ action, isActive, onClick }: { action: Action; isActive: boolean; onClick: () => void }) {
  const ref = React.useRef<React.ComponentRef<typeof Box>>(null);
  useOnClick(ref, onClick);
  const label =
    action === "setactive" ? "Set Active"
      : action === "delete" ? "Delete"
        : action === "search" ? "Search"
          : "Browse";
  return (
    <Box marginRight={1} ref={ref}>
      <Text
        bold={isActive}
        color={isActive ? "white" : "cyan"}
        backgroundColor={isActive ? "white" : undefined}
      >
        {` ${label} `}
      </Text>
    </Box>
  );
}

function ModelRow({ model, isSelected, onClick }: { model: LocalModel; isSelected: boolean; onClick: () => void }) {
  const ref = React.useRef<React.ComponentRef<typeof Box>>(null);
  useOnClick(ref, onClick);
  return (
    <Box ref={ref}>
      <Text color={isSelected ? "white" : model.active ? "green" : "gray"} bold={isSelected || model.active}>
        {model.active ? "● " : "  "}
      </Text>
      <Text color={isSelected ? "white" : "cyan"} bold={isSelected}>
        {model.repoId}
      </Text>
      <Text color={isSelected ? "white" : "gray"}>
        /{model.filename}
      </Text>
      <Text> {" "} </Text>
      <Text color={isSelected ? "gray" : "gray"}>
        ({formatSize(model.sizeBytes)})
      </Text>
      {model.active && (
        <>
          <Text> {" "} </Text>
          <Text color="green">(active)</Text>
        </>
      )}
    </Box>
  );
}

function BrowseRepoRow({ repo, isSelected, onClick }: { repo: HFRepoInfo; isSelected: boolean; onClick: () => void }) {
  const ref = React.useRef<React.ComponentRef<typeof Box>>(null);
  useOnClick(ref, onClick);
  return (
    <Box ref={ref}>
      <Text color={isSelected ? "white" : "cyan"} bold={isSelected}>
        {isSelected ? "▸ " : "  "}
      </Text>
      <Text color={isSelected ? "white" : "white"} bold={isSelected}>
        {repo.id}
      </Text>
      <Text> {" "} </Text>
      <Text color={isSelected ? "gray" : "gray"}>
        ♥ {formatLikes(repo.likes)}
      </Text>
      <Text> {" "} </Text>
      <Text color={isSelected ? "gray" : "gray"}>
        ↓ {formatDownloads(repo.downloads)}
      </Text>
      <Text> {" "} </Text>
      <Text color={isSelected ? "gray" : "gray"}>
        {formatDate(repo.lastModified)}
      </Text>
    </Box>
  );
}

function SearchRepoRow({ repo, isSelected, onClick }: { repo: HFRepoInfo; isSelected: boolean; onClick: () => void }) {
  const ref = React.useRef<React.ComponentRef<typeof Box>>(null);
  useOnClick(ref, onClick);
  return (
    <Box ref={ref}>
      <Text color={isSelected ? "white" : "cyan"} bold={isSelected}>
        {isSelected ? "▸ " : "  "}
      </Text>
      <Text color={isSelected ? "white" : "white"} bold={isSelected}>
        {repo.id}
      </Text>
      <Text> {" "} </Text>
      <Text color={isSelected ? "gray" : "gray"}>
        ♥ {formatLikes(repo.likes)}
      </Text>
      <Text> {" "} </Text>
      <Text color={isSelected ? "gray" : "gray"}>
        {formatDate(repo.lastModified)}
      </Text>
    </Box>
  );
}

function FileRow({ file, isSelected, isDownloaded, onClick }: { file: HFFileInfo; isSelected: boolean; isDownloaded: boolean; onClick: () => void }) {
  const ref = React.useRef<React.ComponentRef<typeof Box>>(null);
  useOnClick(ref, onClick);
  return (
    <Box ref={ref}>
      <Text color={isSelected ? "white" : isDownloaded ? "green" : "cyan"} bold={isSelected}>
        {isSelected ? "▸ " : "  "}
      </Text>
      <Text color={isSelected ? "white" : "white"} bold={isSelected}>
        {file.rfpath}
      </Text>
      <Text> {" "} </Text>
      <Text color={isSelected ? "gray" : "gray"}>
        ({formatSize(file.size)})
      </Text>
      {isDownloaded && (
        <>
          <Text> {" "} </Text>
          <Text color="green">[downloaded]</Text>
        </>
      )}
    </Box>
  );
}

function FilterButton({ label, isActive, isOn, onClick }: { label: string; isActive: boolean; isOn: boolean; onClick: () => void }) {
  const ref = React.useRef<React.ComponentRef<typeof Box>>(null);
  useOnClick(ref, onClick);
  return (
    <Box marginRight={1} ref={ref}>
      <Text
        bold={isActive}
        color={isActive ? "white" : isOn ? "green" : "gray"}
        backgroundColor={isActive ? "white" : undefined}
      >
        {` ${isOn ? "● " : "○ "}${label} `}
      </Text>
    </Box>
  );
}

function SortButton({ label, isActive, isCurrent, direction, onClick }: { label: string; isActive: boolean; isCurrent: boolean; direction: number; onClick: () => void }) {
  const ref = React.useRef<React.ComponentRef<typeof Box>>(null);
  useOnClick(ref, onClick);
  return (
    <Box marginRight={1} ref={ref}>
      <Text
        bold={isActive}
        color={isActive ? "white" : isCurrent ? "green" : "gray"}
        backgroundColor={isActive ? "white" : undefined}
      >
        {` ${direction === -1 ? "↓" : "↑"}${label} `}
      </Text>
    </Box>
  );
}

export default function ModelsTab() {
  const [config, setConfig] = React.useState<ConfigData | null>(null);
  const [models, setModels] = React.useState<LocalModel[]>([]);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [focusArea, setFocusArea] = React.useState<FocusArea>("list");
  const [actionIndex, setActionIndex] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);
  const [totalSize, setTotalSize] = React.useState(0);
  const [searching, setSearching] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<HFRepoInfo[]>([]);
  const [searchIndex, setSearchIndex] = React.useState(0);
  const [downloading, setDownloading] = React.useState(false);
  const [dlProgress, setDlProgress] = React.useState(0);
  const [dlLabel, setDlLabel] = React.useState("");
  const [repoFiles, setRepoFiles] = React.useState<HFFileInfo[]>([]);
  const [repoId, setRepoId] = React.useState("");
  const [fileIndex, setFileIndex] = React.useState(0);
  const [fetchingFiles, setFetchingFiles] = React.useState(false);
  const [editMode, setEditMode] = React.useState(false);
  const [editValue, setEditValue] = React.useState("");
  
  const [browseResults, setBrowseResults] = React.useState<HFRepoInfo[]>([]);
  const [browseIndex, setBrowseIndex] = React.useState(0);
  const [browseSort, setBrowseSort] = React.useState(0);
  const [browseDirection, setBrowseDirection] = React.useState(-1);
  const [browseFilters, setBrowseFilters] = React.useState<boolean[]>([]);
  const [filterIndex, setFilterIndex] = React.useState(0);
  const [sortIndex, setSortIndex] = React.useState(0);
  const [modelCard, setModelCard] = React.useState<HFModelInfo | null>(null);
  const [fetchingCard, setFetchingCard] = React.useState(false);

  const actions: Action[] = ["setactive", "delete", "search", "browse"];

  React.useEffect(() => {
    loadConfig().then(async (c) => {
      setConfig(c);
      const ms = await listLocalModels(c);
      setModels(ms);
      const size = await getTotalModelsSize(c);
      setTotalSize(size);
      setLoading(false);
      if (ms.length === 0) {
        setFocusArea("actions");
        setActionIndex(2);
      }
    });
  }, []);

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 5000);
  };

  const installedPaths = new Set(models.map((m) => m.path));

  const handleSetActive = async () => {
    if (!config || selectedIndex >= models.length) return;
    const m = models[selectedIndex];
    try {
      const newConfig = await setActiveModel(config, m.repoId, m.filename);
      await saveConfig(newConfig);
      setConfig(newConfig);
      setModels((prev) => prev.map((x) => ({ ...x, active: x.path === m.path })));
      showMessage(`Active model: ${m.repoId}/${m.filename}`);
    } catch (err: any) {
      showMessage(`Failed: ${err.message}`);
    }
  };

  const handleDelete = async () => {
    if (!config || selectedIndex >= models.length) return;
    const m = models[selectedIndex];
    try {
      const newConfig = await deleteModel(config, m.path);
      await saveConfig(newConfig);
      setConfig(newConfig);
      const ms = await listLocalModels(newConfig);
      setModels(ms);
      setSelectedIndex(0);
      const size = await getTotalModelsSize(newConfig);
      setTotalSize(size);
      showMessage(`Deleted ${m.filename}`);
    } catch (err: any) {
      showMessage(`Delete failed: ${err.message}`);
    }
  };

  const handleSearch = async () => {
    if (!editValue.trim()) return;
    const query = editValue.trim();
    setSearching(true);
    setFocusArea("search");
    setSearchQuery(query);
    setEditMode(false);
    setSearchIndex(0);
    try {
      const results = await searchRepos(query, config?.hfToken || undefined);
      setSearchResults(results);
    } catch (err: any) {
      showMessage(`Search failed: ${err.message}`);
      setFocusArea("actions");
    } finally {
      setSearching(false);
    }
  };

  const openRepoFiles = async (id: string) => {
    setFetchingFiles(true);
    setRepoId(id);
    setFileIndex(0);
    setFocusArea("files");
    try {
      const files = await listFiles(id, config?.hfToken || undefined);
      setRepoFiles(files);
      if (files.length === 0) {
        showMessage("No GGUF files in this repo");
      }
    } catch (err: any) {
      showMessage(`Failed: ${err.message}`);
      setFocusArea("search");
    } finally {
      setFetchingFiles(false);
    }
  };

  const handleDownload = async (file: HFFileInfo) => {
    if (!config) return;
    const filename = file.rfpath;
    setDownloading(true);
    setDlProgress(0);
    setDlLabel("Starting...");
    const onProgress: DownloadProgress = (pct, label) => {
      setDlProgress(pct);
      setDlLabel(label);
    };
    try {
      const modelPath = await downloadModel(config, repoId, filename, file.size, onProgress, config.hfToken || undefined);
      const ms = await listLocalModels(config);
      setModels(ms);
      const size = await getTotalModelsSize(config);
      setTotalSize(size);
      showMessage(`Downloaded ${filename}`);
      setRepoFiles((prev) => prev.map((f) => f.rfpath === filename ? { ...f, size: file.size } : f));
    } catch (err: any) {
      showMessage(`Download failed: ${err.message}`);
    } finally {
      setDownloading(false);
      setDlProgress(0);
      setDlLabel("");
    }
  };

  const startBrowse = () => {
    setFocusArea("browse");
    setBrowseIndex(0);
    setBrowseFilters(new Array(ALL_FILTERS.length).fill(false));
    setFilterIndex(0);
    setSortIndex(0);
    setBrowseSort(0);
    setBrowseDirection(-1);
    executeBrowse();
  };

  const executeBrowse = async () => {
    setSearching(true);
    const activeFilters = ALL_FILTERS
      .map((f, i) => browseFilters[i] ? f.filter : null)
      .filter((f): f is string => f !== null);
    const sortOption = SORT_OPTIONS[browseSort];
    try {
      const results = await browseModels({
        sort: sortOption.value as any,
        direction: browseDirection as 1 | -1,
        filters: activeFilters,
        limit: 20,
      }, config?.hfToken || undefined);
      setBrowseResults(results);
      setBrowseIndex(0);
    } catch (err: any) {
      showMessage(`Browse failed: ${err.message}`);
      setFocusArea("actions");
    } finally {
      setSearching(false);
    }
  };

  const toggleFilter = async (index: number) => {
    const newFilters = [...browseFilters];
    const isTaskFilter = index < TASK_FILTERS.length;
    if (isTaskFilter) {
      newFilters.fill(false, 0, TASK_FILTERS.length);
    }
    newFilters[index] = !newFilters[index];
    setBrowseFilters(newFilters);
    setBrowseIndex(0);
    setSearching(true);
    const activeFilters = ALL_FILTERS
      .map((f, i) => newFilters[i] ? f.filter : null)
      .filter((f): f is string => f !== null);
    const sortOption = SORT_OPTIONS[browseSort];
    try {
      const results = await browseModels({
        sort: sortOption.value as any,
        direction: browseDirection as 1 | -1,
        filters: activeFilters,
        limit: 20,
      }, config?.hfToken || undefined);
      setBrowseResults(results);
      setBrowseIndex(0);
    } catch (err: any) {
      showMessage(`Browse failed: ${err.message}`);
    } finally {
      setSearching(false);
    }
  };

  const fetchModelCard = async (repo: HFRepoInfo) => {
    setFetchingCard(true);
    setFocusArea("modelcard");
    try {
      const info = await getModelInfo(repo.id, config?.hfToken || undefined);
      setModelCard(info);
    } catch (err: any) {
      showMessage(`Model card failed: ${err.message}`);
      setFocusArea("browse");
    } finally {
      setFetchingCard(false);
    }
  };

  useInput((input, key) => {
    if (downloading) return;

    if (focusArea === "browse" || focusArea === "browsefilters" || focusArea === "browsesort" || focusArea === "modelcard") {
      if (focusArea === "modelcard") {
        if (input === "m" || key.escape || input === "g") {
          setFocusArea("browse");
          setModelCard(null);
        } else if (key.return) {
          const repo = browseResults[browseIndex];
          if (repo) {
            setFocusArea("browse");
            setModelCard(null);
            openRepoFiles(repo.id);
          }
        }
        return;
      }

      if (focusArea === "browsefilters") {
        if (input === "h" || key.leftArrow) {
          setFilterIndex((prev) => Math.max(prev - 1, 0));
        } else if (input === "l" || key.rightArrow) {
          setFilterIndex((prev) => Math.min(prev + 1, ALL_FILTERS.length - 1));
        } else if (key.return) {
          toggleFilter(filterIndex);
        } else if (input === "s") {
          setFocusArea("browsesort");
          setSortIndex(browseSort);
        } else if (input === "g") {
          setFocusArea("browse");
        }
        return;
      }

      if (focusArea === "browsesort") {
        if (input === "h" || key.leftArrow) {
          setSortIndex((prev) => Math.max(prev - 1, 0));
        } else if (input === "l" || key.rightArrow) {
          setSortIndex((prev) => Math.min(prev + 1, SORT_OPTIONS.length - 1));
        } else if (key.return) {
          setBrowseSort(sortIndex);
          setFocusArea("browse");
          executeBrowse();
        } else if (input === "R") {
          setBrowseDirection((prev) => prev * -1);
          executeBrowse();
        } else if (input === "g") {
          setFocusArea("browse");
        }
        return;
      }

      if (input === "k" || key.upArrow) {
        setBrowseIndex((prev) => Math.max(prev - 1, 0));
      } else if (input === "j" || key.downArrow) {
        setBrowseIndex((prev) => Math.min(prev + 1, browseResults.length - 1));
      } else if (key.return) {
        const repo = browseResults[browseIndex];
        if (repo) openRepoFiles(repo.id);
      } else if (input === "f") {
        setFocusArea("browsefilters");
      } else if (input === "s") {
        setFocusArea("browsesort");
        setSortIndex(browseSort);
      } else if (input === "m") {
        const repo = browseResults[browseIndex];
        if (repo) fetchModelCard(repo);
      } else if (input === "R") {
        setBrowseDirection((prev) => prev * -1);
        executeBrowse();
      } else if (input === "g") {
        setFocusArea("actions");
      }
      return;
    }

    if (focusArea === "search" || focusArea === "files") {
      if (editMode && focusArea === "search") {
        if (key.return) {
          handleSearch();
        } else if (input === "\u0003" || key.escape) {
          setEditMode(false);
        }
        return;
      }

      if (focusArea === "files") {
        if (fetchingFiles) return;
        if (input === "k" || key.upArrow) {
          setFileIndex((prev) => Math.max(prev - 1, 0));
        } else if (input === "j" || key.downArrow) {
          setFileIndex((prev) => Math.min(prev + 1, repoFiles.length - 1));
        } else if (key.return) {
          const file = repoFiles[fileIndex];
          if (file) handleDownload(file);
        } else if (input === "g") {
          setFocusArea("search");
        }
        return;
      }

      if (input === "k" || key.upArrow) {
        setSearchIndex((prev) => Math.max(prev - 1, 0));
      } else if (input === "j" || key.downArrow) {
        setSearchIndex((prev) => Math.min(prev + 1, searchResults.length - 1));
      } else if (key.return) {
        const repo = searchResults[searchIndex];
        if (repo) openRepoFiles(repo.id);
      } else if (input === "g") {
        setFocusArea("actions");
      } else if (input === "e") {
        setEditMode(true);
        setEditValue(searchQuery);
      }
      return;
    }

    if (focusArea === "actions") {
      if (input === "h" || key.leftArrow) {
        setActionIndex((prev) => Math.max(prev - 1, 0));
      } else if (input === "l" || key.rightArrow) {
        setActionIndex((prev) => Math.min(prev + 1, actions.length - 1));
      } else if (key.return) {
        const action = actions[actionIndex];
        if (action === "setactive") handleSetActive();
        else if (action === "delete") handleDelete();
        else if (action === "search") {
          setFocusArea("search");
          setEditMode(true);
          setEditValue("");
        } else if (action === "browse") {
          startBrowse();
        }
      } else if (input === "k" || key.upArrow) {
        if (models.length > 0) {
          setFocusArea("list");
        }
      } else if (input === "j" || key.downArrow) {
        setFocusArea("list");
      }
      return;
    }

    if (focusArea === "list") {
      if (input === "g") {
        setFocusArea("actions");
        setActionIndex(0);
      } else if (input === "k" || key.upArrow) {
        if (selectedIndex > 0) {
          setSelectedIndex((prev) => prev - 1);
        } else {
          setFocusArea("actions");
          setActionIndex(actions.length - 1);
        }
      } else if (input === "j" || key.downArrow) {
        if (models.length === 0) {
          setFocusArea("actions");
          setActionIndex(0);
        } else if (selectedIndex < models.length - 1) {
          setSelectedIndex((prev) => prev + 1);
        }
      } else if (key.return) {
        setFocusArea("actions");
        setActionIndex(0);
      }
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box paddingTop={1}>
          <Text color="gray">Loading models...</Text>
        </Box>
      </Box>
    );
  }

  if (focusArea === "search" || focusArea === "files") {
    const isFiles = focusArea === "files";
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box flexDirection="column" borderStyle="single" borderColor="gray">
          <Box flexDirection="row" justifyContent="space-between">
            <Box>
              <Text bold>{isFiles ? `Files in ${repoId}` : `Search: "${searchQuery}"`}</Text>
            </Box>
            <Box>
              <Text color="gray">j/k navigate │ Enter {isFiles ? "download" : "open"} │ g {isFiles ? "back to search" : "back"} │ e new search</Text>
            </Box>
          </Box>
        </Box>

        <Box flexDirection="column" flexGrow={1} marginTop={1}>
          {fetchingFiles ? (
            <Box>
              <Text color="cyan"><Spinner type="line" /></Text>
              <Text> {" "} </Text>
              <Text color="gray">Fetching files...</Text>
            </Box>
          ) : isFiles ? (
            repoFiles.length === 0 ? (
              <Box>
                <Text color="gray">No GGUF files found. Press g to go back.</Text>
              </Box>
            ) : (
              repoFiles.map((f, i) => (
                <FileRow
                  key={f.rfpath}
                  file={f}
                  isSelected={fileIndex === i}
                  isDownloaded={config ? installedPaths.has(path.join(getModelsDir(config), repoId, f.rfpath)) : false}
                  onClick={() => {
                    setFileIndex(i);
                    handleDownload(f);
                  }}
                />
              ))
            )
          ) : searching ? (
            <Box>
              <Text color="cyan"><Spinner type="line" /></Text>
              <Text> {" "} </Text>
              <Text color="gray">Searching...</Text>
            </Box>
          ) : searchResults.length === 0 ? (
            <Box>
              <Text color="gray">No results. Press e for new search or g to go back.</Text>
            </Box>
          ) : (
            searchResults.map((r, i) => (
              <SearchRepoRow
                key={r.id}
                repo={r}
                isSelected={searchIndex === i}
                onClick={() => {
                  setSearchIndex(i);
                  openRepoFiles(r.id);
                }}
              />
            ))
          )}
        </Box>

        {editMode && (
          <Box marginTop={1}>
            <Text color="yellow" bold>Search: </Text>
            <TextInput value={editValue} onChange={setEditValue} focus />
          </Box>
        )}

        {downloading && (
          <Box marginTop={1}>
            <Text color="cyan"><Spinner type="line" /></Text>
            <Text> {" "} </Text>
            <Text color="gray">{dlLabel}</Text>
            <Text> {" "} </Text>
            <Text color="gray">({dlProgress}%)</Text>
            <Box>
              <Text color="gray">{"█".repeat(Math.round(dlProgress / 5))}</Text>
              <Text color="gray">{"░".repeat(20 - Math.round(dlProgress / 5))}</Text>
            </Box>
          </Box>
        )}

        {message && (
          <Box marginTop={1}>
            <Text color="green">{` › ${message}`}</Text>
          </Box>
        )}
      </Box>
     );
   }

  if (focusArea === "browse" || focusArea === "browsefilters" || focusArea === "browsesort" || focusArea === "modelcard") {
    const isCard = focusArea === "modelcard";
    const isFilters = focusArea === "browsefilters";
    const isSort = focusArea === "browsesort";

    if (isCard) {
      return (
        <Box flexDirection="column" flexGrow={1}>
          <Box flexDirection="column" borderStyle="single" borderColor="gray">
            <Box flexDirection="row" justifyContent="space-between">
              <Box>
                <Text bold>Model Card</Text>
              </Box>
              <Box>
                <Text color="gray">m/g close │ Enter open files</Text>
              </Box>
            </Box>
          </Box>

          <Box flexDirection="column" flexGrow={1} marginTop={1}>
            {fetchingCard ? (
              <Box>
                <Text color="cyan"><Spinner type="line" /></Text>
                <Text> {" "} </Text>
                <Text color="gray">Fetching model info...</Text>
              </Box>
            ) : modelCard ? (
              <Box flexDirection="column">
                <Box>
                  <Text color="cyan" bold>{modelCard.id}</Text>
                </Box>
                <Box marginTop={1}>
                  <Text color="gray">Author:     </Text>
                  <Text>{modelCard.author}</Text>
                </Box>
                <Box>
                  <Text color="gray">Likes:      </Text>
                  <Text>{modelCard.likes.toLocaleString()}</Text>
                </Box>
                <Box>
                  <Text color="gray">Downloads:  </Text>
                  <Text>{modelCard.downloads?.toLocaleString() || "—"}</Text>
                </Box>
                <Box>
                  <Text color="gray">Tags:       </Text>
                  <Text>{modelCard.tags.join(", ")}</Text>
                </Box>
                {modelCard.pipelineTag && (
                  <Box>
                    <Text color="gray">Pipeline:   </Text>
                    <Text>{modelCard.pipelineTag}</Text>
                  </Box>
                )}
                <Box>
                  <Text color="gray">Created:    </Text>
                  <Text>{formatDate(modelCard.createdAt)}</Text>
                </Box>
                <Box>
                  <Text color="gray">Modified:   </Text>
                  <Text>{formatDate(modelCard.lastModified)}</Text>
                </Box>
              </Box>
            ) : (
              <Box>
                <Text color="gray">Failed to load model card.</Text>
              </Box>
            )}
          </Box>

          {message && (
            <Box marginTop={1}>
              <Text color="green">{` › ${message}`}</Text>
            </Box>
          )}
        </Box>
      );
    }

    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box flexDirection="column" borderStyle="single" borderColor="gray">
          <Box flexDirection="row" justifyContent="space-between">
            <Box>
              <Text bold>Browse HuggingFace</Text>
              <Text> {" │ "} </Text>
              <Text color="gray">{browseResults.length} results</Text>
            </Box>
            <Box>
              <Text color="gray">j/k navigate │ f filters │ s sort │ m card │ Enter open │ g back</Text>
            </Box>
          </Box>
        </Box>

        {(isFilters || isSort) && (
          <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="gray">
            {isFilters && (
              <Box flexDirection="column">
                <Box>
                  <Text color="gray" bold>Filters:</Text>
                  <Text color="gray"> (h/l navigate │ Enter toggle │ s sort │ g back)</Text>
                </Box>
                <Box flexDirection="row" marginTop={1}>
                  {ALL_FILTERS.map((f, i) => (
                    <FilterButton
                      key={f.label}
                      label={f.label}
                      isActive={filterIndex === i}
                      isOn={browseFilters[i]}
                      onClick={() => toggleFilter(i)}
                    />
                  ))}
                </Box>
              </Box>
            )}
            {isSort && (
              <Box flexDirection="column">
                <Box>
                  <Text color="gray" bold>Sort:</Text>
                  <Text color="gray"> (h/l navigate │ Enter apply │ R reverse │ g back)</Text>
                </Box>
                <Box flexDirection="row" marginTop={1}>
                  {SORT_OPTIONS.map((s, i) => (
                    <SortButton
                      key={s.value}
                      label={s.label}
                      isActive={sortIndex === i}
                      isCurrent={browseSort === i}
                      direction={browseDirection}
                      onClick={() => {
                        setSortIndex(i);
                        setBrowseSort(i);
                        setFocusArea("browse");
                        executeBrowse();
                      }}
                    />
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        )}

        <Box flexDirection="column" flexGrow={1} marginTop={1}>
          {searching ? (
            <Box>
              <Text color="cyan"><Spinner type="line" /></Text>
              <Text> {" "} </Text>
              <Text color="gray">Fetching models...</Text>
            </Box>
          ) : browseResults.length === 0 ? (
            <Box>
              <Text color="gray">No results. Press f for filters or g to go back.</Text>
            </Box>
          ) : (
            browseResults.map((r, i) => (
              <BrowseRepoRow
                key={r.id}
                repo={r}
                isSelected={browseIndex === i}
                onClick={() => {
                  setBrowseIndex(i);
                  openRepoFiles(r.id);
                }}
              />
            ))
          )}
        </Box>

        {downloading && (
          <Box marginTop={1}>
            <Text color="cyan"><Spinner type="line" /></Text>
            <Text> {" "} </Text>
            <Text color="gray">{dlLabel}</Text>
            <Text> {" "} </Text>
            <Text color="gray">({dlProgress}%)</Text>
            <Box>
              <Text color="gray">{"█".repeat(Math.round(dlProgress / 5))}</Text>
              <Text color="gray">{"░".repeat(20 - Math.round(dlProgress / 5))}</Text>
            </Box>
          </Box>
        )}

        {message && (
          <Box marginTop={1}>
            <Text color="green">{` › ${message}`}</Text>
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="column" borderStyle="single" borderColor="gray">
        <Box flexDirection="row" justifyContent="space-between">
          <Box>
            <Text bold>Models</Text>
            <Text> {" │ "} </Text>
            <Text color="gray">{models.length} local</Text>
          </Box>
          <Box>
            <Text color="gray">{formatSize(totalSize)} used</Text>
          </Box>
        </Box>
        <Box>
          <Text color="gray">Dir: </Text>
          <Text color="blue">{config ? getModelsDir(config) : "<unknown>"}</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color="gray" wrap="wrap">
          j/k navigate │ g actions │ h/l action select │ Enter execute │ Ctrl+C cancel
        </Text>
      </Box>

      <Box flexDirection="column" flexGrow={1} marginTop={1}>
        {models.length === 0 ? (
          <Box>
            <Text color="gray">No models downloaded. Press g for actions → Search.</Text>
          </Box>
        ) : (
          models.map((m, i) => (
            <ModelRow
              key={m.path}
              model={m}
              isSelected={focusArea === "list" && selectedIndex === i}
              onClick={() => {
                setSelectedIndex(i);
                setFocusArea("actions");
                setActionIndex(0);
              }}
            />
          ))
        )}
      </Box>

      <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="gray">
        <Box>
          <Text color="gray" bold>Actions:</Text>
        </Box>
      <Box flexDirection="row">
          {actions.map((action, i) => (
            <ActionButton
              key={action}
              action={action}
              isActive={focusArea === "actions" && actionIndex === i}
              onClick={() => {
                setFocusArea("actions");
                setActionIndex(i);
                if (action === "setactive") handleSetActive();
                else if (action === "delete") handleDelete();
                else if (action === "search") {
                  setFocusArea("search");
                  setEditMode(true);
                  setEditValue("");
                } else if (action === "browse") {
                  startBrowse();
                }
              }}
            />
          ))}
        </Box>
      </Box>

      {editMode && (
        <Box marginTop={1}>
          <Text color="yellow" bold>Search HF: </Text>
          <TextInput value={editValue} onChange={setEditValue} focus />
        </Box>
      )}

      {downloading && (
        <Box marginTop={1}>
          <Text color="cyan"><Spinner type="line" /></Text>
          <Text> {" "} </Text>
          <Text color="gray">{dlLabel}</Text>
          <Text> {" "} </Text>
          <Text color="gray">({dlProgress}%)</Text>
          <Box>
            <Text color="gray">{"█".repeat(Math.round(dlProgress / 5))}</Text>
            <Text color="gray">{"░".repeat(20 - Math.round(dlProgress / 5))}</Text>
          </Box>
        </Box>
      )}

      {message && (
        <Box marginTop={1}>
          <Text color="green">{` › ${message}`}</Text>
        </Box>
      )}
    </Box>
  );
}
