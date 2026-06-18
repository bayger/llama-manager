import { EventEmitter } from "events";

export interface SlotCheckpoint {
  pos: number;
  sizeMiB: number;
}

export interface SlotMetrics {
  slotId: number;
  state: "idle" | "prompting" | "generating";
  taskId: number | null;
  generationSpeed: number | null;
  promptSpeed: number | null;
  promptProgress: number | null;
  contextSize: number;
  ctxLimit: number | null;
  evaluatedTokens: number | null;
  promptTotalTokens: number | null;
  thinking: boolean;
  lastTask: CompletedTask | null;
  checkpoints: SlotCheckpoint[];
}

export interface CompletedTask {
  taskId: number;
  slotId: number;
  promptTokens: number;
  promptSpeed: number;
  outputTokens: number;
  outputSpeed: number;
  totalTimeMs: number;
  draftAcceptance: number;
  draftAccepted: number;
  draftGenerated: number;
  contextSize: number;
  truncated: boolean;
}

export interface GlobalMetrics {
  tasksCompleted: number;
  avgPromptSpeed: number;
  avgGenSpeed: number;
  totalPromptTokens: number;
  totalOutputTokens: number;
  avgDraftAcceptance: number;
  activeSlots: number;
}

export interface CacheMetrics {
  usedMiB: number;
  limitMiB: number;
  numPrompts: number;
}

const emitter = new EventEmitter();
emitter.setMaxListeners(10);

export function onMetricsChange(listener: () => void): () => void {
  emitter.on("change", listener);
  return () => { emitter.off("change", listener); };
}

const slots = new Map<number, SlotMetrics>();
const completedTasks: CompletedTask[] = [];
const MAX_COMPLETED_TASKS = 1000;
let cacheMetrics: CacheMetrics | null = null;
let ctxLimit: number | null = null;

interface GlobalAccum {
  count: number;
  totalPromptSpeed: number;
  totalGenSpeed: number;
  totalPromptTokens: number;
  totalOutputTokens: number;
  totalDraftAcceptance: number;
  draftCount: number;
}

const globalAccum: GlobalAccum = {
  count: 0,
  totalPromptSpeed: 0,
  totalGenSpeed: 0,
  totalPromptTokens: 0,
  totalOutputTokens: 0,
  totalDraftAcceptance: 0,
  draftCount: 0,
};

