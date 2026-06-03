export interface HFRepoInfo {
  id: string;
  tags: string[];
  likes: number;
  downloads?: number;
  lastModified: string;
  private: boolean;
  disabled?: boolean;
  ggufCount?: number;
}

export interface HFFileInfo {
  rfpath: string;
  size: number;
  type: string;
}

export async function searchRepos(
  query: string,
  token?: string,
): Promise<HFRepoInfo[]> {
  const params = new URLSearchParams({
    search: query,
    filter: "gguf",
    sort: "likes",
    direction: "-1",
    limit: "20",
  });

  const res = await fetch(`https://huggingface.co/api/repos-search?${params}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) throw new Error(`HF search failed: ${res.status}`);
  const data = await res.json();
  return data
    .filter((r: HFRepoInfo) => !r.private)
    .map((r: HFRepoInfo) => ({
      ...r,
      ggufCount: r.tags?.includes("gguf") ? undefined : undefined,
    }));
}

export async function listFiles(repoId: string, token?: string): Promise<HFFileInfo[]> {
  const res = await fetch(`https://huggingface.co/api/models/${repoId}/tree/main`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error("Authentication required. Set HF token in config.");
    if (res.status === 404) throw new Error(`Repo not found: ${repoId}`);
    throw new Error(`HF files list failed: ${res.status}`);
  }
  const data = await res.json();
  return data.filter((f: HFFileInfo) => f.rfpath.endsWith(".gguf"));
}

export function getDownloadUrl(repoId: string, filename: string): string {
  return `https://huggingface.co/${repoId}/resolve/main/${filename}`;
}

export interface HFModelInfo {
  id: string;
  author: string;
  likes: number;
  downloads: number;
  tags: string[];
  pipelineTag: string | null;
  createdAt: string;
  lastModified: string;
  private: boolean;
  disabled: boolean;
  cardData?: {
    language?: string[];
    license?: string;
    library_name?: string;
  };
}

export interface BrowseOptions {
  sort?: "likes" | "downloads" | "lastModified" | "trending" | "created";
  direction?: 1 | -1;
  search?: string;
  filters?: string[];
  limit?: number;
  offset?: number;
}

const modelInfoCache = new Map<string, HFModelInfo>();

export function clearModelInfoCache(): void {
  modelInfoCache.clear();
}

export async function browseModels(
  options: BrowseOptions,
  token?: string,
): Promise<HFRepoInfo[]> {
  const params = new URLSearchParams({
    filter: "gguf",
    sort: options.sort || "likes",
    direction: String(options.direction || -1),
    limit: String(options.limit || 20),
  });

  if (options.offset) {
    params.set("offset", String(options.offset));
  }

  if (options.search) {
    params.set("search", options.search);
  }

  const filterParts: string[] = [];
  if (options.filters) {
    for (const f of options.filters) {
      if (f) filterParts.push(f);
    }
  }

  if (filterParts.length > 0) {
    params.set("filter", filterParts.join(","));
  }

  const res = await fetch(`https://huggingface.co/api/models?${params}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) throw new Error(`HF browse failed: ${res.status}`);
  const data = await res.json();
  return data.filter((r: HFRepoInfo) => !r.private && !r.disabled);
}

export async function getModelInfo(
  repoId: string,
  token?: string,
): Promise<HFModelInfo> {
  const cached = modelInfoCache.get(repoId);
  if (cached) return cached;

  const res = await fetch(`https://huggingface.co/api/models/${repoId}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error("Authentication required. Set HF token in config.");
    if (res.status === 404) throw new Error(`Repo not found: ${repoId}`);
    throw new Error(`Failed to fetch model info: ${res.status}`);
  }

  const data: HFModelInfo = await res.json();
  modelInfoCache.set(repoId, data);
  return data;
}
