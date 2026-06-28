import os from "os";
import { PresetCategory, PresetFieldDef } from "./config";

export interface BackendVariant {
  id: string;
  label: string;
  assetMatcher: (assetName: string, platform: string) => boolean;
}

export interface AssetNamingConvention {
  /** Human-readable pattern, e.g. "llama-{tag}-bin-{os}-{backend}-{arch}.tar.gz" */
  pattern: string;
  /** OS token used in asset names, e.g. "linux", "ubuntu", "macos" */
  osTokens: string[];
  /** Arch token used in asset names, e.g. "x64", "arm64" */
  archTokens: string[];
  /** File extension(s), e.g. ".tar.gz", ".zip", or null for raw binaries */
  extension: string | null;
  /** Whether the asset is an archive that extracts to a subdirectory */
  isArchive: boolean;
  /** Backend/variant suffixes, e.g. "cuda12", "nocuda", "oldpc" */
  backendSuffixes: string[];
}

/** Describes how a llama.cpp preset field maps to this fork's CLI. */
export interface FieldMapping {
  /** The upstream field key (e.g. "host", "ctxSize") */
  fieldKey: string;
  /** Preset category key (e.g. "server", "compute") */
  categoryKey: string;
  /** Override the CLI flag for this fork (null = incompatible/hidden) */
  flag: string | null;
  /** If true and the field is boolean, invert the sense (negate). */
  negateInvert?: boolean;
  /** Custom value transform (e.g. "--parallelrequests" takes a number, not bool) */
  valueTransform?: (value: unknown) => unknown;
}

/** A koboldcpp-specific field not present in the upstream preset schema. */
export interface ForkSpecificFieldDef extends PresetFieldDef {
  /** Preset category to attach under */
  categoryKey: keyof import("./config").ServerPresets;
}

export interface ForkDefinition {
  id: string;
  label: string;
  githubRepo: string;
  binaryNames: { linux: string; macos: string; win: string };
  assetNamePattern: RegExp;
  extractDirPrefix: string | null;
  folderPrefix: string;
  isRawBinary: boolean;
  hasListDevices: boolean;
  backendVariants: BackendVariant[];
  presetCategoryOverrides: string[] | null;
  /** Naming convention for release assets */
  assetNaming: AssetNamingConvention;
  /** Per-field CLI flag remapping (null flag = hidden). Empty = use upstream flags as-is. */
  fieldMappings: FieldMapping[];
  /** Fork-specific fields not in the upstream schema */
  specificFields: ForkSpecificFieldDef[];
}