const launchRegex = /slot\s+launch_slot_: id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*processing task/;
const decodedRegex = /slot print_timing: id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*n_decoded\s*=\s*(\d+),\s*tg\s*=\s*([\d.]+)\s*t\/s/;
const promptProgressRegex = /slot print_timing: id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*prompt processing,\s*n_tokens\s*=\s*(\d+),\s*progress\s*=\s*([\d.]+),\s*t\s*=\s*[\d.]+\s*s\s*\/\s*([\d.]+)\s*tokens per second/;
const reasoningRegex = /reasoning-budget:\s*(activated|deactivated)/;
const promptEvalRegex = /slot print_timing: id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*prompt eval time\s*=\s*([\d.]+)\s*ms\s*\/\s*(\d+)\s*tokens\s*\(\s*([\d.]+)\s*ms per token,\s*([\d.]+)\s*tokens per second/;
const evalTimeRegex = /slot print_timing: id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*eval time\s*=\s*([\d.]+)\s*ms\s*\/\s*(\d+)\s*tokens\s*\(\s*([\d.]+)\s*ms per token,\s*([\d.]+)\s*tokens per second/;
const totalTimeRegex = /slot print_timing: id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*total time\s*=\s*([\d.]+)\s*ms\s*\/\s*(\d+)\s*tokens/;
const draftRegex = /slot print_timing: id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*draft acceptance\s*=\s*([\d.]+)\s*\(\s*(\d+)\s*accepted\s*\/\s*(\d+)\s*generated\)/;
const releaseRegex = /slot\s+release: id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*stop processing: n_tokens\s*=\s*(\d+),\s*truncated\s*=\s*(\d)/;
const cacheStateRegex = /cache state:\s*(\d+)\s+prompts,\s*([\d.]+)\s+MiB\s*\(limits:\s*([\d.]+)\s+MiB/;
const checkpointCreateRegex = /slot create_check: id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*created context checkpoint \d+ of \d+ \(pos_min\s*=\s*(\d+),\s*pos_max\s*=\s*\d+,\s*n_tokens\s*=\s*\d+,\s*size\s*=\s*([\d.]+)\s+MiB/;
const checkpointErasedRegex = /slot update_slots: id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*erased invalidated context checkpoint \(pos_min\s*=\s*(\d+)/;
const checkpointErasingOldRegex = /slot create_check: id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*erasing old context checkpoint \(pos_min\s*=\s*(\d+)/;
const nCtxRegex = /n_ctx\s*=\s*(\d+)/;

const taskAccumulators = new Map<number, Partial<CompletedTask>>();

function ensureSlot(slotId: number): SlotMetrics {
  if (!slots.has(slotId)) {
    slots.set(slotId, {
      slotId,
      state: "idle",
      taskId: null,
      generationSpeed: null,
      promptSpeed: null,
      promptProgress: null,
      contextSize: 0,
      ctxLimit: null,
      evaluatedTokens: null,
      promptTotalTokens: null,
      thinking: false,
      lastTask: null,
      checkpoints: [],
    });
  }
  const slot = slots.get(slotId)!;
  if (ctxLimit !== null && slot.ctxLimit === null) {
    slot.ctxLimit = ctxLimit;
  }
  return slot;
}

function notify() {
  emitter.emit("change");
}

export function processLine(line: string) {
  let m: RegExpMatchArray | null;

  if ((m = nCtxRegex.exec(line))) {
    const limit = parseInt(m[1]);
    if (limit > 0) {
      ctxLimit = limit;
      for (const slot of slots.values()) {
        slot.ctxLimit = limit;
      }
      notify();
    }
    return;
  }

  if ((m = line.match(cacheStateRegex))) {
    cacheMetrics = {
      numPrompts: parseInt(m[1]),
      usedMiB: parseFloat(m[2]),
      limitMiB: parseFloat(m[3]),
    };
    notify();
    return;
  }

  if ((m = line.match(checkpointCreateRegex))) {
    const slotId = parseInt(m[1]);
    const slot = ensureSlot(slotId);
    if (slot.taskId === null || slot.taskId !== parseInt(m[2])) return;
    const pos = parseInt(m[3]);
    const sizeMiB = parseFloat(m[4]);
    const existingIdx = slot.checkpoints.findIndex(cp => cp.pos === pos);
    if (existingIdx >= 0) {
      slot.checkpoints[existingIdx] = { pos, sizeMiB };
    } else {
      slot.checkpoints.push({ pos, sizeMiB });
    }
    notify();
    return;
  }

  if ((m = line.match(checkpointErasedRegex))) {
    const slotId = parseInt(m[1]);
    const slot = ensureSlot(slotId);
    if (slot.taskId === null || slot.taskId !== parseInt(m[2])) return;
    const pos = parseInt(m[3]);
    const idx = slot.checkpoints.findIndex(cp => cp.pos === pos);
    if (idx >= 0) {
      slot.checkpoints.splice(idx, 1);
    }
    notify();
    return;
  }

  if ((m = line.match(checkpointErasingOldRegex))) {
    const slotId = parseInt(m[1]);
    const slot = ensureSlot(slotId);
    if (slot.taskId === null || slot.taskId !== parseInt(m[2])) return;
    const pos = parseInt(m[3]);
    const idx = slot.checkpoints.findIndex(cp => cp.pos === pos);
    if (idx >= 0) {
      slot.checkpoints.splice(idx, 1);
    }
    notify();
    return;
  }

  if ((m = line.match(launchRegex))) {
    const slotId = parseInt(m[1]);
    const taskId = parseInt(m[2]);
    const slot = ensureSlot(slotId);
    slot.taskId = taskId;
    slot.state = "prompting";
    slot.thinking = false;
    slot.promptProgress = null;
    slot.generationSpeed = null;
    slot.promptSpeed = null;
    slot.evaluatedTokens = null;
    slot.promptTotalTokens = null;
    notify();
    return;
  }

  if ((m = line.match(decodedRegex))) {
    const slotId = parseInt(m[1]);
    const slot = ensureSlot(slotId);
    if (slot.taskId === null || slot.taskId !== parseInt(m[2])) return;
    const nDecoded = parseInt(m[3]);
    slot.state = "generating";
    slot.generationSpeed = parseFloat(m[4]);
    slot.evaluatedTokens = nDecoded;
    slot.promptTotalTokens = null;
    notify();
    return;
  }

  if ((m = line.match(promptProgressRegex))) {
    const slotId = parseInt(m[1]);
    const slot = ensureSlot(slotId);
    if (slot.taskId === null || slot.taskId !== parseInt(m[2])) return;
    const nTokens = parseInt(m[3]);
    const progress = parseFloat(m[4]);
    slot.state = "prompting";
    slot.promptProgress = progress;
    slot.promptSpeed = parseFloat(m[5]);
    slot.evaluatedTokens = nTokens;
    slot.promptTotalTokens = progress > 0 ? Math.ceil(nTokens / progress) : nTokens;
    notify();
    return;
  }

  if ((m = line.match(reasoningRegex))) {
    const activated = m[1] === "activated";
    for (const slot of slots.values()) {
      if (slot.state !== "idle") {
        slot.thinking = activated;
      }
    }
    notify();
    return;
  }

  if ((m = line.match(promptEvalRegex))) {
    const slotId = parseInt(m[1]);
    const taskId = parseInt(m[2]);
    const acc = taskAccumulators.get(taskId) || {};
    acc.slotId = slotId;
    acc.taskId = taskId;
    acc.promptTokens = parseInt(m[4]);
    acc.promptSpeed = parseFloat(m[6]);
    taskAccumulators.set(taskId, acc);
    const slot = ensureSlot(slotId);
    if (slot.taskId === taskId) {
      slot.promptSpeed = parseFloat(m[6]);
    }
    return;
  }

  if ((m = line.match(evalTimeRegex))) {
    const taskId = parseInt(m[2]);
    const acc = taskAccumulators.get(taskId) || {};
    acc.outputTokens = parseInt(m[4]);
    acc.outputSpeed = parseFloat(m[6]);
    taskAccumulators.set(taskId, acc);
    return;
  }

  if ((m = line.match(totalTimeRegex))) {
    const taskId = parseInt(m[2]);
    const acc = taskAccumulators.get(taskId) || {};
    acc.totalTimeMs = parseFloat(m[3]);
    taskAccumulators.set(taskId, acc);
    return;
  }

  if ((m = line.match(draftRegex))) {
    const taskId = parseInt(m[2]);
    const acc = taskAccumulators.get(taskId) || {};
    acc.draftAcceptance = parseFloat(m[3]);
    acc.draftAccepted = parseInt(m[4]);
    acc.draftGenerated = parseInt(m[5]);
    taskAccumulators.set(taskId, acc);
    return;
  }

  if ((m = line.match(releaseRegex))) {
    const slotId = parseInt(m[1]);
    const taskId = parseInt(m[2]);
    const ctxSize = parseInt(m[3]);
    const truncated = m[4] !== "0";

    const acc = taskAccumulators.get(taskId) || {};
    acc.contextSize = ctxSize;
    acc.truncated = truncated;

    const completed: CompletedTask = {
      taskId: acc.taskId ?? taskId,
      slotId: acc.slotId ?? slotId,
      promptTokens: acc.promptTokens ?? 0,
      promptSpeed: acc.promptSpeed ?? 0,
      outputTokens: acc.outputTokens ?? 0,
      outputSpeed: acc.outputSpeed ?? 0,
      totalTimeMs: acc.totalTimeMs ?? 0,
      draftAcceptance: acc.draftAcceptance ?? 0,
      draftAccepted: acc.draftAccepted ?? 0,
      draftGenerated: acc.draftGenerated ?? 0,
      contextSize: ctxSize,
      truncated,
    };

    completedTasks.push(completed);
    if (completedTasks.length > MAX_COMPLETED_TASKS) {
      completedTasks.splice(0, completedTasks.length - MAX_COMPLETED_TASKS);
    }

    globalAccum.count++;
    globalAccum.totalPromptSpeed += completed.promptSpeed;
    globalAccum.totalGenSpeed += completed.outputSpeed;
    globalAccum.totalPromptTokens += completed.promptTokens;
    globalAccum.totalOutputTokens += completed.outputTokens;
    if (completed.draftGenerated > 0) {
      globalAccum.totalDraftAcceptance += completed.draftAcceptance;
      globalAccum.draftCount++;
    }

    taskAccumulators.delete(taskId);

    const slot = ensureSlot(slotId);
    slot.state = "idle";
    slot.taskId = null;
    slot.generationSpeed = null;
    slot.promptSpeed = null;
    slot.promptProgress = null;
    slot.evaluatedTokens = null;
    slot.promptTotalTokens = null;
    slot.contextSize = ctxSize;
    slot.lastTask = completed;
    notify();
  }
}

export function reset() {
  slots.clear();
  completedTasks.length = 0;
  taskAccumulators.clear();
  cacheMetrics = null;
  ctxLimit = null;
  globalAccum.count = 0;
  globalAccum.totalPromptSpeed = 0;
  globalAccum.totalGenSpeed = 0;
  globalAccum.totalPromptTokens = 0;
  globalAccum.totalOutputTokens = 0;
  globalAccum.totalDraftAcceptance = 0;
  globalAccum.draftCount = 0;
  notify();
}

export function getSlots(): SlotMetrics[] {
  return Array.from(slots.values()).sort((a, b) => a.slotId - b.slotId);
}

export function getGlobal(): GlobalMetrics | null {
  if (globalAccum.count === 0) return null;

  const activeSlots = Array.from(slots.values()).filter(s => s.state !== "idle").length;

  return {
    tasksCompleted: globalAccum.count,
    avgPromptSpeed: globalAccum.totalPromptSpeed / globalAccum.count,
    avgGenSpeed: globalAccum.totalGenSpeed / globalAccum.count,
    totalPromptTokens: globalAccum.totalPromptTokens,
    totalOutputTokens: globalAccum.totalOutputTokens,
    avgDraftAcceptance: globalAccum.draftCount > 0
      ? globalAccum.totalDraftAcceptance / globalAccum.draftCount
      : 0,
    activeSlots,
  };
}

export function getCache(): CacheMetrics | null {
  return cacheMetrics;
}
