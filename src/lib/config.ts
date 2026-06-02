import fs from "fs-extra";
import path from "path";
import os from "os";

const CONFIG_DIR =
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config", "llama-dashboard");
const DATA_DIR =
  process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share", "llama-dashboard");
const STATE_DIR =
  process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state", "llama-dashboard");
const HF_HOME = process.env.HF_HOME || path.join(os.homedir(), ".cache", "huggingface");

const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

export interface ServerPresets {
  server: Record<string, unknown>;
  model: Record<string, unknown>;
  compute: Record<string, unknown>;
  gpu: Record<string, unknown>;
  sampling: Record<string, unknown>;
  speculative: Record<string, unknown>;
  reasoning: Record<string, unknown>;
  logging: Record<string, unknown>;
}

export interface ConfigData {
  versionsDir: string | null;
  modelsDir: string | null;
  tasksFile: string | null;
  activeVersion: string | null;
  activeModel: string | null;
  hfToken: string | null;
  server: {
    logFile: string | null;
    freeFormArgs: string[];
    presets: ServerPresets;
  };
  dashboard: {
    pollIntervalMs: number;
    killServerOnExit: boolean;
  };
  tasks: {
    maxStored: number;
    autoParse: boolean;
  };
}

const DEFAULT_PRESETS: ServerPresets = {
  server: {
    host: "127.0.0.1",
    port: 8080,
    parallel: -1,
    timeout: 600,
    apiKey: null,
    threadsHttp: -1,
    contBatching: true,
    cachePrompt: true,
    metrics: false,
    ui: true,
    embedding: false,
    rerank: false,
  },
  model: {
    model: null,
    lora: null,
    hfRepo: null,
    hfToken: null,
    chatTemplate: null,
    jinja: true,
  },
  compute: {
    threads: -1,
    threadsBatch: null,
    ctxSize: 0,
    batchSize: 2048,
    ubatchSize: 512,
    flashAttn: "auto",
    mlock: false,
    mmap: true,
    cacheTypeK: "f16",
    cacheTypeV: "f16",
  },
  gpu: {
    gpuLayers: "auto",
    splitMode: "layer",
    tensorSplit: null,
    mainGpu: 0,
    device: null,
    fit: "on",
  },
  sampling: {
    seed: -1,
    temperature: 0.8,
    topK: 40,
    topP: 0.95,
    minP: 0.05,
    repeatLastN: 64,
    repeatPenalty: 1.0,
    presencePenalty: 0.0,
    frequencyPenalty: 0.0,
    grammar: null,
    jsonSchema: null,
    ignoreEos: false,
  },
  speculative: {
    draftModel: null,
    specType: "none",
    draftNMax: 3,
    draftThreads: null,
    draftGpuLayers: "auto",
  },
  reasoning: {
    reasoning: "auto",
    reasoningBudget: -1,
    reasoningFormat: "auto",
  },
  logging: {
    logFile: null,
    logVerbosity: 3,
    logColors: "auto",
    logTimestamps: true,
  },
};

const DEFAULT_CONFIG: ConfigData = {
  versionsDir: null,
  modelsDir: null,
  tasksFile: null,
  activeVersion: null,
  activeModel: null,
  hfToken: null,
  server: {
    logFile: null,
    freeFormArgs: [],
    presets: DEFAULT_PRESETS,
  },
  dashboard: {
    pollIntervalMs: 2000,
    killServerOnExit: false,
  },
  tasks: {
    maxStored: 10000,
    autoParse: true,
  },
};

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function getVersionsDir(config: ConfigData): string {
  if (config.versionsDir) return config.versionsDir;
  return path.join(DATA_DIR, "versions");
}

export function getModelsDir(config: ConfigData): string {
  if (config.modelsDir) return config.modelsDir;
  return path.join(HF_HOME, "llama-dashboard");
}

export function getTasksFile(config: ConfigData): string {
  if (config.tasksFile) return config.tasksFile;
  return path.join(DATA_DIR, "tasks.jsonl");
}

export function getLogFile(config: ConfigData): string {
  if (config.server.logFile) return config.server.logFile;
  return path.join(STATE_DIR, "server.log");
}

export async function loadConfig(): Promise<ConfigData> {
  try {
    const data = await fs.readJson(CONFIG_PATH, { throws: false });
    if (!data) return DEFAULT_CONFIG;

    const merged: ConfigData = {
      ...DEFAULT_CONFIG,
      ...data,
      server: {
        ...DEFAULT_CONFIG.server,
        ...data.server,
        presets: {
          ...DEFAULT_PRESETS,
          ...(data.server?.presets || {}),
        },
      },
      dashboard: {
        ...DEFAULT_CONFIG.dashboard,
        ...(data.dashboard || {}),
      },
      tasks: {
        ...DEFAULT_CONFIG.tasks,
        ...(data.tasks || {}),
      },
    };
    return merged;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(config: ConfigData): Promise<void> {
  await fs.ensureDir(CONFIG_DIR);
  await fs.writeJson(CONFIG_PATH, config, { spaces: 2 });
}