const FORK_REGISTRY: Record<string, ForkDefinition> = {
  "llama.cpp": {
    id: "llama.cpp",
    label: "llama.cpp",
    githubRepo: "ggml-org/llama.cpp",
    binaryNames: { linux: "llama-server", macos: "llama-server", win: "llama-server.exe" },
    assetNamePattern: /^llama-.+-bin-/,
    extractDirPrefix: "llama-",
    folderPrefix: "",
    isRawBinary: false,
    hasListDevices: true,
    backendVariants: [],
    presetCategoryOverrides: null,
    assetNaming: {
      pattern: "llama-{tag}-bin-{os}-{backend}-{arch}.tar.gz",
      osTokens: ["ubuntu", "macos"],
      archTokens: ["x64", "arm64"],
      extension: ".tar.gz",
      isArchive: true,
      backendSuffixes: ["cpu", "metal", "cuda12", "cuda13", "vulkan", "rocm", "openvino", "opencl", "hip"],
    },
    fieldMappings: [],
    specificFields: [],
  },
  koboldcpp: {
    id: "koboldcpp",
    label: "koboldcpp",
    githubRepo: "LostRuins/koboldcpp",
    binaryNames: { linux: "koboldcpp-linux-x64", macos: "koboldcpp-mac-arm64", win: "koboldcpp.exe" },
    assetNamePattern: /^koboldcpp-/,
    extractDirPrefix: null,
    folderPrefix: "koboldcpp-",
    isRawBinary: true,
    hasListDevices: false,
    backendVariants: [
      {
        id: "cuda",
        label: "CUDA",
        assetMatcher: (name, platform) => {
          if (platform.startsWith("ubuntu") || platform.startsWith("linux")) return name === "koboldcpp-linux-x64";
          if (platform.startsWith("macos")) return name === "koboldcpp-mac-arm64";
          return false;
        },
      },
      {
        id: "cpu",
        label: "CPU",
        assetMatcher: (name, platform) => {
          if (platform.startsWith("ubuntu") || platform.startsWith("linux")) return name === "koboldcpp-linux-x64-nocuda";
          return false;
        },
      },
      {
        id: "oldpc",
        label: "CUDA (old GPU)",
        assetMatcher: (name, platform) => {
          if (platform.startsWith("ubuntu") || platform.startsWith("linux")) return name === "koboldcpp-linux-x64-oldpc";
          return false;
        },
      },
      {
        id: "metal",
        label: "Metal",
        assetMatcher: (name, platform) => {
          if (platform.startsWith("macos")) return name === "koboldcpp-mac-arm64";
          return false;
        },
      },
    ],
    presetCategoryOverrides: ["server", "model", "compute", "gpu", "speculative"],
    assetNaming: {
      pattern: "koboldcpp-{os}-{arch}[-variant]",
      osTokens: ["linux", "mac"],
      archTokens: ["x64", "arm64"],
      extension: null,
      isArchive: false,
      backendSuffixes: ["", "-nocuda", "-oldpc"],
    },
    fieldMappings: [
      // Server
      { fieldKey: "host", categoryKey: "server", flag: "--host" },
      { fieldKey: "port", categoryKey: "server", flag: "--port" },
      { fieldKey: "parallel", categoryKey: "server", flag: "--parallelrequests", valueTransform: (v) => v === true ? 4 : (typeof v === "number" ? v : 4) },
      { fieldKey: "timeout", categoryKey: "server", flag: "--reqtimeout" },
      { fieldKey: "apiKey", categoryKey: "server", flag: "--password" },
      { fieldKey: "threadsHttp", categoryKey: "server", flag: null },
      { fieldKey: "contBatching", categoryKey: "server", flag: null },
      { fieldKey: "cachePrompt", categoryKey: "server", flag: null },
      { fieldKey: "metrics", categoryKey: "server", flag: null },
      { fieldKey: "ui", categoryKey: "server", flag: null },
      { fieldKey: "embedding", categoryKey: "server", flag: null },
      { fieldKey: "rerank", categoryKey: "server", flag: null },
      { fieldKey: "predict", categoryKey: "server", flag: null },
      { fieldKey: "cacheReuse", categoryKey: "server", flag: null },
      { fieldKey: "cacheRam", categoryKey: "server", flag: null },
      { fieldKey: "kvUnified", categoryKey: "server", flag: null },
      { fieldKey: "cacheIdleSlots", categoryKey: "server", flag: null },
      { fieldKey: "ctxCheckpoints", categoryKey: "server", flag: null },
      { fieldKey: "checkpointEveryN", categoryKey: "server", flag: null },
      { fieldKey: "contextShift", categoryKey: "server", flag: "--noshift", negateInvert: true },
      { fieldKey: "warmup", categoryKey: "server", flag: null },
      { fieldKey: "special", categoryKey: "server", flag: null },
      { fieldKey: "skipChatParsing", categoryKey: "server", flag: null },
      { fieldKey: "prefillAssistant", categoryKey: "server", flag: null },
      { fieldKey: "slotPromptSim", categoryKey: "server", flag: null },
      { fieldKey: "slotSavePath", categoryKey: "server", flag: null },
      { fieldKey: "reusePort", categoryKey: "server", flag: null },
      { fieldKey: "props", categoryKey: "server", flag: null },
      { fieldKey: "noSlots", categoryKey: "server", flag: null },
      { fieldKey: "sleepIdle", categoryKey: "server", flag: null },
      { fieldKey: "tools", categoryKey: "server", flag: null },
      { fieldKey: "uiMcpProxy", categoryKey: "server", flag: null },
      { fieldKey: "mediaPath", categoryKey: "server", flag: null },
      { fieldKey: "alias", categoryKey: "server", flag: null },
      { fieldKey: "apiKeyFile", categoryKey: "server", flag: null },
      { fieldKey: "sslKeyFile", categoryKey: "server", flag: null },
      { fieldKey: "sslCertFile", categoryKey: "server", flag: null },
      { fieldKey: "path", categoryKey: "server", flag: null },
      { fieldKey: "apiPrefix", categoryKey: "server", flag: null },
      // Model
      { fieldKey: "model", categoryKey: "model", flag: "--model" },
      { fieldKey: "lora", categoryKey: "model", flag: "--lora" },
      { fieldKey: "hfRepo", categoryKey: "model", flag: null },
      { fieldKey: "chatTemplate", categoryKey: "model", flag: null },
      { fieldKey: "jinja", categoryKey: "model", flag: "--jinja" },
      { fieldKey: "mmproj", categoryKey: "model", flag: "--mmproj" },
      { fieldKey: "mmprojAuto", categoryKey: "model", flag: null },
      { fieldKey: "mmprojOffload", categoryKey: "model", flag: "--mmprojcpu", negateInvert: true },
      { fieldKey: "chatTemplateFile", categoryKey: "model", flag: "--jinjatemplate" },
      { fieldKey: "chatTemplateKwargs", categoryKey: "model", flag: "--jinja-kwargs" },
      { fieldKey: "loraScaled", categoryKey: "model", flag: null },
      { fieldKey: "loraInitWithoutApply", categoryKey: "model", flag: null },
      { fieldKey: "modelUrl", categoryKey: "model", flag: null },
      { fieldKey: "dockerRepo", categoryKey: "model", flag: null },
      // Compute
      { fieldKey: "threads", categoryKey: "compute", flag: "--threads" },
      { fieldKey: "threadsBatch", categoryKey: "compute", flag: "--blasthreads" },
      { fieldKey: "ctxSize", categoryKey: "compute", flag: "--contextsize" },
      { fieldKey: "batchSize", categoryKey: "compute", flag: "--batchsize" },
      { fieldKey: "ubatchSize", categoryKey: "compute", flag: null },
      { fieldKey: "flashAttn", categoryKey: "compute", flag: "--noflashattention", valueTransform: (v) => v === "off" ? true : false },
      { fieldKey: "mlock", categoryKey: "compute", flag: "--usemlock" },
      { fieldKey: "mmap", categoryKey: "compute", flag: "--usemmap" },
      { fieldKey: "cacheTypeK", categoryKey: "compute", flag: "--quantkv" },
      { fieldKey: "cacheTypeV", categoryKey: "compute", flag: null },
      { fieldKey: "cpuMoe", categoryKey: "compute", flag: "--moecpu" },
      { fieldKey: "noKvOffload", categoryKey: "compute", flag: "--lowvram" },
      { fieldKey: "noHost", categoryKey: "compute", flag: null },
      { fieldKey: "directIo", categoryKey: "compute", flag: null },
      { fieldKey: "numa", categoryKey: "compute", flag: null },
      { fieldKey: "ropeScaling", categoryKey: "compute", flag: null },
      { fieldKey: "ropeFreqScale", categoryKey: "compute", flag: null },
      { fieldKey: "ropeFreqBase", categoryKey: "compute", flag: null },
      // GPU
      { fieldKey: "gpuLayers", categoryKey: "gpu", flag: "--gpulayers" },
      { fieldKey: "splitMode", categoryKey: "gpu", flag: "--splitmode" },
      { fieldKey: "tensorSplit", categoryKey: "gpu", flag: "--tensor_split" },
      { fieldKey: "mainGpu", categoryKey: "gpu", flag: "--maingpu" },
      { fieldKey: "device", categoryKey: "gpu", flag: "--device" },
      { fieldKey: "fit", categoryKey: "gpu", flag: null },
      { fieldKey: "fitTarget", categoryKey: "gpu", flag: null },
      { fieldKey: "fitCtx", categoryKey: "gpu", flag: null },
      { fieldKey: "overrideTensor", categoryKey: "gpu", flag: "--overridetensors" },
      // Sampling — all API-only in koboldcpp, no startup flags
      { fieldKey: "seed", categoryKey: "sampling", flag: null },
      { fieldKey: "temperature", categoryKey: "sampling", flag: null },
      { fieldKey: "topK", categoryKey: "sampling", flag: null },
      { fieldKey: "topP", categoryKey: "sampling", flag: null },
      { fieldKey: "minP", categoryKey: "sampling", flag: null },
      { fieldKey: "repeatLastN", categoryKey: "sampling", flag: null },
      { fieldKey: "repeatPenalty", categoryKey: "sampling", flag: null },
      { fieldKey: "presencePenalty", categoryKey: "sampling", flag: null },
      { fieldKey: "frequencyPenalty", categoryKey: "sampling", flag: null },
      { fieldKey: "grammar", categoryKey: "sampling", flag: null },
      { fieldKey: "jsonSchema", categoryKey: "sampling", flag: null },
      { fieldKey: "ignoreEos", categoryKey: "sampling", flag: null },
      { fieldKey: "typicalP", categoryKey: "sampling", flag: null },
      { fieldKey: "topNSigma", categoryKey: "sampling", flag: null },
      { fieldKey: "xtcProbability", categoryKey: "sampling", flag: null },
      { fieldKey: "xtcThreshold", categoryKey: "sampling", flag: null },
      { fieldKey: "dryMultiplier", categoryKey: "sampling", flag: null },
      { fieldKey: "dryBase", categoryKey: "sampling", flag: null },
      { fieldKey: "dynatempRange", categoryKey: "sampling", flag: null },
      { fieldKey: "dynatempExp", categoryKey: "sampling", flag: null },
      { fieldKey: "mirostat", categoryKey: "sampling", flag: null },
      { fieldKey: "mirostatEnt", categoryKey: "sampling", flag: null },
      { fieldKey: "mirostatLr", categoryKey: "sampling", flag: null },
      { fieldKey: "logitBias", categoryKey: "sampling", flag: null },
      { fieldKey: "grammarFile", categoryKey: "sampling", flag: null },
      { fieldKey: "jsonSchemaFile", categoryKey: "sampling", flag: null },
      { fieldKey: "backendSampling", categoryKey: "sampling", flag: null },
      { fieldKey: "adaptiveTarget", categoryKey: "sampling", flag: null },
      { fieldKey: "adaptiveDecay", categoryKey: "sampling", flag: null },
      { fieldKey: "samplingSeq", categoryKey: "sampling", flag: null },
      // Speculative
      { fieldKey: "draftModel", categoryKey: "speculative", flag: "--draftmodel" },
      { fieldKey: "specType", categoryKey: "speculative", flag: null },
      { fieldKey: "draftNMax", categoryKey: "speculative", flag: "--draftamount" },
      { fieldKey: "draftThreads", categoryKey: "speculative", flag: null },
      { fieldKey: "draftGpuLayers", categoryKey: "speculative", flag: "--draftgpulayers" },
      { fieldKey: "draftNMin", categoryKey: "speculative", flag: null },
      { fieldKey: "draftPSplit", categoryKey: "speculative", flag: null },
      { fieldKey: "draftPMin", categoryKey: "speculative", flag: null },
      { fieldKey: "draftHfRepo", categoryKey: "speculative", flag: null },
      { fieldKey: "draftCacheTypeK", categoryKey: "speculative", flag: null },
      { fieldKey: "draftCacheTypeV", categoryKey: "speculative", flag: null },
    ],
    specificFields: [
      { key: "useCuda", flag: "--usecuda", type: "boolean", default: false, description: "Use CUDA acceleration", categoryKey: "gpu" },
      { key: "useVulkan", flag: "--usevulkan", type: "boolean", default: false, description: "Use Vulkan acceleration", categoryKey: "gpu" },
      { key: "useCpu", flag: "--usecpu", type: "boolean", default: false, description: "CPU only (no GPU)", categoryKey: "gpu" },
      { key: "autofit", flag: "--autofit", type: "boolean", default: false, description: "Force autofit to VRAM", categoryKey: "gpu" },
      { key: "autofitPadding", flag: "--autofitpadding", type: "number", default: null, description: "Autofit padding (MB)", categoryKey: "gpu" },
      { key: "defaultGenAmt", flag: "--defaultgenamt", type: "number", default: null, description: "Default generation length", categoryKey: "server" },
      { key: "genLimit", flag: "--genlimit", type: "number", default: null, description: "Max generated tokens", categoryKey: "server" },
      { key: "multiuser", flag: "--multiuser", type: "number", default: null, description: "Max queued requests", categoryKey: "server" },
      { key: "smartCache", flag: "--smartcache", type: "number", default: null, description: "Smart cache limit", categoryKey: "server" },
      { key: "noBosToken", flag: "--nobostoken", type: "boolean", default: false, description: "Skip BOS token", categoryKey: "model" },
      { key: "noFlashAttention", flag: "--noflashattention", type: "boolean", default: false, description: "Disable flash attention", categoryKey: "compute" },
      { key: "loramult", flag: "--loramult", type: "number", default: null, description: "LoRA multiplier", categoryKey: "model" },
      { key: "visionMaxRes", flag: "--visionmaxres", type: "number", default: null, description: "Vision max resolution (px)", categoryKey: "model" },
      { key: "draftAmount", flag: "--draftamount", type: "number", default: null, description: "Draft tokens per chunk", categoryKey: "speculative" },
      { key: "draftGpuLayers", flag: "--draftgpulayers", type: "number", default: null, description: "Draft GPU layers", categoryKey: "speculative" },
      { key: "draftGpuSplit", flag: "--draftgpusplit", type: "string", default: null, description: "Draft GPU split ratios", categoryKey: "speculative" },
      { key: "useMtp", flag: "--usemtp", type: "boolean", default: false, description: "Use MTP for drafting", categoryKey: "speculative" },
    ],
  },
  beellama: {
    id: "beellama",
    label: "beellama.cpp",
    githubRepo: "Anbeeld/beellama.cpp",
    binaryNames: { linux: "llama-server", macos: "llama-server", win: "llama-server.exe" },
    assetNamePattern: /^beellama-.+-bin-/,
    extractDirPrefix: "beellama-",
    folderPrefix: "beellama-",
    isRawBinary: false,
    hasListDevices: true,
    backendVariants: [],
    presetCategoryOverrides: null,
    assetNaming: {
      pattern: "beellama-{tag}-bin-{os}-{backend}-{arch}.tar.gz",
      osTokens: ["ubuntu", "macos"],
      archTokens: ["x64", "arm64"],
      extension: ".tar.gz",
      isArchive: true,
      backendSuffixes: ["cpu", "metal", "cuda12", "cuda13", "vulkan", "rocm", "sycl", "hip"],
    },
    fieldMappings: [],
    specificFields: [],
  },
  ik_llama: {
    id: "ik_llama",
    label: "ik_llama.cpp",
    githubRepo: "ik517/ik_llama.cpp",
    binaryNames: { linux: "llama-server", macos: "llama-server", win: "llama-server.exe" },
    assetNamePattern: /^llama-.+-bin-/,
    extractDirPrefix: "llama-",
    folderPrefix: "ik_llama-",
    isRawBinary: false,
    hasListDevices: true,
    backendVariants: [],
    presetCategoryOverrides: null,
    assetNaming: {
      pattern: "llama-{tag}-bin-{os}-{backend}-{arch}.tar.gz",
      osTokens: ["ubuntu", "macos"],
      archTokens: ["x64", "arm64"],
      extension: ".tar.gz",
      isArchive: true,
      backendSuffixes: ["cpu", "metal", "cuda12", "cuda13", "vulkan", "rocm", "openvino", "opencl", "hip"],
    },
    fieldMappings: [],
    specificFields: [],
  },
};

