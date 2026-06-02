import { ConfigData } from "./config.js";

function getBaseUrl(config: ConfigData): string {
  const host = config.server.presets.server.host || "127.0.0.1";
  const port = config.server.presets.server.port || 8080;
  return `http://${host}:${port}`;
}

export async function checkServerHealth(config: ConfigData): Promise<boolean> {
  try {
    const res = await fetch(`${getBaseUrl(config)}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function getServerStats(config: ConfigData): Promise<unknown> {
  const res = await fetch(`${getBaseUrl(config)}/stats`);
  if (!res.ok) throw new Error(`Stats request failed: ${res.status}`);
  return res.json();
}

export async function getSlots(config: ConfigData): Promise<unknown> {
  const res = await fetch(`${getBaseUrl(config)}/slots`);
  if (!res.ok) throw new Error(`Slots request failed: ${res.status}`);
  return res.json();
}
