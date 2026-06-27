import { EventEmitter } from "events";
import fs from "fs-extra";
import path from "path";
import type { ConfigData } from "./config";

export interface TaskMetrics {
  taskId: number;
  slotId: number;
  promptTokens: number;
  promptTimeMs: number;
  promptSpeed: number;
  outputTokens: number;
  evalTimeMs: number;
  outputSpeed: number;
  totalTimeMs: number;
  totalTokens: number;
  graphsReused: number;
  draftAcceptance: number;
  draftAccepted: number;
  draftGenerated: number;
  contextSize: number;
  truncated: boolean;
  timestamp: string;
  profile?: string;
  model?: string;
  version?: string;
  pendingTokens: number;
  nCtxSlot: number;
  cachedPromptTokens: number;
  promptMsPerToken: number;
  outputMsPerToken: number;
  ttsMs: number;
  draftMeanAcceptLen: number;
  slotSimilarity: number;
}

export interface SpeedSample {
  taskId: number;
  phase: "prompt" | "generation";
  position: number;
  speedTps: number;
  msPerToken: number;
  elapsedS: number;
}



const promptEvalRegex =
  /slot print_timing: id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*prompt eval time\s*=\s*([\d.]+)\s*ms\s*\/\s*(\d+)\s*tokens\s*\(\s*([\d.]+)\s*ms per token,\s*([\d.]+)\s*tokens per second/;

const evalRegex =
  /slot print_timing: id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*eval time\s*=\s*([\d.]+)\s*ms\s*\/\s*(\d+)\s*tokens\s*\(\s*([\d.]+)\s*ms per token,\s*([\d.]+)\s*tokens per second/;

const totalTimeRegex =
  /slot print_timing: id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*total time\s*=\s*([\d.]+)\s*ms\s*\/\s*(\d+)\s*tokens/;

const graphsReusedRegex =
  /slot print_timing: id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*graphs reused\s*=\s*(\d+)/;

const draftAcceptanceRegex =
  /slot print_timing: id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*draft acceptance\s*=\s*([\d.]+)\s*\(\s*(\d+)\s*accepted\s*\/\s*(\d+)\s*generated\)/;

const releaseRegex =
  /slot\s+release: id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*stop processing: n_tokens\s*=\s*(\d+),\s*truncated\s*=\s*(\d)/;

const newPromptRegex =
  /slot\s+\S+: id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*new prompt,\s*n_ctx_slot\s*=\s*(\d+),\s*n_keep\s*=\s*\d+,\s*task\.n_tokens\s*=\s*(\d+)/;

const cachedTokensRegex =
  /slot\s+\S+: id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*cached n_tokens\s*=\s*(\d+)/;

const initSamplerRegex =
  /slot\s+\S+: id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*init sampler,\s*took\s*[\d.]+\s*ms/;

const firstTokenRegex =
  /slot print_timing: id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*n_decoded\s*=\s*1(?!,)/;

const draftAcceptanceExtendedRegex =
  /slot print_timing: id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*draft acceptance\s*=\s*([\d.]+)\s*\(\s*(\d+)\s*accepted\s*\/\s*(\d+)\s*generated.*?mean acceptance length\s*=\s*([\d.]+)/;

const slotSelectionRegex =
  /slot\s+\S+: id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*selected slot by LCP similarity,\s*sim_best\s*=\s*([\d.]+)/;

function parseLine(line: string): Partial<TaskMetrics> | null {
  let match: RegExpMatchArray | null;

  if ((match = line.match(promptEvalRegex))) {
    return {
      slotId: parseInt(match[1]),
      taskId: parseInt(match[2]),
      promptTimeMs: parseFloat(match[3]),
      promptTokens: parseInt(match[4]),
      promptMsPerToken: parseFloat(match[5]),
      promptSpeed: parseFloat(match[6]),
    };
  }

  if ((match = line.match(evalRegex))) {
    return {
      slotId: parseInt(match[1]),
      taskId: parseInt(match[2]),
      evalTimeMs: parseFloat(match[3]),
      outputTokens: parseInt(match[4]),
      outputMsPerToken: parseFloat(match[5]),
      outputSpeed: parseFloat(match[6]),
    };
  }

  if ((match = line.match(totalTimeRegex))) {
    return {
      slotId: parseInt(match[1]),
      taskId: parseInt(match[2]),
      totalTimeMs: parseFloat(match[3]),
      totalTokens: parseInt(match[4]),
    };
  }

  if ((match = line.match(graphsReusedRegex))) {
    return {
      slotId: parseInt(match[1]),
      taskId: parseInt(match[2]),
      graphsReused: parseInt(match[3]),
    };
  }

  if ((match = line.match(draftAcceptanceExtendedRegex))) {
    return {
      slotId: parseInt(match[1]),
      taskId: parseInt(match[2]),
      draftAcceptance: parseFloat(match[3]),
      draftAccepted: parseInt(match[4]),
      draftGenerated: parseInt(match[5]),
      draftMeanAcceptLen: parseFloat(match[6]),
    };
  }

  if ((match = line.match(draftAcceptanceRegex))) {
    return {
      slotId: parseInt(match[1]),
      taskId: parseInt(match[2]),
      draftAcceptance: parseFloat(match[3]),
      draftAccepted: parseInt(match[4]),
      draftGenerated: parseInt(match[5]),
    };
  }

  if ((match = line.match(releaseRegex))) {
    return {
      slotId: parseInt(match[1]),
      taskId: parseInt(match[2]),
      contextSize: parseInt(match[3]),
      truncated: match[4] !== "0",
    };
  }

  if ((match = line.match(newPromptRegex))) {
    return {
      slotId: parseInt(match[1]),
      taskId: parseInt(match[2]),
      nCtxSlot: parseInt(match[3]),
      pendingTokens: parseInt(match[4]),
    };
  }

  if ((match = line.match(cachedTokensRegex))) {
    return {
      slotId: parseInt(match[1]),
      taskId: parseInt(match[2]),
      cachedPromptTokens: parseInt(match[3]),
    };
  }

  if ((match = line.match(initSamplerRegex))) {
    return {
      slotId: parseInt(match[1]),
      taskId: parseInt(match[2]),
    };
  }

  if ((match = line.match(firstTokenRegex))) {
    return {
      slotId: parseInt(match[1]),
      taskId: parseInt(match[2]),
    };
  }

  if ((match = line.match(slotSelectionRegex))) {
    return {
      slotId: parseInt(match[1]),
      taskId: parseInt(match[2]),
      slotSimilarity: parseFloat(match[3]),
    };
  }

  return null;
}

function fillDefaults(partial: Partial<TaskMetrics>): TaskMetrics {
  return {
    taskId: partial.taskId ?? 0,
    slotId: partial.slotId ?? 0,
    promptTokens: partial.promptTokens ?? 0,
    promptTimeMs: partial.promptTimeMs ?? 0,
    promptSpeed: partial.promptSpeed ?? 0,
    outputTokens: partial.outputTokens ?? 0,
    evalTimeMs: partial.evalTimeMs ?? 0,
    outputSpeed: partial.outputSpeed ?? 0,
    totalTimeMs: partial.totalTimeMs ?? 0,
    totalTokens: partial.totalTokens ?? 0,
    graphsReused: partial.graphsReused ?? 0,
    draftAcceptance: partial.draftAcceptance ?? 0,
    draftAccepted: partial.draftAccepted ?? 0,
    draftGenerated: partial.draftGenerated ?? 0,
    contextSize: partial.contextSize ?? 0,
    truncated: partial.truncated ?? false,
    timestamp: partial.timestamp ?? new Date().toISOString(),
    profile: partial.profile,
    model: partial.model,
    version: partial.version,
    pendingTokens: partial.pendingTokens ?? 0,
    nCtxSlot: partial.nCtxSlot ?? 0,
    cachedPromptTokens: partial.cachedPromptTokens ?? 0,
    promptMsPerToken: partial.promptMsPerToken ?? 0,
    outputMsPerToken: partial.outputMsPerToken ?? 0,
    ttsMs: partial.ttsMs ?? 0,
    draftMeanAcceptLen: partial.draftMeanAcceptLen ?? 0,
    slotSimilarity: partial.slotSimilarity ?? 0,
  };
}

export class LogParser extends EventEmitter {
  private tailTimers = new Map<number, NodeJS.Timeout>();
  private _config: ConfigData | null = null;
  private taskBuffer = new Map<number, Partial<TaskMetrics>>();
  private completedTaskIds = new Set<number>();
  private initSamplerTimes = new Map<number, number>();
  private firstTokenTimes = new Map<number, number>();

  setConfig(config: ConfigData): void {
    this._config = config;
  }

  private computeTtsMs(taskId: number): number {
    const init = this.initSamplerTimes.get(taskId);
    const first = this.firstTokenTimes.get(taskId);
    if (init != null && first != null) {
      return first - init;
    }
    return 0;
  }

  private cleanupTask(key: number): void {
    this.completedTaskIds.add(key);
    this.taskBuffer.delete(key);
    this.initSamplerTimes.delete(key);
    this.firstTokenTimes.delete(key);
    const timer = this.tailTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.tailTimers.delete(key);
    }
  }

  seedCompleted(ids: number[]) {
    for (const id of ids) this.completedTaskIds.add(id);
  }

  processLine(line: string): TaskMetrics | null {
    let tMatch: RegExpMatchArray | null;
    if ((tMatch = line.match(initSamplerRegex))) {
      this.initSamplerTimes.set(parseInt(tMatch[2]), Date.now());
    }
    if ((tMatch = line.match(firstTokenRegex))) {
      this.firstTokenTimes.set(parseInt(tMatch[2]), Date.now());
    }

    const metrics = parseLine(line);
    if (!metrics || metrics.taskId === undefined || metrics.taskId < 0) return null;

    const key = metrics.taskId;
    if (this.completedTaskIds.has(key)) return null;

    const existing = this.taskBuffer.get(key) || {};
    const merged = { ...existing, ...metrics, timestamp: new Date().toISOString() };
    this.taskBuffer.set(key, merged);

    if (metrics.contextSize !== undefined) {
      const complete = fillDefaults(merged);
      complete.ttsMs = this.computeTtsMs(key);
      if (this._config) {
        const presets = this._config.server.profiles[this._config.server.activeProfile]?.presets;
        complete.profile = this._config.server.activeProfile;
        complete.model = (presets?.model?.model as string | undefined) ?? (presets?.model?.hfRepo as string | undefined) ?? undefined;
        complete.version = this._config.activeVersion ?? undefined;
      }
      this.cleanupTask(key);
      this.emit("task", complete);
      return complete;
    }

    if (metrics.totalTimeMs !== undefined && metrics.totalTokens !== undefined) {
      const timer = setTimeout(() => {
        const buf = this.taskBuffer.get(key);
        if (buf) {
          const complete = fillDefaults(buf);
          complete.ttsMs = this.computeTtsMs(key);
          if (this._config) {
            const presets = this._config.server.profiles[this._config.server.activeProfile]?.presets;
            complete.profile = this._config.server.activeProfile;
            complete.model = (presets?.model?.model as string | undefined) ?? (presets?.model?.hfRepo as string | undefined) ?? undefined;
            complete.version = this._config.activeVersion ?? undefined;
          }
          this.cleanupTask(key);
          this.emit("task", complete);
        }
      }, 1000);
      this.tailTimers.set(key, timer);
    }

    return null;
  }

  async parseExistingFile(filePath: string, lineProcessor?: (line: string) => void): Promise<void> {
    if (!(await fs.pathExists(filePath))) {
      return;
    }
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");
    for (const line of lines) {
      if (line.trim()) {
        this.processLine(line);
        if (lineProcessor) {
          lineProcessor(line);
        }
      }
    }
  }

  startFileTailer(filePath: string): () => void {
    let watchInterval: ReturnType<typeof setInterval> | null = null;
    let position = 0;

    const poll = async () => {
      try {
        const stat = await fs.stat(filePath);
        if (stat.size < position) {
          position = 0; // file was rotated or truncated
        }
        if (stat.size === position) return;

        const fd = await fs.open(filePath, "r");
        try {
          const buf = Buffer.alloc(stat.size - position);
          await fs.read(fd, buf, 0, buf.length, position);
          position += buf.length;

          const text = buf.toString("utf-8");
          const lines = text.split("\n");
          for (const line of lines) {
            if (line.trim()) {
              this.processLine(line);
            }
          }
        } finally {
          await fs.close(fd);
        }
      } catch {
        // File may not exist yet or be inaccessible
      }
    };

    poll();
    watchInterval = setInterval(poll, 500);

    return () => {
      if (watchInterval) clearInterval(watchInterval);
    };
  }

  clearCompleted(): void {
    this.taskBuffer.clear();
    this.completedTaskIds.clear();
    this.initSamplerTimes.clear();
    this.firstTokenTimes.clear();
  }

  stop() {
    for (const timer of this.tailTimers.values()) clearTimeout(timer);
    this.tailTimers.clear();
    this.taskBuffer.clear();
    this.completedTaskIds.clear();
    this.initSamplerTimes.clear();
    this.firstTokenTimes.clear();
  }
}

export const logParser = new LogParser();
