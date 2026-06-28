import os from "os";
import { PresetCategory } from "./config";

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
    presetCategoryOverrides: ["server", "model", "compute", "gpu", "sampling"],
    assetNaming: {
      pattern: "koboldcpp-{os}-{arch}[-variant]",
      osTokens: ["linux", "mac"],
      archTokens: ["x64", "arm64"],
      extension: null,
      isArchive: false,
      backendSuffixes: ["", "-nocuda", "-oldpc"],
    },
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
  if (forkId === "llama.cpp" || forkId === "beellama" || forkId === "ik_llama") {
    return true;
  }
  if (forkId === "koboldcpp") {
    const allowed = ["server", "model", "compute", "gpu", "sampling"];
    return allowed.includes(categoryKey);
  }
  return true;
}

export function isFieldCompatibleWithFork(forkId: string, fieldKey: string, categoryKey: string): boolean {
  if (forkId === "llama.cpp" || forkId === "beellama" || forkId === "ik_llama") {
    return true;
  }
  if (forkId === "koboldcpp") {
    const incompatibleServer = [
      "contBatching", "cachePrompt", "metrics", "ui", "embedding", "rerank",
      "predict", "cacheReuse", "cacheRam", "kvUnified", "cacheIdleSlots",
      "ctxCheckpoints", "checkpointEveryN", "contextShift", "warmup", "special",
      "skipChatParsing", "prefillAssistant", "slotPromptSim", "slotSavePath",
      "reusePort", "props", "noSlots", "sleepIdle", "tools", "uiMcpProxy",
      "mediaPath", "alias", "apiKeyFile", "sslKeyFile", "sslCertFile", "path", "apiPrefix",
    ];
    if (categoryKey === "server" && incompatibleServer.includes(fieldKey)) return false;

    const incompatibleModel = [
      "jinja", "mmproj", "mmprojAuto", "mmprojOffload", "chatTemplateFile",
      "chatTemplateKwargs", "loraScaled", "loraInitWithoutApply", "modelUrl", "dockerRepo",
    ];
    if (categoryKey === "model" && incompatibleModel.includes(fieldKey)) return false;

    const incompatibleCompute = [
      "threadsBatch", "ubatchSize", "flashAttn", "mlock", "mmap", "cacheTypeK",
      "cacheTypeV", "cpuMoe", "noKvOffload", "noHost", "directIo", "numa",
      "ropeScaling", "ropeFreqScale", "ropeFreqBase",
    ];
    if (categoryKey === "compute" && incompatibleCompute.includes(fieldKey)) return false;

    const incompatibleGpu = [
      "splitMode", "tensorSplit", "mainGpu", "device", "fit", "fitTarget",
      "fitCtx", "overrideTensor",
    ];
    if (categoryKey === "gpu" && incompatibleGpu.includes(fieldKey)) return false;
  }
  return true;
}
