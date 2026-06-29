import { spawn, ChildProcess, spawnSync } from "child_process";
import { EventEmitter } from "events";
import path from "path";
import os from "os";
import fs from "fs-extra";
import { ConfigData, PRESET_CATEGORIES, getVersionsDir, getLogFile, getActivePresets, getActiveFreeFormArgs } from "./config";
import { logParser } from "./logparser";
import { processLine as processMetricLine, reset as resetMetrics } from "./metricstracker";
import { processModelLine, resetModelInfo } from "../ui/specialized/LoadedModelPanel";
import { taskStore } from "./tasks";

function resolveServerBinary(versionPath: string): string | null {
  if (os.platform() === "win32") {
    const winBin = path.join(versionPath, "llama-server.exe");
    return fs.pathExistsSync(winBin) ? winBin : null;
  }
  const unixBin = path.join(versionPath, "llama-server");
  return fs.pathExistsSync(unixBin) ? unixBin : null;
}

let serverProcess: ChildProcess | null = null;
let serverStartTime: number | null = null;

// Mutex to serialize start/stop operations
let serverMutex: Promise<void> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const lock = new Promise<void>((resolve) => { release = resolve; });
  const prev = serverMutex;
  serverMutex = prev.then(() => lock);
  return prev.then(() => fn()).finally(() => release());
}

const logEmitter = new EventEmitter();
logEmitter.setMaxListeners(10);

const statusEmitter = new EventEmitter();
statusEmitter.setMaxListeners(10);

const MAX_LOG_LINES = 2000;
export const serverLogLines: string[] = [];
let maxLogLines = MAX_LOG_LINES;
export function setMaxLogLines(n: number): void {
  maxLogLines = Math.max(1, n);
}

export function onServerLog(listener: (line: string) => void): () => void {
  logEmitter.on("log", listener);
  return () => { logEmitter.off("log", listener); };
}

export function onServerStatusChange(listener: () => void): () => void {
  statusEmitter.on("change", listener);
  return () => { statusEmitter.off("change", listener); };
}

export function listDevices(config: ConfigData): string {
  const versionsDir = getVersionsDir(config);
  const activeVersion = config.activeVersion;
  if (!activeVersion) return "No active version selected";
  const versionPath = path.join(versionsDir, activeVersion);
  const binary = resolveServerBinary(versionPath);
  if (!binary) return `Binary not found in ${versionPath}`;
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
  return withLock(async () => {
    resetMetrics();
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

      const versionPath = path.join(versionsDir, activeVersion);
      const binary = resolveServerBinary(versionPath);
      if (!binary) {
        reject(new Error(`Binary not found in ${versionPath}`));
        return;
      }

      const logFile = getLogFile(config);
      await fs.ensureDir(path.dirname(logFile));
      taskStore.setLogFile(logFile);
      const logStream = await fs.createWriteStream(logFile, { flags: "a" });

      const args = buildArgs(config, logFile);
      serverStartTime = Date.now();
      serverProcess = spawn(binary, args, {
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
        windowsHide: true,
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
              if (serverLogLines.length > maxLogLines) {
                serverLogLines.splice(0, serverLogLines.length - maxLogLines);
              }
              logEmitter.emit("log", part);
              logParser.processLine(part);
              processMetricLine(part);
              processModelLine(part);
            }
          }
        });
      };
      relay(serverProcess.stdout);
      relay(serverProcess.stderr);

      statusEmitter.emit("change");
      serverProcess.on("error", (err) => reject(err));
      serverProcess.on("exit", (code, signal) => {
        const wasRunning = serverProcess !== null;
        serverProcess = null;
        serverStartTime = null;
        if (wasRunning) {
          resetMetrics();
          resetModelInfo();
        }
        if (wasRunning && code !== 0 && code !== null) {
          serverLogLines.push(`[server] Process exited with code ${code}`);
          logEmitter.emit("log", `[server] Process exited with code ${code}`);
        }
        if (wasRunning && signal && signal !== "SIGTERM" && signal !== "SIGKILL") {
          serverLogLines.push(`[server] Process terminated by signal ${signal}`);
          logEmitter.emit("log", `[server] Process terminated by signal ${signal}`);
        }
        if (wasRunning) {
          statusEmitter.emit("change");
        }
      });

      resolve(serverProcess.pid!);
    });
  });
}

export function stopServer(): Promise<void> {
  return withLock(() => new Promise((resolve) => {
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
  }));
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

export function buildArgs(config: ConfigData, logFile: string): string[] {
  const args: string[] = [];
  const p = getActivePresets(config);

  // Non-schema args
  if (config.hfToken) args.push("--hf-token", config.hfToken);
  args.push("--log-file", logFile);
  args.push("--log-verbosity", "4");

  // Iterate schema to build args
  for (const cat of PRESET_CATEGORIES) {
    const presetData = p[cat.presetKey];
    for (const field of cat.fields) {
      const value = presetData[field.key];

      // Skip null/undefined/empty
      if (value === null || value === undefined) continue;
      if (typeof value === "string" && value.length === 0) continue;

      // Skip sentinel values
      if (field.skipValue !== undefined && value === field.skipValue) continue;

      if (typeof value === "boolean") {
        if (field.negate) {
          // default=true: push --no-X when false
          if (!value) args.push(`--no-${field.flag.substring(2)}`);
        } else {
          // default=false: push --X when true
          if (value) args.push(field.flag);
        }
      } else {
        args.push(field.flag, String(value));
      }
    }
  }

  // Free-form args
  for (const arg of getActiveFreeFormArgs(config)) {
    if (arg.trim()) {
      args.push(...arg.trim().split(/\s+/));
    }
  }

  return args;
}
