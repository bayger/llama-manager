export interface HFRepoInfo {
  id: string;
  tags: string[];
  likes: number;
  lastModified: string;
  private: boolean;
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
  return data.filter((r: HFRepoInfo) => !r.private);
}

export async function listFiles(repoId: string, token?: string): Promise<HFFileInfo[]> {
  const res = await fetch(`https://huggingface.co/api/models/${repoId}/tree/main`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) throw new Error(`HF files list failed: ${res.status}`);
  const data = await res.json();
  return data.filter((f: HFFileInfo) => f.rfpath.endsWith(".gguf"));
}

export function getDownloadUrl(repoId: string, filename: string): string {
  return `https://huggingface.co/${repoId}/resolve/main/${filename}`;
}
