import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import path from "path";
import fs from "fs-extra";
import { ConfigData, getVersionsDir, getLogFile, getActivePresets, getActiveFreeFormArgs } from "./config.js";

let serverProcess: ChildProcess | null = null;
let serverStartTime: number | null = null;

const logEmitter = new EventEmitter();
logEmitter.setMaxListeners(10);

const MAX_LOG_LINES = 2000;
export const serverLogLines: string[] = [];

export function onServerLog(listener: (line: string) => void): () => void {
  logEmitter.on("log", listener);
  return () => { logEmitter.off("log", listener); };
}

export function clearServerLogs() {
  serverLogLines.length = 0;
}

interface ServerStatus {
  running: boolean;
  pid: number | null;
  uptime: number;
}


export function startServer(config: ConfigData): Promise<number> {
  return new Promise(async (resolve, reject) => {
    if (serverProcess?.pid) {
      reject(new Error("Server already running"));
      return;
    }

    const versionsDir = getVersionsDir(config);
    const activeVersion = config.activeVersion;
    if (!activeVersion) {
      reject(new Error("No active version selected"));
      return;
    }

    const binary = path.join(versionsDir, activeVersion, "llama-server");
    const exists = await fs.pathExists(binary);
    if (!exists) {
      reject(new Error(`Binary not found: ${binary}`));
      return;
    }

    const logFile = getLogFile(config);
    await fs.ensureDir(path.dirname(logFile));
    const logStream = await fs.createWriteStream(logFile, { flags: "a" });

    const args = buildArgs(config);
    serverStartTime = Date.now();
    serverProcess = spawn(binary, args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    serverProcess.stdout?.pipe(logStream);
    serverProcess.stderr?.pipe(logStream);

    const relay = (stream: NodeJS.ReadableStream | null) => {
      let buf = "";
      stream?.on("data", (chunk: Buffer) => {
        buf += chunk.toString();
        const parts = buf.split("\n");
        buf = parts.pop() || "";
        for (const part of parts) {
          if (part.length > 0) {
            serverLogLines.push(part);
            if (serverLogLines.length > MAX_LOG_LINES) {
              serverLogLines.splice(0, serverLogLines.length - MAX_LOG_LINES);
            }
            logEmitter.emit("log", part);
          }
        }
      });
    };
    relay(serverProcess.stdout);
    relay(serverProcess.stderr);

    serverProcess.on("error", (err) => reject(err));
    serverProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        // Server exited with error
      }
    });

    resolve(serverProcess.pid!);
  });
}

export function stopServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!serverProcess?.pid) {
      resolve();
      return;
    }

    const pid = serverProcess.pid;
    serverProcess.on("exit", () => {
      serverProcess = null;
      serverStartTime = null;
      resolve();
    });

    serverProcess.kill("SIGTERM");

    setTimeout(() => {
      if (serverProcess?.pid === pid) {
        serverProcess.kill("SIGKILL");
      }
    }, 5000);
  });
}

export function getStatus(): ServerStatus {
  return {
    running: !!(serverProcess?.pid && !serverProcess.killed),
    pid: serverProcess?.pid || null,
    uptime: serverProcess?.pid && serverStartTime ? Date.now() - serverStartTime : 0,
  };
}

export function buildArgs(config: ConfigData): string[] {
  const args: string[] = [];
  const p = getActivePresets(config);

  const push = (flag: string, value: unknown) => {
    if (value === null || value === undefined) return;
    if (typeof value === "boolean") {
      if (value) args.push(flag);
      return;
    }
    args.push(flag, String(value));
  };

  push("--host", p.server.host);
  push("--port", p.server.port);
  push("--parallel", p.server.parallel);
  push("--timeout", p.server.timeout);
  push("--api-key", p.server.apiKey);
  push("--threads-http", p.server.threadsHttp);
  if (p.server.contBatching === false) args.push("--no-cont-batching");
  if (p.server.cachePrompt === false) args.push("--no-cache-prompt");
  if (p.server.metrics) args.push("--metrics");
  if (p.server.ui === false) args.push("--no-ui");
  if (p.server.embedding) args.push("--embedding");
  if (p.server.rerank) args.push("--rerank");

  push("--model", p.model.model);
  push("--lora", p.model.lora);
  push("--hf-repo", p.model.hfRepo);
  push("--hf-token", config.hfToken);
  push("--chat-template", p.model.chatTemplate);
  if (p.model.jinja === false) args.push("--no-jinja");

  push("--threads", p.compute.threads);
  push("--threads-batch", p.compute.threadsBatch);
  push("--ctx-size", p.compute.ctxSize);
  push("--batch-size", p.compute.batchSize);
  push("--ubatch-size", p.compute.ubatchSize);
  push("--flash-attn", p.compute.flashAttn);
  if (p.compute.mlock) args.push("--mlock");
  if (p.compute.mmap === false) args.push("--no-mmap");
  push("--cache-type-k", p.compute.cacheTypeK);
  push("--cache-type-v", p.compute.cacheTypeV);

  if (p.gpu.gpuLayers && p.gpu.gpuLayers !== "auto") push("--gpu-layers", p.gpu.gpuLayers);
  push("--split-mode", p.gpu.splitMode);
  push("--tensor-split", p.gpu.tensorSplit);
  push("--main-gpu", p.gpu.mainGpu);
  push("--device", p.gpu.device);
  push("--fit", p.gpu.fit);

  push("--seed", p.sampling.seed);
  push("--temperature", p.sampling.temperature);
  push("--top-k", p.sampling.topK);
  push("--top-p", p.sampling.topP);
  push("--min-p", p.sampling.minP);
  push("--repeat-last-n", p.sampling.repeatLastN);
  push("--repeat-penalty", p.sampling.repeatPenalty);
  push("--presence-penalty", p.sampling.presencePenalty);
  push("--frequency-penalty", p.sampling.frequencyPenalty);
  push("--grammar", p.sampling.grammar);
  push("--json-schema", p.sampling.jsonSchema);
  if (p.sampling.ignoreEos) args.push("--ignore-eos");

  push("--spec-draft-model", p.speculative.draftModel);
  push("--spec-type", p.speculative.specType);
  push("--spec-draft-n-max", p.speculative.draftNMax);
  push("--spec-draft-threads", p.speculative.draftThreads);
  if (p.speculative.draftGpuLayers && p.speculative.draftGpuLayers !== "auto") push("--spec-draft-ngl", p.speculative.draftGpuLayers);

  push("--reasoning", p.reasoning.reasoning);
  push("--reasoning-budget", p.reasoning.reasoningBudget);
  if (p.reasoning.reasoningFormat && p.reasoning.reasoningFormat !== "auto") push("--reasoning-format", p.reasoning.reasoningFormat);

  push("--log-file", getLogFile(config));
  push("--log-verbosity", p.logging.logVerbosity);
  push("--log-colors", p.logging.logColors);
  if (p.logging.logTimestamps === false) args.push("--no-log-timestamps");

  for (const arg of getActiveFreeFormArgs(config)) {
    if (arg.trim()) {
      args.push(...arg.trim().split(/\s+/));
    }
  }

  return args;
}
