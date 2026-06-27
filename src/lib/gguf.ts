import { spawn } from "child_process";
import path from "path";
import fs from "fs-extra";
import { ConfigData, getVersionsDir } from "./config";

export interface GGUFInfo {
  architecture: string;
  params: string;
  quantization: string;
  fileSize: string;
  layers: number;
  layersAll: number;
  contextTrain: number;
  vocabSize: number;
  embeddingLength: number;
  feedForwardLength: number;
  attentionHeads: number;
  attentionHeadsKV: number;
  attentionKeyLength: number;
  attentionValueLength: number;
  attentionSlidingWindow: number;
  ropeScalingType: string;
  ropeScalingFactor: string;
  ropeFreqBase: string;
  visionBlockCount: number;
  visionEmbeddingLength: number;
  visionFeedForwardLength: number;
  visionImageSize: number;
  visionPatchSize: number;
  visionNumChannels: number;
  visionHeadCount: number;
  mmTokensPerImage: number;
  expertCount: number;
  expertUsed: number;
  gqa: number;
  tensorTypes: string[];
  ggufVersion: string;
  name: string;
  author: string;
  version: string;
  organization: string;
  license: string;
  url: string;
  description: string;
  date: string;
  tokenizerModel: string;
  bosTokenId: number;
  eosTokenId: number;
  padTokenId: number;
  unknownTokenId: number;
  chatTemplate: string;
}

function findLlamaTokenize(config: ConfigData): string | null {
  if (!config.activeVersion) return null;
  const versionsDir = getVersionsDir(config);
  const binary = path.join(versionsDir, config.activeVersion, "llama-tokenize");
  if (fs.pathExistsSync(binary)) return binary;

  const entries = fs.readdirSync(versionsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const b = path.join(versionsDir, entry.name, "llama-tokenize");
    if (fs.pathExistsSync(b)) return b;
  }
  return null;
}

function emptyInfo(): GGUFInfo {
  return {
    architecture: "-",
    params: "-",
    quantization: "-",
    fileSize: "-",
    layers: 0,
    layersAll: 0,
    contextTrain: 0,
    vocabSize: 0,
    embeddingLength: 0,
    feedForwardLength: 0,
    attentionHeads: 0,
    attentionHeadsKV: 0,
    attentionKeyLength: 0,
    attentionValueLength: 0,
    attentionSlidingWindow: 0,
    ropeScalingType: "-",
    ropeScalingFactor: "-",
    ropeFreqBase: "-",
    visionBlockCount: 0,
    visionEmbeddingLength: 0,
    visionFeedForwardLength: 0,
    visionImageSize: 0,
    visionPatchSize: 0,
    visionNumChannels: 0,
    visionHeadCount: 0,
    mmTokensPerImage: 0,
    expertCount: 0,
    expertUsed: 0,
    gqa: 0,
    tensorTypes: [],
    ggufVersion: "-",
    name: "-",
    author: "-",
    version: "-",
    organization: "-",
    license: "-",
    url: "-",
    description: "-",
    date: "-",
    tokenizerModel: "-",
    bosTokenId: 0,
    eosTokenId: 0,
    padTokenId: 0,
    unknownTokenId: 0,
    chatTemplate: "-",
  };
}

function runTokenize(tokenize: string, modelPath: string): Promise<string> {
  return new Promise((resolve) => {
    const chunks: string[] = [];
    const env = { ...process.env, TERM: "dumb" };
    const child = spawn(tokenize, [
      "-m", modelPath,
      "-p", "x",
      "--no-bos",
      "--ids",
    ], {
      stdio: ["pipe", "pipe", "pipe"],
      detached: false,
      env,
    });

    child.stdin.end();

    child.stdout.on("data", (d: Buffer) => chunks.push(d.toString()));
    child.stderr.on("data", (d: Buffer) => chunks.push(d.toString()));
    child.on("close", () => resolve(chunks.join("")));
    setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2000);
      resolve(chunks.join(""));
    }, 30000);
  });
}

const reKV = /-\s+kv\s+\d+:\s+(\S+)\s+(u32|f32|str|bool|arr\[[^\]]+\])\s+=\s+(.+)$/;
const reFileType = /print_info: file type\s+=\s+(\S+)/;
const reFileSize = /print_info: file size\s+=\s+([\d.]+\s*\w+)/;
const reGGUFVersion = /version GGUF V(\d+)/;
const reTensorType = /- type\s+(\S+):\s+(\d+)\s+tensors?/;

function parseKVValue(value: string, type: string): string {
  if (type.startsWith("arr[")) return "(array)";
  return value.trim();
}

