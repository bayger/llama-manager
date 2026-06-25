export interface HFRepoInfo {
  id: string;
  tags: string[];
  likes: number;
  downloads?: number;
  lastModified: string;
  private: boolean;
  disabled?: boolean;
  ggufCount?: number;
  pipeline_tag?: string;
  library_name?: string;
  createdAt?: string;
}

export interface HFFileInfo {
  path: string;
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
    if (res.status === 403) throw new Error(`Gated repo. Accept terms at https://huggingface.co/${repoId}`);
    if (res.status === 404) throw new Error(`Repo not found: ${repoId}`);
    throw new Error(`HF files list failed: ${res.status}`);
  }
  const data = await res.json();
  return data
    .map((entry: any) => ({ path: entry.path, rfpath: entry.path, size: entry.size, type: entry.type }))
    .filter((f: HFFileInfo) => f.rfpath.endsWith(".gguf"));
}

export function getDownloadUrl(repoId: string, filename: string): string {
  return `https://huggingface.co/${repoId}/resolve/main/${filename}`;
}

export interface BrowseOptions {
  sort?: "likes" | "downloads" | "lastModified" | "trending" | "created";
  direction?: 1 | -1;
  search?: string;
  filters?: string[];
  limit?: number;
}

export async function browseModels(
  options: BrowseOptions,
  token?: string,
): Promise<HFRepoInfo[]> {
  const params = new URLSearchParams({
    sort: options.sort || "likes",
    direction: String(options.direction || -1),
    limit: String(options.limit || 20),
  });

  params.set("library_name", "gguf");

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
