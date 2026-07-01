import { saveConfig } from "./config";
import type { ConfigData } from "./config";

export const APP_REPO = "bayger/llama-manager";
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const RELEASES_URL = `https://github.com/${APP_REPO}/releases/latest`;

export interface UpdateResult {
  latestVersion: string;
  isAvailable: boolean;
  releaseUrl: string;
}

export async function checkLatestAppVersion(): Promise<string> {
  const response = await fetch(
    `https://api.github.com/repos/${APP_REPO}/releases/latest`,
    { headers: { "User-Agent": "llama-manager" } },
  );
  if (!response.ok) throw new Error(`GitHub API ${response.status}`);
  const data = await response.json();
  const tag = data.tag_name as string;
  return tag.startsWith("v") ? tag.slice(1) : tag;
}

export function isUpdateAvailable(current: string, latest: string): boolean {
  const a = current.split(".").map(Number);
  const b = latest.split(".").map(Number);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (bv > av) return true;
    if (bv < av) return false;
  }
  return false;
}

export function shouldCheckNow(lastCheckedAt: number | null): boolean {
  if (lastCheckedAt == null) return true;
  return Date.now() - lastCheckedAt >= CHECK_INTERVAL_MS;
}

export async function checkForUpdate(config: ConfigData, currentVersion: string, force = false): Promise<UpdateResult | null> {
  try {
    if (!force && !shouldCheckNow(config.updates.lastCheckedAt)) {
      if (config.updates.latestVersion && isUpdateAvailable(currentVersion, config.updates.latestVersion)) {
        return {
          latestVersion: config.updates.latestVersion,
          isAvailable: true,
          releaseUrl: RELEASES_URL,
        };
      }
      return null;
    }

    const latest = await checkLatestAppVersion();
    const available = isUpdateAvailable(currentVersion, latest);

    config.updates.lastCheckedAt = Date.now();
    config.updates.latestVersion = latest;
    await saveConfig(config);

    return {
      latestVersion: latest,
      isAvailable: available,
      releaseUrl: RELEASES_URL,
    };
  } catch {
    return null;
  }
}
