import { ConfigData, getActivePresets } from "./config.js";

function getBaseUrl(config: ConfigData): string {
  const p = getActivePresets(config);
  const host = p.server.host || "127.0.0.1";
  const port = p.server.port || 8080;
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

export interface MetricsData {
  promptTokensTotal: number;
  promptSecondsTotal: number;
  tokensPredictedTotal: number;
  tokensPredictedSecondsTotal: number;
  nDecodeTotal: number;
  nTokensMax: number;
  promptTokensPerSec: number;
  predictedTokensPerSec: number;
  requestsProcessing: number;
  requestsDeferred: number;
  nBusySlotsPerDecode: number;
}

function parsePrometheusGauge(lines: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  let currentKey = "";
  for (const line of lines) {
    if (line.startsWith("# HELP")) continue;
    if (line.startsWith("# TYPE")) continue;
    const match = line.match(/^(\S+)\s+([\d.eE+-]+)$/);
    if (match) {
      result[match[1]] = parseFloat(match[2]);
    }
  }
  return result;
}

export async function getServerMetrics(config: ConfigData): Promise<MetricsData> {
  const res = await fetch(`${getBaseUrl(config)}/metrics`);
  if (!res.ok) throw new Error(`Metrics request failed: ${res.status}`);
  const text = await res.text();
  const lines = text.split("\n");
  const gauges = parsePrometheusGauge(lines);
  return {
    promptTokensTotal: gauges["llamacpp:prompt_tokens_total"] || 0,
    promptSecondsTotal: gauges["llamacpp:prompt_seconds_total"] || 0,
    tokensPredictedTotal: gauges["llamacpp:tokens_predicted_total"] || 0,
    tokensPredictedSecondsTotal: gauges["llamacpp:tokens_predicted_seconds_total"] || 0,
    nDecodeTotal: gauges["llamacpp:n_decode_total"] || 0,
    nTokensMax: gauges["llamacpp:n_tokens_max"] || 0,
    promptTokensPerSec: gauges["llamacpp:prompt_tokens_seconds"] || 0,
    predictedTokensPerSec: gauges["llamacpp:predicted_tokens_seconds"] || 0,
    requestsProcessing: gauges["llamacpp:requests_processing"] || 0,
    requestsDeferred: gauges["llamacpp:requests_deferred"] || 0,
    nBusySlotsPerDecode: gauges["llamacpp:n_busy_slots_per_decode"] || 0,
  };
}
