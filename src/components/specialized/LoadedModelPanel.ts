import { Control } from "../ui/Control";
import { fg } from "../../lib/theme";
import { formatNum, spinnerChar, SPINNER_INTERVAL } from "../../lib/utils";
import { EventEmitter } from "events";
import type { RenderContext, Size } from "../ui/types";

export interface ParsedModelInfo {
  name: string;
  filePath: string;
  fileName: string;
  architecture: string;
  params: string;
  quantization: string;
  fileSize: string;
  fileSizeBytes: number;
  layers: number;
  layersAll: number;
  mtpLayers: number;
  contextTrain: number;
  contextRuntime: number;
  vocabSize: number;
  gpuOffloaded: string;
  gpuVram: string;
  kvCacheTypeK: string;
  kvCacheTypeV: string;
  kvCacheSize: string;
}

const emitter = new EventEmitter();
emitter.setMaxListeners(5);

export function onModelInfoChange(listener: () => void): () => void {
  emitter.on("change", listener);
  return () => { emitter.off("change", listener); };
}

let currentModel: ParsedModelInfo | null = null;

const reLoadModel = /srv\s+load_model: loading model '([^']+)'/;
const reArch = /print_info: arch\s+= (\S+)/;
const reParams = /print_info: model params\s+= ([\d.]+\s+\w+)/;
const reQuant = /print_info: file type\s+= (\S+)/;
const reFileSize = /print_info: file size\s+= ([\d.]+\s+\w+)/;
const reFileSizeBytes = /print_info: file size\s+= ([\d.]+)\s+(GiB|MiB)/;
const reLayers = /print_info: n_layer\s+= (\d+)/;
const reLayersAll = /print_info: n_layer_all\s+= (\d+)/;
const reCtxTrain = /print_info: n_ctx_train\s+= (\d+)/;
const reCtxRuntime = /llama_context: n_ctx\s+= (\d+)/;
const reVocab = /print_info: n_vocab\s+= (\d+)/;
const reGpuOffload = /load_tensors: offloaded (\d+)\/(\d+) layers to GPU/;
const reGpuVram = /load_tensors:\s+Vulkan\d+\s+model buffer size =\s+([\d.]+)\s+MiB/;
// Matches Vulkan backend format: "K (f16): 512.00 MiB, V (f16): 512.00 MiB"
// CPU backend uses different format, falls back to "(unknown)"
const reKvCache = /llama_kv_cache: size = ([\d.]+)\s+MiB \(\s*\d+ cells, \s*\d+ layers, \s*\d+\/\d+ seqs\), K \((\w+)\): ([\d.]+)\s+MiB, V \((\w+)\):/;
const reModelLoaded = /srv\s+llama_server: model loaded/;

const accum: Partial<ParsedModelInfo> = {};

function notify() {
  emitter.emit("change");
}

export function processModelLine(line: string): void {
  let m: RegExpMatchArray | null;

  if ((m = line.match(reLoadModel))) {
    for (const key of Object.keys(accum)) {
      delete accum[key as keyof typeof accum];
    }
    currentModel = null;
    const filePath = m[1];
    const fileName = filePath.split("/").pop() || filePath;
    const name = fileName.replace(/\.gguf$/i, "").replace(/[-_]Q\d+_[A-Z]+$/, "").replace(/[-_]Q\d+$/, "");
    accum.filePath = filePath;
    accum.fileName = fileName;
    accum.name = name;
    notify();
    return;
  }

  if ((m = line.match(reArch))) {
    accum.architecture = m[1];
    return;
  }

  if ((m = line.match(reParams))) {
    accum.params = m[1].trim();
    return;
  }

  if ((m = line.match(reQuant))) {
    accum.quantization = m[1];
    return;
  }

  if ((m = line.match(reFileSize))) {
    accum.fileSize = m[1].trim();
    return;
  }

  if ((m = line.match(reFileSizeBytes))) {
    const val = parseFloat(m[1]);
    const unit = m[2];
    accum.fileSizeBytes = unit === "GiB" ? val * 1024 * 1024 * 1024 : val * 1024 * 1024;
    return;
  }

  if ((m = line.match(reLayers))) {
    accum.layers = parseInt(m[1]);
    return;
  }

  if ((m = line.match(reLayersAll))) {
    accum.layersAll = parseInt(m[1]);
    return;
  }

  if ((m = line.match(reCtxTrain))) {
    accum.contextTrain = parseInt(m[1]);
    return;
  }

  if ((m = line.match(reCtxRuntime))) {
    accum.contextRuntime = parseInt(m[1]);
    return;
  }

  if ((m = line.match(reVocab))) {
    accum.vocabSize = parseInt(m[1]);
    return;
  }

  if ((m = line.match(reGpuOffload))) {
    accum.gpuOffloaded = `${m[1]}/${m[2]}`;
    return;
  }

  if ((m = line.match(reGpuVram))) {
    accum.gpuVram = `${m[1]} MiB`;
    return;
  }

  if ((m = line.match(reKvCache))) {
    accum.kvCacheTypeK = m[2];
    accum.kvCacheTypeV = m[4];
    accum.kvCacheSize = `${m[1]} MiB`;
    return;
  }

  if ((m = line.match(reModelLoaded))) {
    if (accum.name) {
      currentModel = {
        name: accum.name || "(unknown)",
        filePath: accum.filePath || "",
        fileName: accum.fileName || "",
        architecture: accum.architecture || "(unknown)",
        params: accum.params || "(unknown)",
        quantization: accum.quantization || "(unknown)",
        fileSize: accum.fileSize || "(unknown)",
        fileSizeBytes: accum.fileSizeBytes || 0,
        layers: accum.layers || 0,
        layersAll: accum.layersAll || 0,
        mtpLayers: ((accum.layersAll || 0) - (accum.layers || 0)),
        contextTrain: accum.contextTrain || 0,
        contextRuntime: accum.contextRuntime || 0,
        vocabSize: accum.vocabSize || 0,
        gpuOffloaded: accum.gpuOffloaded || "0/0",
        gpuVram: accum.gpuVram || "0 MiB",
        kvCacheTypeK: accum.kvCacheTypeK || "(unknown)",
        kvCacheTypeV: accum.kvCacheTypeV || "(unknown)",
        kvCacheSize: accum.kvCacheSize || "(unknown)",
      };
      notify();
    }
  }
}

