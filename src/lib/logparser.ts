import { EventEmitter } from "events";

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

export class LogParser extends EventEmitter {
  processLine(line: string): TaskMetrics | null {
    const metrics = parseLine(line);
    if (!metrics || !metrics.taskId) return null;

    const key = metrics.taskId;
    const existing = taskBuffer.get(key) || {};
    const merged = { ...existing, ...metrics, timestamp: new Date().toISOString() };
    taskBuffer.set(key, merged);

    if (metrics.contextSize !== undefined || (metrics.totalTimeMs && metrics.totalTokens)) {
      const complete = merged as TaskMetrics;
      if (complete.taskId && complete.promptTokens !== undefined && complete.outputTokens !== undefined) {
        taskBuffer.delete(key);
        this.emit("task", complete);
        return complete;
      }
    }

    return null;
  }
}

export const logParser = new LogParser();