export async function inspectGGUF(config: ConfigData, modelPath: string): Promise<GGUFInfo> {
  const tokenize = findLlamaTokenize(config);
  if (!tokenize) {
    const info = emptyInfo();
    info.architecture = "(no llama-tokenize)";
    return info;
  }

  const output = await runTokenize(tokenize, modelPath);
  const info: GGUFInfo = emptyInfo();
  const lines = output.split("\n");

  const kvMap = new Map<string, { type: string; value: string }>();
  const tensorTypes: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    let m: RegExpMatchArray | null;

    if ((m = trimmed.match(reKV))) {
      const key = m[1];
      const type = m[2];
      const value = parseKVValue(m[3], type);
      kvMap.set(key, { type, value });
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    let m: RegExpMatchArray | null;

    if ((m = trimmed.match(reFileType))) info.quantization = m[1];
    else if ((m = trimmed.match(reFileSize))) info.fileSize = m[1];
    else if ((m = trimmed.match(reGGUFVersion))) info.ggufVersion = `V${m[1]}`;
    else if ((m = trimmed.match(reTensorType))) tensorTypes.push(`${m[2]} ${m[1]}`);
  }

  if (tensorTypes.length > 0) info.tensorTypes = tensorTypes;

  const kv = (key: string): string | undefined => kvMap.get(key)?.value;
  const kvNum = (key: string): number => {
    const v = kvMap.get(key)?.value;
    if (!v) return 0;
    const n = parseInt(v, 10);
    return isNaN(n) ? 0 : n;
  };

  const arch = kv("general.architecture") || "-";
  info.architecture = arch === "-" ? "-" : arch;

  if (arch !== "-") {
    info.layers = kvNum(`${arch}.block_count`);
    info.contextTrain = kvNum(`${arch}.context_length`);
    info.embeddingLength = kvNum(`${arch}.embedding_length`);
    info.feedForwardLength = kvNum(`${arch}.feed_forward_length`);
    info.attentionHeads = kvNum(`${arch}.attention.head_count`);
    info.attentionHeadsKV = kvNum(`${arch}.attention.head_count_kv`);
    info.attentionKeyLength = kvNum(`${arch}.attention.key_length`);
    info.attentionValueLength = kvNum(`${arch}.attention.value_length`);
    info.attentionSlidingWindow = kvNum(`${arch}.attention.sliding_window`);
    info.ropeScalingType = kv(`${arch}.rope.scaling.type`) || "-";
    info.ropeScalingFactor = kv(`${arch}.rope.scaling.factor`) || "-";
    info.ropeFreqBase = kv(`${arch}.rope.freq_base`) || "-";
    info.expertCount = kvNum(`${arch}.expert_count`);
    info.expertUsed = kvNum(`${arch}.expert_used`);
  }

  info.visionBlockCount = kvNum(`${arch}.vision.block_count`);
  info.visionEmbeddingLength = kvNum(`${arch}.vision.embedding_length`);
  info.visionFeedForwardLength = kvNum(`${arch}.vision.feed_forward_length`);
  info.visionImageSize = kvNum(`${arch}.vision.image_size`);
  info.visionPatchSize = kvNum(`${arch}.vision.patch_size`);
  info.visionNumChannels = kvNum(`${arch}.vision.num_channels`);
  info.visionHeadCount = kvNum(`${arch}.vision.attention.head_count`);
  info.mmTokensPerImage = kvNum(`${arch}.mm.tokens_per_image`);

  info.gqa = kvNum(`${arch}.gqa`) || kvNum(`${arch}.attention.gqa`);

  info.vocabSize = kvNum("tokenizer.ggml.tokens") || 0;
  info.tokenizerModel = kv("tokenizer.ggml.model") || "-";
  info.bosTokenId = kvNum("tokenizer.ggml.bos_token_id");
  info.eosTokenId = kvNum("tokenizer.ggml.eos_token_id");
  info.padTokenId = kvNum("tokenizer.ggml.padding_token_id");
  info.unknownTokenId = kvNum("tokenizer.ggml.unknown_token_id");
  info.chatTemplate = kv("tokenizer.chat_template") || "-";

  info.name = kv("general.name") || "-";
  info.author = kv("general.author") || "-";
  info.version = kv("general.version") || "-";
  info.organization = kv("general.organization") || "-";
  info.license = kv("general.license") || "-";
  info.url = kv("general.url") || "-";
  info.description = kv("general.description") || "-";
  info.date = kv("general.date") || "-";

  return info;
}
