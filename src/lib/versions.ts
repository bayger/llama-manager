import fs from "fs-extra";
import path from "path";
import os from "os";
import { getVersionsDir } from "./config.js";
import { ConfigData } from "./config.js";

export const BACKEND_LABELS: Record<string, string> = {
  cpu: "CPU",
  metal: "Metal",
  cuda12: "CUDA 12",
  cuda13: "CUDA 13",
  vulkan: "Vulkan",
  rocm: "ROCm",
  openvino: "OpenVINO",
  opencl: "OpenCL",
  hip: "HIP/Radeon",
};

export interface VersionInfo {
  version: string;
  tag: string;
  backend: string;
  path: string;
  active: boolean;
}

export interface RemoteVersion {
  tag: string;
  name: string;
  publishedAt: string;
  assets: Array<{ name: string; size: number }>;
}

export interface AvailableBackend {
  id: string;
  label: string;
  assetName: string;
}

const GITHUB_REPO = "ggml-org/llama.cpp";

export async function listRecentVersions(limit = 20): Promise<RemoteVersion[]> {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=${limit}`,
    {
      headers: { "User-Agent": "llama-dashboard" },
    },
  );

  if (!response.ok) throw new Error(`Failed to fetch releases: ${response.status}`);
  const data = await response.json();
  return data.map((r: any) => ({
    tag: r.tag_name,
    name: r.name || r.tag_name,
    publishedAt: r.published_at,
    assets: (r.assets || []).map((a: any) => ({ name: a.name, size: a.size })),
  }));
}

export type InstallProgress = (pct: number, label: string) => void;

function parseFolderName(name: string): { tag: string; backend: string } {
  const match = name.match(/^(b\d+)(-.+)?$/);
  if (match) {
    return { tag: match[1], backend: match[2] ? match[2].slice(1) : "cpu" };
  }
  return { tag: name, backend: "cpu" };
}

function getBackendLabel(backend: string): string {
  if (BACKEND_LABELS[backend]) return BACKEND_LABELS[backend];
  const base = Object.keys(BACKEND_LABELS).find((k) => backend.startsWith(k));
  if (base) {
    const suffix = backend.slice(base.length);
    return BACKEND_LABELS[base] + (suffix ? ` ${suffix}` : "");
  }
  return backend;
}

export async function listVersions(config: ConfigData): Promise<VersionInfo[]> {
  const dir = getVersionsDir(config);
  if (!(await fs.pathExists(dir))) return [];

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const versions: VersionInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const versionPath = path.join(dir, entry.name);
    const binary = path.join(versionPath, "llama-server");
    if (await fs.pathExists(binary)) {
      const { tag, backend } = parseFolderName(entry.name);
      versions.push({
        version: entry.name,
        tag,
        backend,
        path: versionPath,
        active: entry.name === config.activeVersion,
      });
    }
  }

  return versions.sort((a, b) => {
    const tagCmp = b.tag.localeCompare(a.tag);
    if (tagCmp !== 0) return tagCmp;
    return a.backend.localeCompare(b.backend);
  });
}

export async function switchVersion(config: ConfigData, version: string): Promise<ConfigData> {
  const dir = getVersionsDir(config);
  const versionPath = path.join(dir, version);
  const binary = path.join(versionPath, "llama-server");

  if (!(await fs.pathExists(binary))) {
    throw new Error(`Version not found: ${version}`);
  }

  config.activeVersion = version;
  return config;
}

export async function uninstallVersion(config: ConfigData, version: string): Promise<void> {
  if (version === config.activeVersion) {
    throw new Error("Cannot uninstall active version");
  }

  const dir = getVersionsDir(config);
  const versionPath = path.join(dir, version);
  await fs.remove(versionPath);
}

export async function checkLatestVersion(): Promise<string> {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
    {
      headers: { "User-Agent": "llama-dashboard" },
    },
  );

  if (!response.ok) throw new Error("Failed to fetch latest version");
  const data = await response.json();
  return data.tag_name;
}

export function getPlatformKey(): string {
  const platform = os.platform();
  const arch = os.arch();
  if (platform === "linux" && arch === "x64") return "ubuntu-x64";
  if (platform === "linux" && arch === "arm64") return "ubuntu-arm64";
  if (platform === "darwin" && arch === "x64") return "macos-x64";
  if (platform === "darwin" && arch === "arm64") return "macos-arm64";
  throw new Error(`Unsupported platform: ${platform}-${arch}`);
}

function extractBackendFromAsset(assetName: string, version: string, platform: string): string | null {
  const ext = assetName.endsWith(".tar.gz") ? ".tar.gz" : assetName.endsWith(".zip") ? ".zip" : null;
  if (!ext) return null;

  const base = assetName.slice(0, assetName.length - ext.length);
  const prefix = `llama-${version}-bin-${platform}`;
  const suffix = `-${getArch(platform)}`;

  if (!base.startsWith(prefix) || !base.endsWith(suffix)) return null;

  const between = base.slice(prefix.length, base.length - suffix.length);
  if (!between || between === "") return "cpu";

  const parts = between.slice(1).split("-");
  const key = parts[0].toLowerCase();
  const known = ["cuda", "vulkan", "rocm", "openvino", "opencl", "hip", "adreno"];
  if (!known.includes(key)) return null;

  const versionPart = parts.slice(1).join(".").replace(/[^0-9]/g, "");
  return versionPart ? `${key}${versionPart}` : key;
}

function getArch(platform: string): string {
  return platform.split("-").pop() || "x64";
}

export function getAvailableBackends(
  version: string,
  platform: string,
  assets: Array<{ name: string }>,
): AvailableBackend[] {
  const backends: AvailableBackend[] = [];
  const seen = new Set<string>();

  for (const asset of assets) {
    const nameLower = asset.name.toLowerCase();
    if (!nameLower.includes(`bin-${platform.toLowerCase()}`)) continue;

    const backend = extractBackendFromAsset(asset.name, version, platform);
    if (!backend || seen.has(backend)) continue;
    seen.add(backend);

    backends.push({
      id: backend,
      label: getBackendLabel(backend),
      assetName: asset.name,
    });
  }

  return backends.sort((a, b) => {
    if (a.id === "cpu") return -1;
    if (b.id === "cpu") return 1;
    if (a.id === "metal") return -1;
    if (b.id === "metal") return 1;
    return a.id.localeCompare(b.id);
  });
}

function resolveAssetName(
  version: string,
  platform: string,
  backend: string,
  assets: Array<{ name: string; browser_download_url?: string }>,
): { name: string; url: string } | null {
  for (const asset of assets) {
    const detected = extractBackendFromAsset(asset.name, version, platform);
    if (detected === backend && asset.browser_download_url) {
      return { name: asset.name, url: asset.browser_download_url };
    }
  }
  return null;
}

function getFolderName(tag: string, backend: string): string {
  if (backend === "cpu" || backend === "metal") return tag;
  return `${tag}-${backend}`;
}

export async function installVersion(
  config: ConfigData,
  version: string,
  backend: string,
  onProgress: InstallProgress,
): Promise<string> {
  const dir = getVersionsDir(config);
  const folderName = getFolderName(version, backend);
  const versionPath = path.join(dir, folderName);

  if (await fs.pathExists(versionPath)) {
    throw new Error(`Version already installed: ${folderName}`);
  }

  const platform = getPlatformKey();

  onProgress(0, "Downloading release info...");
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${version}`,
    {
      headers: { "User-Agent": "llama-dashboard" },
    },
  );

  if (!res.ok) {
    if (res.status === 404) throw new Error(`Version not found: ${version}`);
    throw new Error(`Failed to fetch release: ${res.status}`);
  }

  const releaseData = await res.json();
  const assets = releaseData.assets || [];
  const assetInfo = resolveAssetName(version, platform, backend, assets);

  if (!assetInfo) {
    const available = getAvailableBackends(version, platform, assets.map((a: any) => ({ name: a.name })));
    throw new Error(`Backend "${backend}" not available. Available: ${available.map((b) => b.label).join(", ")}`);
  }

  const { name: assetName, url: downloadUrl } = assetInfo;

  onProgress(5, `Downloading ${assetName}...`);
  const dlRes = await fetch(downloadUrl);
  if (!dlRes.ok) throw new Error(`Download failed: ${dlRes.status}`);

  const total = parseInt(dlRes.headers.get("content-length") || "0", 10);
  let received = 0;

  await fs.ensureDir(versionPath);
  const tmpPath = path.join(versionPath, assetName);
  const writeStream = await fs.createWriteStream(tmpPath);

  const reader = dlRes.body as ReadableStream<Uint8Array>;
  const readerObj = reader.getReader();

  while (true) {
    const { done, value } = await readerObj.read();
    if (done) break;
    received += value.byteLength;
    const pct = Math.round((received / total) * 90);
    onProgress(pct, `Downloading: ${(received / 1024 / 1024).toFixed(1)} MB / ${(total / 1024 / 1024).toFixed(1)} MB`);
    writeStream.write(value);
  }
  writeStream.end();

  await new Promise<void>((resolve, reject) => {
    writeStream.on("finish", () => resolve());
    writeStream.on("error", reject);
  });

  onProgress(92, `Extracting...`);

  if (assetName.endsWith(".zip")) {
    const { execSync } = await import("child_process");
    try {
      execSync(`unzip -o -q "${tmpPath}" -d "${versionPath}"`, { stdio: "pipe" });
    } catch (err: any) {
      await fs.remove(tmpPath);
      throw new Error(`Extraction failed: ${err.message}`);
    }
  } else if (assetName.endsWith(".tar.gz") || assetName.endsWith(".tgz")) {
    const { execSync } = await import("child_process");
    try {
      execSync(`tar xzf "${tmpPath}" -C "${versionPath}"`, { stdio: "pipe" });
    } catch (err: any) {
      await fs.remove(tmpPath);
      throw new Error(`Extraction failed: ${err.message}`);
    }
  } else {
    const binaryName = path.basename(assetName).replace(/\.(zip|tar\.gz|tgz)$/, "");
    await fs.move(tmpPath, path.join(versionPath, binaryName));
  }

  await fs.remove(tmpPath);

  const subdirs = await fs.readdir(versionPath, { withFileTypes: true });
  const topDir = subdirs.find((e) => e.isDirectory() && e.name.startsWith("llama-"));
  if (topDir && (await fs.readdir(versionPath)).length === 1) {
    const srcPath = path.join(versionPath, topDir.name);
    const entries = await fs.readdir(srcPath, { withFileTypes: true });
    for (const entry of entries) {
      await fs.move(path.join(srcPath, entry.name), path.join(versionPath, entry.name), { overwrite: true });
    }
    await fs.remove(srcPath);
  }

  const binary = path.join(versionPath, "llama-server");
  if (await fs.pathExists(binary)) {
    await fs.chmod(binary, "755");
  }

  onProgress(100, `Installed ${folderName}`);
  return folderName;
}

export async function getTotalVersionsSize(config: ConfigData): Promise<number> {
  const dir = getVersionsDir(config);
  if (!(await fs.pathExists(dir))) return 0;

  let total = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const size = await dirSize(path.join(dir, entry.name));
      total += size;
    }
  }
  return total;
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
