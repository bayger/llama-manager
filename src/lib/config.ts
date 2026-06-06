import fs from "fs-extra";
import path from "path";
import os from "os";

const CONFIG_DIR =
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config", "llama-manager");
const DATA_DIR =
  process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share", "llama-manager");
const STATE_DIR =
  process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state", "llama-manager");
const HF_HOME = process.env.HF_HOME || path.join(os.homedir(), ".cache", "huggingface");

const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

export type PresetFieldType = "string" | "number" | "boolean" | "enum";

export interface PresetFieldDef {
  key: string;
  flag: string;
  type: PresetFieldType;
  default: unknown;
  options?: string[];
  description: string;
}

export interface PresetCategory {
  name: string;
  presetKey: keyof ServerPresets;
  fields: PresetFieldDef[];
}

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

export interface ServerProfile {
  presets: ServerPresets;
  freeFormArgs: string[];
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
    profiles: Record<string, ServerProfile>;
    activeProfile: string;
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

export const PRESET_CATEGORIES: PresetCategory[] = [
  {
    name: "Server",
    presetKey: "server",
    fields: [
      { key: "host", flag: "--host", type: "string", default: "127.0.0.1", description: "Bind address" },
      { key: "port", flag: "--port", type: "number", default: 8080, description: "HTTP port" },
      { key: "parallel", flag: "--parallel", type: "number", default: -1, description: "Server slots (-1=auto)" },
      { key: "timeout", flag: "--timeout", type: "number", default: 600, description: "Read/write timeout (s)" },
      { key: "apiKey", flag: "--api-key", type: "string", default: null, description: "API key" },
      { key: "threadsHttp", flag: "--threads-http", type: "number", default: -1, description: "HTTP worker threads" },
      { key: "contBatching", flag: "--cont-batching", type: "boolean", default: true, description: "Continuous batching" },
      { key: "cachePrompt", flag: "--cache-prompt", type: "boolean", default: true, description: "Prompt caching" },
      { key: "metrics", flag: "--metrics", type: "boolean", default: false, description: "Prometheus metrics" },
      { key: "ui", flag: "--ui", type: "boolean", default: true, description: "Built-in Web UI" },
      { key: "embedding", flag: "--embedding", type: "boolean", default: false, description: "Embeddings mode" },
      { key: "rerank", flag: "--rerank", type: "boolean", default: false, description: "Reranking endpoint" },
    ],
  },
  {
    name: "Model",
    presetKey: "model",
    fields: [
      { key: "model", flag: "--model", type: "string", default: null, description: "GGUF model path" },
      { key: "lora", flag: "--lora", type: "string", default: null, description: "LoRA adapter path" },
  { key: "hfRepo", flag: "--hf-repo", type: "string", default: null, description: "HF repo (user/model[:quant])" },
       { key: "chatTemplate", flag: "--chat-template", type: "string", default: null, description: "Chat template name" },
      { key: "jinja", flag: "--jinja", type: "boolean", default: true, description: "Jinja template engine" },
    ],
  },
  {
    name: "Compute",
    presetKey: "compute",
    fields: [
      { key: "threads", flag: "--threads", type: "number", default: -1, description: "CPU threads" },
      { key: "threadsBatch", flag: "--threads-batch", type: "number", default: null, description: "Batch threads" },
      { key: "ctxSize", flag: "--ctx-size", type: "number", default: 0, description: "Context size (0=model)" },
      { key: "batchSize", flag: "--batch-size", type: "number", default: 2048, description: "Max batch size" },
      { key: "ubatchSize", flag: "--ubatch-size", type: "number", default: 512, description: "Physical batch size" },
      { key: "flashAttn", flag: "--flash-attn", type: "enum", default: "auto", options: ["on", "off", "auto"], description: "Flash Attention" },
      { key: "mlock", flag: "--mlock", type: "boolean", default: false, description: "Lock model in RAM" },
      { key: "mmap", flag: "--mmap", type: "boolean", default: true, description: "Memory-map model" },
      { key: "cacheTypeK", flag: "--cache-type-k", type: "enum", default: "f16", options: ["f32", "f16", "q8_0", "q4_0"], description: "KV cache K type" },
      { key: "cacheTypeV", flag: "--cache-type-v", type: "enum", default: "f16", options: ["f32", "f16", "q8_0", "q4_0"], description: "KV cache V type" },
    ],
  },
  {
    name: "GPU",
    presetKey: "gpu",
    fields: [
      { key: "gpuLayers", flag: "--gpu-layers", type: "string", default: "auto", description: "VRAM layers (auto/number)" },
      { key: "splitMode", flag: "--split-mode", type: "enum", default: "layer", options: ["none", "layer", "row", "tensor"], description: "Multi-GPU split" },
      { key: "tensorSplit", flag: "--tensor-split", type: "string", default: null, description: "GPU proportions (3,1)" },
      { key: "mainGpu", flag: "--main-gpu", type: "number", default: 0, description: "Primary GPU index" },
      { key: "device", flag: "--device", type: "string", default: null, description: "Device list" },
      { key: "fit", flag: "--fit", type: "enum", default: "on", options: ["on", "off"], description: "Auto-fit to VRAM" },
    ],
  },
  {
    name: "Sampling",
    presetKey: "sampling",
    fields: [
      { key: "seed", flag: "--seed", type: "number", default: -1, description: "RNG seed (-1=random)" },
      { key: "temperature", flag: "--temperature", type: "number", default: 0.8, description: "Temperature" },
      { key: "topK", flag: "--top-k", type: "number", default: 40, description: "Top-k (0=off)" },
      { key: "topP", flag: "--top-p", type: "number", default: 0.95, description: "Top-p (1.0=off)" },
      { key: "minP", flag: "--min-p", type: "number", default: 0.05, description: "Min-p (0.0=off)" },
      { key: "repeatLastN", flag: "--repeat-last-n", type: "number", default: 64, description: "Penalty window" },
      { key: "repeatPenalty", flag: "--repeat-penalty", type: "number", default: 1.0, description: "Repeat penalty" },
      { key: "presencePenalty", flag: "--presence-penalty", type: "number", default: 0.0, description: "Presence penalty" },
      { key: "frequencyPenalty", flag: "--frequency-penalty", type: "number", default: 0.0, description: "Frequency penalty" },
      { key: "grammar", flag: "--grammar", type: "string", default: null, description: "BNF grammar" },
      { key: "jsonSchema", flag: "--json-schema", type: "string", default: null, description: "JSON schema" },
      { key: "ignoreEos", flag: "--ignore-eos", type: "boolean", default: false, description: "Ignore EOS token" },
    ],
  },
  {
    name: "Speculative",
    presetKey: "speculative",
    fields: [
      { key: "draftModel", flag: "--spec-draft-model", type: "string", default: null, description: "Draft model path" },
      { key: "specType", flag: "--spec-type", type: "string", default: "none", description: "Spec type" },
      { key: "draftNMax", flag: "--spec-draft-n-max", type: "number", default: 3, description: "Max draft tokens" },
      { key: "draftThreads", flag: "--spec-draft-threads", type: "number", default: null, description: "Draft threads" },
      { key: "draftGpuLayers", flag: "--spec-draft-gpu-layers", type: "string", default: "auto", description: "Draft GPU layers" },
    ],
  },
  {
    name: "Reasoning",
    presetKey: "reasoning",
    fields: [
      { key: "reasoning", flag: "--reasoning", type: "enum", default: "auto", options: ["on", "off", "auto"], description: "Thinking mode" },
      { key: "reasoningBudget", flag: "--reasoning-budget", type: "number", default: -1, description: "Thinking token budget" },
      { key: "reasoningFormat", flag: "--reasoning-format", type: "enum", default: "auto", options: ["none", "deepseek", "deepseek-legacy", "auto"], description: "Format" },
    ],
  },
  {
    name: "Logging",
    presetKey: "logging",
    fields: [
      { key: "logVerbosity", flag: "--log-verbosity", type: "number", default: 3, description: "Verbosity (0-5)" },
      { key: "logColors", flag: "--log-colors", type: "enum", default: "auto", options: ["on", "off", "auto"], description: "Colored logs" },
      { key: "logTimestamps", flag: "--log-timestamps", type: "boolean", default: true, description: "Include timestamps" },
    ],
  },
];

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
    profiles: {
      Default: {
        presets: DEFAULT_PRESETS,
        freeFormArgs: [],
      },
    },
    activeProfile: "Default",
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
  return path.join(HF_HOME, "llama-manager");
}