export function getFork(id: string): ForkDefinition {
  const fork = FORK_REGISTRY[id];
  if (!fork) {
    return FORK_REGISTRY["llama.cpp"]!;
  }
  return fork;
}

export function getAllForks(): ForkDefinition[] {
  return Object.values(FORK_REGISTRY);
}

export function getInstallableForks(): ForkDefinition[] {
  return getAllForks().filter(f => f.id !== "ik_llama");
}

export function detectForkFromFolder(folderName: string): ForkDefinition {
  if (folderName.startsWith("koboldcpp-")) return getFork("koboldcpp");
  if (folderName.startsWith("beellama-")) return getFork("beellama");
  if (folderName.startsWith("ik_llama-")) return getFork("ik_llama");
  return getFork("llama.cpp");
}

export function resolveBinaryName(fork: ForkDefinition): string {
  const platform = os.platform();
  if (platform === "linux") return fork.binaryNames.linux;
  if (platform === "darwin") return fork.binaryNames.macos;
  if (platform === "win32") return fork.binaryNames.win;
  return fork.binaryNames.linux;
}

export function parseFolderNameV2(name: string): { fork: string; tag: string; backend: string } {
  if (name.startsWith("koboldcpp-")) {
    const rest = name.slice("koboldcpp-".length);
    const parts = rest.split("-");
    const tag = parts[0] || rest;
    const backend = parts.slice(1).join("-") || "cuda";
    return { fork: "koboldcpp", tag, backend };
  }
  if (name.startsWith("beellama-")) {
    const rest = name.slice("beellama-".length);
    const parts = rest.split("-");
    const tag = parts[0] || rest;
    const backend = parts.slice(1).join("-") || "cpu";
    return { fork: "beellama", tag, backend };
  }
  if (name.startsWith("ik_llama-")) {
    const rest = name.slice("ik_llama-".length);
    const parts = rest.split("-");
    const tag = parts[0] || rest;
    const backend = parts.slice(1).join("-") || "cpu";
    return { fork: "ik_llama", tag, backend };
  }
  const match = name.match(/^(b\d+)(-.+)?$/);
  if (match) {
    return { fork: "llama.cpp", tag: match[1], backend: match[2] ? match[2].slice(1) : "cpu" };
  }
  return { fork: "llama.cpp", tag: name, backend: "cpu" };
}