export function resetModelInfo(): void {
  for (const key of Object.keys(accum)) {
    delete accum[key as keyof typeof accum];
  }
  currentModel = null;
  notify();
}

export function getModelInfo(): ParsedModelInfo | null {
  return currentModel;
}

export function isModelLoading(): boolean {
  return !currentModel && !!accum.name;
}

export function getLoadingModelName(): string | null {
  return isModelLoading() ? accum.name || null : null;
}

function fmtCtx(n: number): string {
  if (n >= 1024) return `${(n / 1024).toFixed(n % 1024 === 0 ? 0 : 1)}K`;
  return String(n);
}

export class LoadedModelPanel extends Control {
  focusable = false;
  protected _unsub: (() => void) | null = null;
  protected _spinnerTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this._unsub = onModelInfoChange(() => {
      this.markDirty();
    });
    this._spinnerTimer = setInterval(() => {
      if (isModelLoading()) {
        this.markDirty();
      }
    }, SPINNER_INTERVAL);
  }

  measure(parentSize?: Size): Size {
    const model = getModelInfo();
    if (!model) {
      return { width: parentSize?.width ?? this.rect.width, height: 1 };
    }
    return {
      width: parentSize?.width ?? this.rect.width,
      height: 4,
    };
  }

  draw(ctx: RenderContext): void {
    const { canvas } = ctx;
    const { x, y } = this.rect;
    const model = getModelInfo();

    if (!model) {
      if (this.rect.height > 0) {
        canvas.moveTo(x, y);
        const loadingName = getLoadingModelName();
        if (loadingName) {
          fg(canvas, "textMuted", "Loading model: ");
          fg(canvas, "accent", loadingName);
          fg(canvas, "textMuted", ` ${spinnerChar()}`);
        } else {
          fg(canvas, "textMuted", "No model loaded - start the server");
        }
      }
      return;
    }

    let cy = y;
    if (cy >= y + this.rect.height) return;

    canvas.moveTo(x, cy);
    fg(canvas, "accent", model.name);
    fg(canvas, "textMuted", `  \u2502  ${model.quantization}`);
    fg(canvas, "textMuted", `  \u2502  ${model.fileSize}`);
    fg(canvas, "textMuted", `  \u2502  Ctx `);
    fg(canvas, "text", `${fmtCtx(model.contextRuntime)}`);
    fg(canvas, "textMuted", ` / ${fmtCtx(model.contextTrain)}`);
    cy++;

    if (cy >= y + this.rect.height) return;
    canvas.moveTo(x, cy);
    fg(canvas, "textMuted", "  ");
    fg(canvas, "textMuted", "Arch ");
    fg(canvas, "info", model.architecture);
    fg(canvas, "textMuted", `  \u2502  Params `);
    fg(canvas, "info", model.params);
    fg(canvas, "textMuted", `  \u2502  Vocab `);
    fg(canvas, "text", formatNum(model.vocabSize));
    cy++;

    if (cy >= y + this.rect.height) return;
    canvas.moveTo(x, cy);
    fg(canvas, "textMuted", "  ");
    fg(canvas, "textMuted", "Layers ");
    fg(canvas, "text", `${model.layers} repeat`);
    if (model.mtpLayers > 0) {
      fg(canvas, "textMuted", ` + ${model.mtpLayers} MTP`);
    }
    fg(canvas, "textMuted", `  \u2502  GPU `);
    fg(canvas, "success", model.gpuOffloaded);
    fg(canvas, "textMuted", `  \u2502  VRAM `);
    fg(canvas, "info", model.gpuVram);
    cy++;

    if (cy >= y + this.rect.height) return;
    canvas.moveTo(x, cy);
    fg(canvas, "textMuted", "  ");
    fg(canvas, "textMuted", "KV Cache ");
    fg(canvas, "text", `${model.kvCacheTypeK} / ${model.kvCacheTypeV}`);
    fg(canvas, "textMuted", `  \u2502  Size `);
    fg(canvas, "info", model.kvCacheSize);
    cy++;
  }

  onDestroy(): void {
    if (this._unsub) {
      this._unsub();
      this._unsub = null;
    }
    if (this._spinnerTimer) {
      clearInterval(this._spinnerTimer);
      this._spinnerTimer = null;
    }
  }
}