export function getTasksFile(config: ConfigData): string {
  if (config.tasksFile) return config.tasksFile;
  return path.join(DATA_DIR, "tasks.jsonl");
}

export function getLogFile(config: ConfigData): string {
  if (config.server.logFile) return config.server.logFile;
  return path.join(STATE_DIR, "server.log");
}

export function getActivePresets(config: ConfigData): ServerPresets {
  return config.server.profiles[config.server.activeProfile]?.presets || DEFAULT_PRESETS;
}

export function getActiveFreeFormArgs(config: ConfigData): string[] {
  return config.server.profiles[config.server.activeProfile]?.freeFormArgs || [];
}

function mergePresets(partial: ServerPresets): ServerPresets {
  return {
    ...(DEFAULT_PRESETS as unknown as ServerPresets),
    ...partial,
  };
}

function migrateLegacyConfig(data: any): ConfigData {
  if (data.server && data.server.presets && !data.server.profiles) {
    const activeProfile = data.server.activeProfile || "Default";
    const profiles: Record<string, ServerProfile> = {
      Default: {
        presets: mergePresets(data.server.presets as ServerPresets),
        freeFormArgs: data.server.freeFormArgs || [],
      },
    };
    data.server = {
      ...data.server,
      profiles,
      activeProfile,
    };
    delete data.server.presets;
    delete data.server.freeFormArgs;
    return data as ConfigData;
  }
  return data as ConfigData;
}

export async function loadConfig(): Promise<ConfigData> {
  try {
    const data = await fs.readJson(CONFIG_PATH, { throws: false });
    if (!data) return DEFAULT_CONFIG;

    const migrated = migrateLegacyConfig(data);

    const defaultProfiles = DEFAULT_CONFIG.server.profiles;
    const userProfiles = migrated.server?.profiles || {};
    const mergedProfiles: Record<string, ServerProfile> = {};

    for (const key of [...new Set([...Object.keys(defaultProfiles), ...Object.keys(userProfiles)])]) {
      if (userProfiles[key]) {
        mergedProfiles[key] = {
          presets: mergePresets(userProfiles[key].presets || (DEFAULT_PRESETS as ServerPresets)),
          freeFormArgs: userProfiles[key].freeFormArgs || [],
        };
      } else {
        mergedProfiles[key] = defaultProfiles[key];
      }
    }

    const activeProfile = migrated.server?.activeProfile || "Default";
    if (!mergedProfiles[activeProfile]) {
      return DEFAULT_CONFIG;
    }

    const merged: ConfigData = {
      ...DEFAULT_CONFIG,
      ...migrated,
      server: {
        ...DEFAULT_CONFIG.server,
        ...migrated.server,
        profiles: mergedProfiles,
        activeProfile,
      },
      dashboard: {
        ...DEFAULT_CONFIG.dashboard,
        ...(migrated.dashboard || {}),
      },
      tasks: {
        ...DEFAULT_CONFIG.tasks,
        ...(migrated.tasks || {}),
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