export function getKoboldAiPresetCategory(): PresetCategory {
  return {
    name: "KoboldAI",
    presetKey: "server",
    fields: [
      { key: "apiUser", flag: "--api-user", type: "string", default: null, description: "KoboldAI API user" },
      { key: "apiPass", flag: "--api-pass", type: "string", default: null, description: "KoboldAI API password" },
      { key: "notebookOn", flag: "--notebook-on", type: "boolean", default: false, description: "Enable Notebook" },
      { key: "serverLogFile", flag: "--server-log-file", type: "string", default: null, description: "Server log file" },
      { key: "serverName", flag: "--server-name", type: "string", default: null, description: "Server display name" },
    ],
  };
}

export function isForkCompatibleWithPreset(forkId: string, categoryKey: string): boolean {
  const fork = getFork(forkId);
  if (fork.presetCategoryOverrides === null) {
    return true;
  }
  return fork.presetCategoryOverrides.includes(categoryKey);
}

export function isFieldCompatibleWithFork(forkId: string, fieldKey: string, categoryKey: string): boolean {
  const fork = getFork(forkId);
  if (fork.fieldMappings.length === 0) {
    return true;
  }
  const mapping = fork.fieldMappings.find(m => m.fieldKey === fieldKey && m.categoryKey === categoryKey);
  if (!mapping) {
    return true;
  }
  return mapping.flag !== null;
}

