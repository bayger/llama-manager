import fs from "fs-extra";
import path from "path";
import { getVersionsDir } from "./config.js";
import { ConfigData } from "./config.js";

export interface VersionInfo {
  version: string;
  path: string;
  active: boolean;
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
      versions.push({
        version: entry.name,
        path: versionPath,
        active: entry.name === config.activeVersion,
      });
    }
  }

  return versions.sort((a, b) => b.version.localeCompare(a.version));
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
    "https://api.github.com/repos/ggerganov/llama.cpp/releases/latest",
    {
      headers: { "User-Agent": "llama-dashboard" },
    },
  );

  if (!response.ok) throw new Error("Failed to fetch latest version");
  const data = await response.json();
  return data.tag_name;
}
