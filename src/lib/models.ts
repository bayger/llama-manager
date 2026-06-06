import fs from "fs-extra";
import path from "path";
import { getModelsDir } from "./config.js";
import { ConfigData } from "./config.js";
import { getDownloadUrl } from "./hf.js";

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
  return models.sort((a, b) => {
    if (a.active && !b.active) return -1;
    if (!a.active && b.active) return 1;
    return b.downloadedAt.localeCompare(a.downloadedAt);
  });
}

async function scanDir(
  baseDir: string,
  currentDir: string,
  repoParts: string[],
  results: LocalModel[],
  activeModel: string | null,
) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true }).catch(() => []);

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

export async function deleteModel(config: ConfigData, modelPath: string): Promise<ConfigData> {
  await fs.remove(modelPath);
  cleanupEmptyDirs(path.dirname(modelPath));
  const updated = { ...config };
  if (updated.activeModel === modelPath || updated.activeModel === getModelKey(path.dirname(modelPath), modelPath)) {
    updated.activeModel = null;
  }
  return updated;
}

async function cleanupEmptyDirs(dirPath: string): Promise<void> {
  try {
    const entries = await fs.readdir(dirPath).catch(() => []);
    if (entries.length === 0) {
      await fs.remove(dirPath);
      cleanupEmptyDirs(path.dirname(dirPath));
    }
  } catch {
    // ignore
  }
}

function getModelKey(parentDir: string, modelPath: string): string {
  const baseName = path.basename(modelPath);
  const rel = path.relative(parentDir.includes("huggingface") ? parentDir.split("huggingface")[1] : parentDir, modelPath);
  return `${rel}/${baseName}`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export async function getTotalModelsSize(config: ConfigData): Promise<number> {
  const dir = getModelsDir(config);
  if (!(await fs.pathExists(dir))) return 0;
  return await dirSize(dir);
}

async function dirSize(dirPath: string): Promise<number> {
  let total = 0;
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += await dirSize(fullPath);
      } else {
        const stat = await fs.stat(fullPath);
        total += stat.size;
      }
    }
  } catch {
    // ignore permission errors
  }
  return total;
}

export type DownloadProgress = (pct: number, label: string) => void;

export async function downloadModel(
  config: ConfigData,
  repoId: string,
  filename: string,
  fileSize: number,
  onProgress: DownloadProgress,
  token?: string,
): Promise<string> {
  const modelsDir = getModelsDir(config);
  const repoDir = path.join(modelsDir, repoId);
  const modelPath = path.join(repoDir, filename);

  if (await fs.pathExists(modelPath)) {
    throw new Error(`Model already exists: ${filename}`);
  }

  await fs.ensureDir(repoDir);
  const downloadUrl = getDownloadUrl(repoId, filename);

  onProgress(0, "Starting download...");
  const res = await fetch(downloadUrl, {
    headers: {
      "User-Agent": "llama-manager",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error("Authentication required. Set HF token in config.");
    if (res.status === 403) throw new Error(`Gated model. Accept terms at https://huggingface.co/${repoId}`);
    if (res.status === 404) throw new Error(`File not found: ${filename}`);
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }

  const contentLength = parseInt(res.headers.get("content-length") || "0", 10);
  const total = contentLength || fileSize;
  let received = 0;
  let lastUpdate = 0;
  let lastBytes = 0;
  let lastTime = Date.now();

  const tmpPath = modelPath + ".download";
  const writeStream = await fs.createWriteStream(tmpPath);
  const reader = res.body as ReadableStream<Uint8Array>;
  const readerObj = reader.getReader();

  try {
    while (true) {
      const { done, value } = await readerObj.read();
      if (done) break;
      received += value.byteLength;
      writeStream.write(value);

      const now = Date.now();
      if (now - lastUpdate > 500) {
        const elapsed = (now - lastTime) / 1000;
        const deltaBytes = received - lastBytes;
        const speed = deltaBytes / elapsed;
        const remaining = total - received;
        const eta = remaining / speed;

        const pct = total > 0 ? Math.round((received / total) * 100) : 0;
        const speedStr = speed > 1024 * 1024
          ? `${(speed / (1024 * 1024)).toFixed(1)} MB/s`
          : `${(speed / 1024).toFixed(1)} KB/s`;
        const etaStr = eta > 60
          ? `${Math.round(eta / 60)}m ${Math.round(eta % 60)}s`
          : `${Math.round(eta)}s`;

        onProgress(
          pct,
          `${formatSize(received)} / ${formatSize(total)}  ${speedStr}  ETA ${etaStr}`,
        );

        lastUpdate = now;
        lastBytes = received;
        lastTime = now;
      }
    }
  } catch (err) {
    writeStream.end();
    await fs.remove(tmpPath).catch(() => {});
    throw err;
  }

  writeStream.end();

  await new Promise<void>((resolve, reject) => {
    writeStream.on("finish", () => resolve());
    writeStream.on("error", reject);
  });

  await fs.move(tmpPath, modelPath);
  onProgress(100, `Downloaded ${formatSize(received)}`);
  return modelPath;
}

export async function setActiveModel(config: ConfigData, repoId: string, filename: string): Promise<ConfigData> {
  const updated = { ...config };
  updated.activeModel = `${repoId}/${filename}`;
  return updated;
}
