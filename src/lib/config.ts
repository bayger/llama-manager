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
  themeName: string;
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
      { key: "predict", flag: "--predict", type: "number", default: -1, description: "Max tokens to predict (-1=inf)" },
      { key: "cacheReuse", flag: "--cache-reuse", type: "number", default: 0, description: "Min chunk size for KV cache reuse" },
      { key: "cacheRam", flag: "--cache-ram", type: "number", default: 8192, description: "Max cache size (MiB)" },
      { key: "kvUnified", flag: "--kv-unified", type: "boolean", default: true, description: "Unified KV buffer" },
      { key: "cacheIdleSlots", flag: "--cache-idle-slots", type: "boolean", default: true, description: "Save/clear idle slots" },
      { key: "ctxCheckpoints", flag: "--ctx-checkpoints", type: "number", default: 32, description: "Context checkpoints per slot" },
      { key: "checkpointEveryN", flag: "--checkpoint-every-n-tokens", type: "number", default: 8192, description: "Checkpoint interval" },
      { key: "contextShift", flag: "--context-shift", type: "boolean", default: false, description: "Context shift for infinite gen" },
      { key: "warmup", flag: "--warmup", type: "boolean", default: true, description: "Warmup with empty run" },
      { key: "special", flag: "--special", type: "boolean", default: false, description: "Output special tokens" },
      { key: "skipChatParsing", flag: "--skip-chat-parsing", type: "boolean", default: false, description: "Force pure content parser" },
      { key: "prefillAssistant", flag: "--prefill-assistant", type: "boolean", default: true, description: "Prefill assistant response" },
      { key: "slotPromptSim", flag: "--slot-prompt-similarity", type: "number", default: 0.10, description: "Slot prompt similarity" },
      { key: "slotSavePath", flag: "--slot-save-path", type: "string", default: null, description: "Slot KV cache save path" },
      { key: "reusePort", flag: "--reuse-port", type: "boolean", default: false, description: "Allow port reuse" },
      { key: "props", flag: "--props", type: "boolean", default: false, description: "Enable /props endpoint" },
      { key: "noSlots", flag: "--no-slots", type: "boolean", default: false, description: "Disable slots endpoint" },
      { key: "sleepIdle", flag: "--sleep-idle-seconds", type: "number", default: -1, description: "Sleep after idle (s, -1=off)" },
      { key: "tools", flag: "--tools", type: "string", default: null, description: "Built-in tools (all/...)" },
      { key: "uiMcpProxy", flag: "--ui-mcp-proxy", type: "boolean", default: false, description: "MCP CORS proxy" },
      { key: "mediaPath", flag: "--media-path", type: "string", default: null, description: "Media files directory" },
      { key: "alias", flag: "--alias", type: "string", default: null, description: "Model name aliases" },
      { key: "apiKeyFile", flag: "--api-key-file", type: "string", default: null, description: "API keys file path" },
      { key: "sslKeyFile", flag: "--ssl-key-file", type: "string", default: null, description: "SSL private key" },
      { key: "sslCertFile", flag: "--ssl-cert-file", type: "string", default: null, description: "SSL certificate" },
      { key: "path", flag: "--path", type: "string", default: null, description: "Static files path" },
      { key: "apiPrefix", flag: "--api-prefix", type: "string", default: null, description: "API prefix path" },
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
      { key: "mmproj", flag: "--mmproj", type: "string", default: null, description: "Multimodal projector path" },
      { key: "mmprojAuto", flag: "--mmproj-auto", type: "boolean", default: true, description: "Auto-download mmproj" },
      { key: "mmprojOffload", flag: "--mmproj-offload", type: "boolean", default: true, description: "GPU offload mmproj" },
      { key: "chatTemplateFile", flag: "--chat-template-file", type: "string", default: null, description: "Chat template file" },
      { key: "chatTemplateKwargs", flag: "--chat-template-kwargs", type: "string", default: null, description: "Chat template JSON kwargs" },
      { key: "loraScaled", flag: "--lora-scaled", type: "string", default: null, description: "LoRA with scaling" },
      { key: "loraInitWithoutApply", flag: "--lora-init-without-apply", type: "boolean", default: false, description: "Load LoRA without applying" },
      { key: "modelUrl", flag: "--model-url", type: "string", default: null, description: "Model download URL" },
      { key: "dockerRepo", flag: "--docker-repo", type: "string", default: null, description: "Docker Hub model repo" },
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
      { key: "cacheTypeK", flag: "--cache-type-k", type: "enum", default: "f16", options: ["f32", "f16", "bf16", "q8_0", "q4_0", "q4_1", "iq4_nl", "q5_0", "q5_1"], description: "KV cache K type" },
      { key: "cacheTypeV", flag: "--cache-type-v", type: "enum", default: "f16", options: ["f32", "f16", "bf16", "q8_0", "q4_0", "q4_1", "iq4_nl", "q5_0", "q5_1"], description: "KV cache V type" },
      { key: "cpuMoe", flag: "--cpu-moe", type: "boolean", default: false, description: "Keep MoE weights on CPU" },
      { key: "noKvOffload", flag: "--no-kv-offload", type: "boolean", default: false, description: "Disable KV cache offloading" },
      { key: "noHost", flag: "--no-host", type: "boolean", default: false, description: "Bypass host buffer" },
      { key: "directIo", flag: "--direct-io", type: "boolean", default: false, description: "Use DirectIO" },
      { key: "numa", flag: "--numa", type: "enum", default: null, options: ["distribute", "isolate", "numactl"], description: "NUMA" },
      { key: "ropeScaling", flag: "--rope-scaling", type: "enum", default: null, options: ["none", "linear", "yarn"], description: "RoPE scaling" },
      { key: "ropeFreqScale", flag: "--rope-freq-scale", type: "number", default: null, description: "RoPE frequency scaling factor" },
      { key: "ropeFreqBase", flag: "--rope-freq-base", type: "number", default: null, description: "RoPE base frequency" },
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
      { key: "fitTarget", flag: "--fit-target", type: "string", default: null, description: "Target VRAM margin per GPU (MiB)" },
      { key: "fitCtx", flag: "--fit-ctx", type: "number", default: null, description: "Min ctx size for --fit" },
      { key: "overrideTensor", flag: "--override-tensor", type: "string", default: null, description: "Override tensor buffer type" },
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
      { key: "typicalP", flag: "--typical-p", type: "number", default: 1.0, description: "Locally typical sampling" },
      { key: "topNSigma", flag: "--top-n-sigma", type: "number", default: -1.0, description: "Top-n-sigma sampling (-1=off)" },
      { key: "xtcProbability", flag: "--xtc-probability", type: "number", default: 0.0, description: "XTC probability" },
      { key: "xtcThreshold", flag: "--xtc-threshold", type: "number", default: 0.1, description: "XTC threshold" },
      { key: "dryMultiplier", flag: "--dry-multiplier", type: "number", default: 0.0, description: "DRY multiplier" },
      { key: "dryBase", flag: "--dry-base", type: "number", default: 1.75, description: "DRY base value" },
      { key: "dynatempRange", flag: "--dynatemp-range", type: "number", default: 0.0, description: "Dynamic temp range" },
      { key: "dynatempExp", flag: "--dynatemp-exp", type: "number", default: 1.0, description: "Dynamic temp exponent" },
      { key: "mirostat", flag: "--mirostat", type: "number", default: 0, description: "Mirostat (0=off, 1, 2)" },
      { key: "mirostatEnt", flag: "--mirostat-ent", type: "number", default: 5.0, description: "Mirostat target entropy" },
      { key: "mirostatLr", flag: "--mirostat-lr", type: "number", default: 0.1, description: "Mirostat learning rate" },
      { key: "logitBias", flag: "--logit-bias", type: "string", default: null, description: "Token bias" },
      { key: "grammarFile", flag: "--grammar-file", type: "string", default: null, description: "Grammar file path" },
      { key: "jsonSchemaFile", flag: "--json-schema-file", type: "string", default: null, description: "JSON schema file path" },
      { key: "backendSampling", flag: "--backend-sampling", type: "boolean", default: false, description: "Backend sampling" },
      { key: "adaptiveTarget", flag: "--adaptive-target", type: "number", default: -1.0, description: "Adaptive-p target" },
      { key: "adaptiveDecay", flag: "--adaptive-decay", type: "number", default: 0.90, description: "Adaptive-p decay" },
      { key: "samplingSeq", flag: "--sampling-seq", type: "string", default: null, description: "Sampler sequence" },
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
      { key: "draftNMin", flag: "--spec-draft-n-min", type: "number", default: 0, description: "Min draft tokens" },
      { key: "draftPSplit", flag: "--spec-draft-p-split", type: "number", default: 0.10, description: "Split probability" },
      { key: "draftPMin", flag: "--spec-draft-p-min", type: "number", default: 0.75, description: "Min probability (greedy)" },
      { key: "draftHfRepo", flag: "--spec-draft-hf-repo", type: "string", default: null, description: "HF repo for draft model" },
      { key: "draftCacheTypeK", flag: "--cache-type-k-draft", type: "enum", default: "f16", options: ["f32", "f16", "bf16", "q8_0", "q4_0", "q4_1", "iq4_nl", "q5_0", "q5_1"], description: "KV cache K type (draft)" },
      { key: "draftCacheTypeV", flag: "--cache-type-v-draft", type: "enum", default: "f16", options: ["f32", "f16", "bf16", "q8_0", "q4_0", "q4_1", "iq4_nl", "q5_0", "q5_1"], description: "KV cache V type (draft)" },
    ],
  },
  {
    name: "Reasoning",
    presetKey: "reasoning",
    fields: [
      { key: "reasoning", flag: "--reasoning", type: "enum", default: "auto", options: ["on", "off", "auto"], description: "Thinking mode" },
      { key: "reasoningBudget", flag: "--reasoning-budget", type: "number", default: -1, description: "Thinking token budget" },
      { key: "reasoningFormat", flag: "--reasoning-format", type: "enum", default: "auto", options: ["none", "deepseek", "deepseek-legacy", "auto"], description: "Format" },
      { key: "reasoningBudgetMessage", flag: "--reasoning-budget-message", type: "string", default: null, description: "Budget exhausted message" },
    ],
  },
  {
    name: "Logging",
    presetKey: "logging",
    fields: [
      { key: "logVerbosity", flag: "--log-verbosity", type: "number", default: 3, description: "Verbosity (0-5)" },
      { key: "logColors", flag: "--log-colors", type: "enum", default: "auto", options: ["on", "off", "auto"], description: "Colored logs" },
      { key: "logTimestamps", flag: "--log-timestamps", type: "boolean", default: true, description: "Include timestamps" },
      { key: "logPrefix", flag: "--log-prefix", type: "boolean", default: false, description: "Enable log prefix" },
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
    predict: -1,
    cacheReuse: 0,
    cacheRam: 8192,
    kvUnified: true,
    cacheIdleSlots: true,
    ctxCheckpoints: 32,
    checkpointEveryN: 8192,
    contextShift: false,
    warmup: true,
    special: false,
    skipChatParsing: false,
    prefillAssistant: true,
    slotPromptSim: 0.10,
    slotSavePath: null,
    reusePort: false,
    props: false,
    noSlots: false,
    sleepIdle: -1,
    tools: null,
    uiMcpProxy: false,
    mediaPath: null,
    alias: null,
    apiKeyFile: null,
    sslKeyFile: null,
    sslCertFile: null,
    path: null,
    apiPrefix: null,
  },
  model: {
    model: null,
    lora: null,
    hfRepo: null,
    chatTemplate: null,
    jinja: true,
    mmproj: null,
    mmprojAuto: true,
    mmprojOffload: true,
    chatTemplateFile: null,
    chatTemplateKwargs: null,
    loraScaled: null,
    loraInitWithoutApply: false,
    modelUrl: null,
    dockerRepo: null,
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
    cpuMoe: false,
    noKvOffload: false,
    noHost: false,
    directIo: false,
    numa: null,
    ropeScaling: null,
    ropeFreqScale: null,
    ropeFreqBase: null,
  },
  gpu: {
    gpuLayers: "auto",
    splitMode: "layer",
    tensorSplit: null,
    mainGpu: 0,
    device: null,
    fit: "on",
    fitTarget: null,
    fitCtx: null,
    overrideTensor: null,
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
    typicalP: 1.0,
    topNSigma: -1.0,
    xtcProbability: 0.0,
    xtcThreshold: 0.1,
    dryMultiplier: 0.0,
    dryBase: 1.75,
    dynatempRange: 0.0,
    dynatempExp: 1.0,
    mirostat: 0,
    mirostatEnt: 5.0,
    mirostatLr: 0.1,
    logitBias: null,
    grammarFile: null,
    jsonSchemaFile: null,
    backendSampling: false,
    adaptiveTarget: -1.0,
    adaptiveDecay: 0.90,
    samplingSeq: null,
  },
  speculative: {
    draftModel: null,
    specType: "none",
    draftNMax: 3,
    draftThreads: null,
    draftGpuLayers: "auto",
    draftNMin: 0,
    draftPSplit: 0.10,
    draftPMin: 0.75,
    draftHfRepo: null,
    draftCacheTypeK: "f16",
    draftCacheTypeV: "f16",
  },
  reasoning: {
    reasoning: "auto",
    reasoningBudget: -1,
    reasoningFormat: "auto",
    reasoningBudgetMessage: null,
  },
  logging: {
    logFile: null,
    logVerbosity: 3,
    logColors: "auto",
    logTimestamps: true,
    logPrefix: false,
  },
};

const DEFAULT_CONFIG: ConfigData = {
  themeName: "opencode",
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

export function getTasksDb(config: ConfigData): string {
  if (config.tasksFile) return config.tasksFile.replace(/\.jsonl$/, ".db");
  return path.join(DATA_DIR, "tasks.db");
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
