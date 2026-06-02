import fs from "fs-extra";
import path from "path";
import { getModelsDir } from "./config.js";
import { ConfigData } from "./config.js";

export interface LocalModel {
  repoId: string;
  filename: string;
  path: string;
  sizeBytes: number;
  downloadedAt: string;
  active: boolean;
}

export async function listLocalModels(config: ConfigData): Promise<LocalModel[]> {
  const dir = getModelsDir(config);
  if (!(await fs.pathExists(dir))) return [];

  const models: LocalModel[] = [];
  await scanDir(dir, dir, [], models, config.activeModel);
  return models;
}

async function scanDir(
  baseDir: string,
  currentDir: string,
  repoParts: string[],
  results: LocalModel[],
  activeModel: string | null,
) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      await scanDir(baseDir, fullPath, [...repoParts, entry.name], results, activeModel);
    } else if (entry.name.endsWith(".gguf")) {
      const repoId = repoParts.join("/");
      const stat = await fs.stat(fullPath);
      results.push({
        repoId,
        filename: entry.name,
        path: fullPath,
        sizeBytes: stat.size,
        downloadedAt: stat.mtime.toISOString(),
        active:
          activeModel === `${repoId}/${entry.name}` ||
          activeModel === fullPath,
      });
    }
  }
}

export async function deleteModel(modelPath: string): Promise<void> {
  await fs.remove(modelPath);
  const parent = path.dirname(modelPath);
  const remaining = await fs.readdir(parent).catch(() => []);
  if (remaining.length === 0) {
    await fs.remove(parent);
  }
}

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
