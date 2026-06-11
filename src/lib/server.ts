import { spawn, ChildProcess, spawnSync } from "child_process";
import { EventEmitter } from "events";
import path from "path";
import fs from "fs-extra";
import { ConfigData, getVersionsDir, getLogFile, getActivePresets, getActiveFreeFormArgs } from "./config.js";
import { logParser } from "./logparser.js";

let serverProcess: ChildProcess | null = null;
let serverStartTime: number | null = null;

const logEmitter = new EventEmitter();
logEmitter.setMaxListeners(10);

const statusEmitter = new EventEmitter();
statusEmitter.setMaxListeners(10);

const MAX_LOG_LINES = 2000;
export const serverLogLines: string[] = [];

export function onServerLog(listener: (line: string) => void): () => void {
  logEmitter.on("log", listener);
  return () => { logEmitter.off("log", listener); };
}

export function onServerStatusChange(listener: () => void): () => void {
  statusEmitter.on("change", listener);
  return () => { statusEmitter.off("change", listener); };
}

export function clearServerLogs() {
  serverLogLines.length = 0;
}

export function listDevices(config: ConfigData): string {
  const versionsDir = getVersionsDir(config);
  const activeVersion = config.activeVersion;
  if (!activeVersion) return "No active version selected";
  const binary = path.join(versionsDir, activeVersion, "llama-server");
  const exists = fs.pathExistsSync(binary);
  if (!exists) return `Binary not found: ${binary}`;
  try {
    const result = spawnSync(binary, ["--list-devices"], {
      encoding: "utf-8",
      timeout: 10000,
    });
    const out = (result.stdout || "").trim();
    const err = (result.stderr || "").trim();
    const combined = [out, err].filter(Boolean).join("\n");
    return combined || "No output from --list-devices";
  } catch (err: any) {
    return err.message || "Failed to list devices";
  }
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
            logParser.processLine(part);
          }
        }
      });
    };
    relay(serverProcess.stdout);
    relay(serverProcess.stderr);

    serverProcess.on("error", (err) => reject(err));
    serverProcess.on("exit", (code, signal) => {
      const wasRunning = serverProcess !== null;
      serverProcess = null;
      serverStartTime = null;
      if (wasRunning) {
        statusEmitter.emit("change");
      }
      if (wasRunning && code !== 0 && code !== null) {
        serverLogLines.push(`[server] Process exited with code ${code}`);
        logEmitter.emit("log", `[server] Process exited with code ${code}`);
      }
      if (wasRunning && signal && signal !== "SIGTERM" && signal !== "SIGKILL") {
        serverLogLines.push(`[server] Process terminated by signal ${signal}`);
        logEmitter.emit("log", `[server] Process terminated by signal ${signal}`);
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
  if (!serverProcess?.pid) {
    return { running: false, pid: null, uptime: 0 };
  }

  let alive = false;
  try {
    process.kill(serverProcess.pid, 0);
    alive = true;
  }
  catch {
    alive = false;
  }

  return {
    running: alive,
    pid: serverProcess.pid,
    uptime: alive && serverStartTime ? Date.now() - serverStartTime : 0,
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
    const s = String(value);
    if (s.length === 0) return;
    args.push(flag, s);
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
  push("--predict", p.server.predict);
  push("--cache-reuse", p.server.cacheReuse);
  push("--cache-ram", p.server.cacheRam);
  if (p.server.kvUnified === false) args.push("--no-kv-unified");
  if (p.server.cacheIdleSlots === false) args.push("--no-cache-idle-slots");
  push("--ctx-checkpoints", p.server.ctxCheckpoints);
  push("--checkpoint-every-n-tokens", p.server.checkpointEveryN);
  if (p.server.contextShift) args.push("--context-shift");
  if (p.server.warmup === false) args.push("--no-warmup");
  if (p.server.special) args.push("--special");
  if (p.server.skipChatParsing) args.push("--skip-chat-parsing");
  if (p.server.prefillAssistant === false) args.push("--no-prefill-assistant");
  push("--slot-prompt-similarity", p.server.slotPromptSim);
  push("--slot-save-path", p.server.slotSavePath);
  if (p.server.reusePort) args.push("--reuse-port");
  if (p.server.props) args.push("--props");
  if (p.server.noSlots) args.push("--no-slots");
  push("--sleep-idle-seconds", p.server.sleepIdle);
  push("--tools", p.server.tools);
  if (p.server.uiMcpProxy) args.push("--ui-mcp-proxy");
  push("--media-path", p.server.mediaPath);
  push("--alias", p.server.alias);
  push("--api-key-file", p.server.apiKeyFile);
  push("--ssl-key-file", p.server.sslKeyFile);
  push("--ssl-cert-file", p.server.sslCertFile);
  push("--path", p.server.path);
  push("--api-prefix", p.server.apiPrefix);

  push("--model", p.model.model);
  push("--lora", p.model.lora);
  push("--hf-repo", p.model.hfRepo);
  push("--hf-token", config.hfToken);
  push("--chat-template", p.model.chatTemplate);
  if (p.model.jinja === false) args.push("--no-jinja");
  push("--mmproj", p.model.mmproj);
  if (p.model.mmprojAuto === false) args.push("--no-mmproj-auto");
  if (p.model.mmprojOffload === false) args.push("--no-mmproj-offload");
  push("--chat-template-file", p.model.chatTemplateFile);
  push("--chat-template-kwargs", p.model.chatTemplateKwargs);
  push("--lora-scaled", p.model.loraScaled);
  if (p.model.loraInitWithoutApply) args.push("--lora-init-without-apply");
  push("--model-url", p.model.modelUrl);
  push("--docker-repo", p.model.dockerRepo);

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
  if (p.compute.cpuMoe) args.push("--cpu-moe");
  if (p.compute.noKvOffload) args.push("--no-kv-offload");
  if (p.compute.noHost) args.push("--no-host");
  if (p.compute.directIo) args.push("--direct-io");
  push("--numa", p.compute.numa);
  push("--rope-scaling", p.compute.ropeScaling);
  push("--rope-freq-scale", p.compute.ropeFreqScale);
  push("--rope-freq-base", p.compute.ropeFreqBase);

  if (p.gpu.gpuLayers && p.gpu.gpuLayers !== "auto") push("--gpu-layers", p.gpu.gpuLayers);
  push("--split-mode", p.gpu.splitMode);
  push("--tensor-split", p.gpu.tensorSplit);
  push("--main-gpu", p.gpu.mainGpu);
  push("--device", p.gpu.device);
  push("--fit", p.gpu.fit);
  push("--fit-target", p.gpu.fitTarget);
  push("--fit-ctx", p.gpu.fitCtx);
  push("--override-tensor", p.gpu.overrideTensor);

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
  push("--typical-p", p.sampling.typicalP);
  push("--top-n-sigma", p.sampling.topNSigma);
  push("--xtc-probability", p.sampling.xtcProbability);
  push("--xtc-threshold", p.sampling.xtcThreshold);
  push("--dry-multiplier", p.sampling.dryMultiplier);
  push("--dry-base", p.sampling.dryBase);
  push("--dynatemp-range", p.sampling.dynatempRange);
  push("--dynatemp-exp", p.sampling.dynatempExp);
  push("--mirostat", p.sampling.mirostat);
  push("--mirostat-ent", p.sampling.mirostatEnt);
  push("--mirostat-lr", p.sampling.mirostatLr);
  push("--logit-bias", p.sampling.logitBias);
  push("--grammar-file", p.sampling.grammarFile);
  push("--json-schema-file", p.sampling.jsonSchemaFile);
  if (p.sampling.backendSampling) args.push("--backend-sampling");
  push("--adaptive-target", p.sampling.adaptiveTarget);
  push("--adaptive-decay", p.sampling.adaptiveDecay);
  push("--sampling-seq", p.sampling.samplingSeq);

  push("--spec-draft-model", p.speculative.draftModel);
  push("--spec-type", p.speculative.specType);
  push("--spec-draft-n-max", p.speculative.draftNMax);
  push("--spec-draft-threads", p.speculative.draftThreads);
  if (p.speculative.draftGpuLayers && p.speculative.draftGpuLayers !== "auto") push("--spec-draft-ngl", p.speculative.draftGpuLayers);
  push("--spec-draft-n-min", p.speculative.draftNMin);
  push("--spec-draft-p-split", p.speculative.draftPSplit);
  push("--spec-draft-p-min", p.speculative.draftPMin);
  push("--spec-draft-hf-repo", p.speculative.draftHfRepo);
  push("--cache-type-k-draft", p.speculative.draftCacheTypeK);
  push("--cache-type-v-draft", p.speculative.draftCacheTypeV);

  push("--reasoning", p.reasoning.reasoning);
  push("--reasoning-budget", p.reasoning.reasoningBudget);
  if (p.reasoning.reasoningFormat && p.reasoning.reasoningFormat !== "auto") push("--reasoning-format", p.reasoning.reasoningFormat);
  push("--reasoning-budget-message", p.reasoning.reasoningBudgetMessage);

  push("--log-file", getLogFile(config));
  push("--log-verbosity", p.logging.logVerbosity);
  push("--log-colors", p.logging.logColors);
  if (p.logging.logTimestamps === false) args.push("--no-log-timestamps");
  if (p.logging.logPrefix) args.push("--log-prefix");

  for (const arg of getActiveFreeFormArgs(config)) {
    if (arg.trim()) {
      args.push(...arg.trim().split(/\s+/));
    }
  }

  return args;
}
