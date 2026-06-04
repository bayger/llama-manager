import { EventEmitter } from "events";
import fs from "fs-extra";
import path from "path";

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
}

const taskBuffer = new Map<number, Partial<TaskMetrics>>();
const completedTaskIds = new Set<number>();

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

function parseLine(line: string): Partial<TaskMetrics> | null {
  let match: RegExpMatchArray | null;

  if ((match = line.match(promptEvalRegex))) {
    return {
      slotId: parseInt(match[1]),
      taskId: parseInt(match[2]),
      promptTimeMs: parseFloat(match[3]),
      promptTokens: parseInt(match[4]),
      promptSpeed: parseFloat(match[6]),
    };
  }

  if ((match = line.match(evalRegex))) {
    return {
      slotId: parseInt(match[1]),
      taskId: parseInt(match[2]),
      evalTimeMs: parseFloat(match[3]),
      outputTokens: parseInt(match[4]),
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
  };
}

export class LogParser extends EventEmitter {
  private tailTimers = new Map<number, NodeJS.Timeout>();

  seedCompleted(ids: number[]) {
    for (const id of ids) completedTaskIds.add(id);
  }

  processLine(line: string): TaskMetrics | null {
    const metrics = parseLine(line);
    if (!metrics || metrics.taskId === undefined || metrics.taskId < 0) return null;

    const key = metrics.taskId;
    if (completedTaskIds.has(key)) return null;

    const existing = taskBuffer.get(key) || {};
    const merged = { ...existing, ...metrics, timestamp: new Date().toISOString() };
    taskBuffer.set(key, merged);

    if (metrics.contextSize !== undefined) {
      const complete = fillDefaults(merged);
      completedTaskIds.add(key);
      taskBuffer.delete(key);
      const timer = this.tailTimers.get(key);
      if (timer) {
        clearTimeout(timer);
        this.tailTimers.delete(key);
      }
      this.emit("task", complete);
      return complete;
    }

    if (metrics.totalTimeMs !== undefined && metrics.totalTokens !== undefined) {
      const timer = setTimeout(() => {
        const buf = taskBuffer.get(key);
        if (buf) {
          const complete = fillDefaults(buf);
          completedTaskIds.add(key);
          taskBuffer.delete(key);
          this.tailTimers.delete(key);
          this.emit("task", complete);
        }
      }, 1000);
      this.tailTimers.set(key, timer);
    }

    return null;
  }

  async parseExistingFile(filePath: string): Promise<void> {
    if (!(await fs.pathExists(filePath))) {
      console.log(`[logparser] File not found: ${filePath}`);
      return;
    }
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");
    console.log(`[logparser] Parsing ${lines.length} lines from ${filePath}`);
    for (const line of lines) {
      if (line.trim()) {
        this.processLine(line);
      }
    }
  }

  startFileTailer(filePath: string): () => void {
    let watchInterval: ReturnType<typeof setInterval> | null = null;
    let lastLineCount = 0;

    const poll = async () => {
      try {
        if (!(await fs.pathExists(filePath))) return;
        const content = await fs.readFile(filePath, "utf-8");
        const lines = content.split("\n");
        if (lines.length > lastLineCount) {
          for (let i = lastLineCount; i < lines.length; i++) {
            if (lines[i].trim()) {
              this.processLine(lines[i]);
            }
          }
          lastLineCount = lines.length;
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

  stop() {
    for (const timer of this.tailTimers.values()) clearTimeout(timer);
    this.tailTimers.clear();
  }
}

export const logParser = new LogParser();