/** Returns the fork-specific flag for a field, or null if incompatible. */
export function getFieldFlag(forkId: string, fieldKey: string, categoryKey: string, originalFlag: string): string | null {
  const fork = getFork(forkId);
  if (fork.fieldMappings.length === 0) {
    return originalFlag;
  }
  const mapping = fork.fieldMappings.find(m => m.fieldKey === fieldKey && m.categoryKey === categoryKey);
  if (!mapping) {
    return originalFlag;
  }
  return mapping.flag;
}

/** Returns whether the fork mapping inverts the negate sense for a boolean field. */
export function isNegateInverted(forkId: string, fieldKey: string, categoryKey: string): boolean {
  const fork = getFork(forkId);
  const mapping = fork.fieldMappings.find(m => m.fieldKey === fieldKey && m.categoryKey === categoryKey);
  return mapping?.negateInvert ?? false;
}

/** Returns the value transform for a field, or undefined to use the value as-is. */
export function getFieldTransform(forkId: string, fieldKey: string, categoryKey: string): ((value: unknown) => unknown) | undefined {
  const fork = getFork(forkId);
  const mapping = fork.fieldMappings.find(m => m.fieldKey === fieldKey && m.categoryKey === categoryKey);
  return mapping?.valueTransform;
}

/** Returns fork-specific fields for a given category. */
export function getForkSpecificFields(forkId: string, categoryKey: string): ForkSpecificFieldDef[] {
  const fork = getFork(forkId);
  return fork.specificFields.filter(f => f.categoryKey === categoryKey);
}
