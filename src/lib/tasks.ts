import fs from "fs-extra";
import path from "path";
import Database from "better-sqlite3";
import { ConfigData, getTasksFile, getTasksDb, getLogsDir } from "./config";

function findLatestLogFile(config: ConfigData): string | null {
  if (config.server.logFile) return config.server.logFile;
  const logsDir = getLogsDir();
  if (!fs.pathExistsSync(logsDir)) return null;
  const files = fs.readdirSync(logsDir)
    .filter((f: string) => /^server\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.log$/.test(f))
    .sort();
  if (files.length === 0) return null;
  return path.join(logsDir, files[files.length - 1]);
}
import { TaskMetrics, SpeedSample, logParser } from "./logparser";
export type { TaskMetrics, SpeedSample } from "./logparser";
import { EventEmitter } from "events";

export interface TaskFilter {
  slotId?: number;
  dateFrom?: Date;
  dateTo?: Date;
  minOutputTokens?: number;
  maxOutputTokens?: number;
  minSpeed?: number;
  maxSpeed?: number;
  taskId?: number;
  minCacheHitRatio?: number;
  maxCtxSize?: number;
}

export type TaskSortField = "taskId" | "timestamp" | "slotId" | "promptSpeed" | "outputSpeed" | "totalTimeMs" | "promptTokens" | "outputTokens" | "pendingTokens" | "nCtxSlot" | "cachedPromptTokens" | "promptMsPerToken" | "outputMsPerToken" | "ttsMs" | "draftMeanAcceptLen" | "slotSimilarity";
export type TaskSortDir = "asc" | "desc";

const SORT_FIELD_MAP: Record<TaskSortField, string> = {
  taskId: "task_id",
  timestamp: "timestamp",
  slotId: "slot_id",
  promptSpeed: "prompt_speed",
  outputSpeed: "output_speed",
  totalTimeMs: "total_time_ms",
  promptTokens: "prompt_tokens",
  outputTokens: "output_tokens",
  pendingTokens: "pending_tokens",
  nCtxSlot: "n_ctx_slot",
  cachedPromptTokens: "cached_prompt_tokens",
  promptMsPerToken: "prompt_ms_per_token",
  outputMsPerToken: "output_ms_per_token",
  ttsMs: "tts_ms",
  draftMeanAcceptLen: "draft_mean_accept_len",
  slotSimilarity: "slot_similarity",
};

class TaskStore extends EventEmitter {
  private db: Database.Database | null = null;
  private config: ConfigData | null = null;
  private stopTailer: (() => void) | null = null;

  private stmts = {
    insertTask: null as Database.Statement | null,
    insertSpeedSample: null as Database.Statement | null,
    upsertStats: null as Database.Statement | null,
    getCache: null as Database.Statement | null,
  };

  private getStmts() {
    if (this.stmts.insertTask) return this.stmts;
    this.stmts.insertTask = this.db!.prepare(`
      INSERT OR REPLACE INTO tasks (
        task_id, slot_id, timestamp, profile, model, version,
        prompt_tokens, prompt_time_ms, prompt_speed,
        output_tokens, eval_time_ms, output_speed,
        total_tokens, total_time_ms,
        draft_accepted, draft_generated,
        context_size, truncated, graphs_reused,
        pending_tokens, n_ctx_slot, cached_prompt_tokens,
        prompt_ms_per_token, output_ms_per_token, tts_ms,
        draft_mean_accept_len, slot_similarity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.stmts.insertSpeedSample = this.db!.prepare(`
      INSERT INTO task_speed_samples (task_id, phase, position, speed_tps, ms_per_token, elapsed_s)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    this.stmts.upsertStats = this.db!.prepare("INSERT OR REPLACE INTO stats_cache (key, value) VALUES (?, ?)");
    this.stmts.getCache = this.db!.prepare("SELECT value FROM stats_cache WHERE key = ?");
    return this.stmts;
  }

  async init(config: ConfigData) {
    this.config = config;
    const dbPath = getTasksDb(config);
    await fs.ensureDir(path.dirname(dbPath));

    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");

    this.createTables();
    this.migrateJsonl(getTasksFile(config));
    this.getStmts();

    logParser.seedCompleted(this.getAllTaskIds());
    logParser.setConfig(config);

    const latestLog = findLatestLogFile(config);
    if (latestLog) {
      await logParser.parseExistingFile(latestLog);
    }

    // Clear completed IDs so live tailing only tracks tasks in the current session.
    // Task IDs are not unique across server restarts, so keeping old IDs would
    // cause new tasks with reused IDs to be silently skipped.
    logParser.clearCompleted();

    this.emit("updated");
  }

  setLogFile(logFile: string) {
    if (this.stopTailer) {
      this.stopTailer();
    }
    this.stopTailer = logParser.startFileTailer(logFile);
  }

  private createTables() {
    this.db!.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        rowid INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER UNIQUE,
        slot_id INTEGER,
        timestamp TEXT,
        profile TEXT,
        model TEXT,
        version TEXT,
        prompt_tokens INTEGER,
        prompt_time_ms REAL,
        prompt_speed REAL,
        output_tokens INTEGER,
        eval_time_ms REAL,
        output_speed REAL,
        total_tokens INTEGER,
        total_time_ms REAL,
        draft_accepted INTEGER,
        draft_generated INTEGER,
        context_size INTEGER,
        truncated INTEGER,
        graphs_reused INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_timestamp ON tasks(timestamp);
      CREATE INDEX IF NOT EXISTS idx_tasks_slot_id ON tasks(slot_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_model ON tasks(model);
      CREATE TABLE IF NOT EXISTS stats_cache (
        key TEXT PRIMARY KEY,
        value REAL
      );
      CREATE TABLE IF NOT EXISTS task_speed_samples (
        rowid INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL REFERENCES tasks(task_id),
        phase TEXT NOT NULL CHECK(phase IN ('prompt', 'generation')),
        position INTEGER NOT NULL,
        speed_tps REAL NOT NULL,
        ms_per_token REAL DEFAULT 0,
        elapsed_s REAL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_samples_task ON task_speed_samples(task_id, phase, position);
      CREATE INDEX IF NOT EXISTS idx_samples_task_id ON task_speed_samples(task_id);
    `);

    this.migrateColumns();

    const cnt = this.db!.prepare("SELECT COUNT(*) as cnt FROM stats_cache").get() as { cnt: number };
    if (cnt.cnt === 0) {
      this.rebuildStats();
    }
  }

  private migrateColumns() {
    const columns = [
      "pending_tokens INTEGER DEFAULT 0",
      "n_ctx_slot INTEGER DEFAULT 0",
      "cached_prompt_tokens INTEGER DEFAULT 0",
      "prompt_ms_per_token REAL DEFAULT 0",
      "output_ms_per_token REAL DEFAULT 0",
      "tts_ms REAL DEFAULT 0",
      "draft_mean_accept_len REAL DEFAULT 0",
      "slot_similarity REAL DEFAULT 0",
    ];
    for (const col of columns) {
      try {
        this.db!.exec(`ALTER TABLE tasks ADD COLUMN ${col}`);
      } catch {
        /* column already exists */
      }
    }
  }

  private migrateJsonl(jsonlPath: string) {
    if (!this.db) return;

    if (!fs.pathExistsSync(jsonlPath)) return;

    const existing = this.db.prepare("SELECT COUNT(*) as cnt FROM tasks").get() as { cnt: number };
    if (existing.cnt > 0) {
      fs.removeSync(jsonlPath);
      return;
    }

    const content = fs.readFileSync(jsonlPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    if (lines.length === 0) {
      fs.removeSync(jsonlPath);
      return;
    }

    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO tasks (
        task_id, slot_id, timestamp, profile, model, version,
        prompt_tokens, prompt_time_ms, prompt_speed,
        output_tokens, eval_time_ms, output_speed,
        total_tokens, total_time_ms,
        draft_accepted, draft_generated,
        context_size, truncated, graphs_reused
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const ins = this.db.transaction(() => {
      for (const line of lines) {
        const t = JSON.parse(line) as TaskMetrics;
        insert.run(
          t.taskId, t.slotId, t.timestamp,
          t.profile ?? null, t.model ?? null, t.version ?? null,
          t.promptTokens, t.promptTimeMs, t.promptSpeed,
          t.outputTokens, t.evalTimeMs, t.outputSpeed,
          t.totalTokens, t.totalTimeMs,
          t.draftAccepted ?? 0, t.draftGenerated ?? 0,
          t.contextSize, t.truncated ? 1 : 0, t.graphsReused ?? 0,
        );
      }
    });

    ins();
    this.rebuildStats();
    fs.removeSync(jsonlPath);
  }

  private rebuildStats() {
    if (!this.db) return;
    const row = this.db.prepare(`
      SELECT
        COUNT(*) as cnt,
        COALESCE(SUM(prompt_tokens), 0) as pt,
        COALESCE(SUM(prompt_time_ms), 0) as ptm,
        COALESCE(SUM(output_tokens), 0) as ot,
        COALESCE(SUM(eval_time_ms), 0) as etm,
        COALESCE(SUM(draft_accepted), 0) as da,
        COALESCE(SUM(draft_generated), 0) as dg
      FROM tasks
    `).get() as { cnt: number; pt: number; ptm: number; ot: number; etm: number; da: number; dg: number };

    const upsert = this.db.prepare("INSERT OR REPLACE INTO stats_cache (key, value) VALUES (?, ?)");
    upsert.run("total_count", row.cnt);
    upsert.run("total_prompt_tokens", row.pt);
    upsert.run("total_prompt_time_ms", row.ptm);
    upsert.run("total_output_tokens", row.ot);
    upsert.run("total_eval_time_ms", row.etm);
    upsert.run("total_draft_accepted", row.da);
    upsert.run("total_draft_generated", row.dg);
  }

  private getAllTaskIds(): number[] {
    if (!this.db) return [];
    const rows = this.db.prepare("SELECT task_id FROM tasks").all() as { task_id: number }[];
    return rows.map(r => r.task_id);
  }

  private getCacheValue(key: string): number {
    if (!this.db) return 0;
    const gc = this.getStmts().getCache!;
    const row = gc.get(key) as { value: number } | undefined;
    return row ? row.value : 0;
  }

  onTask(task: TaskMetrics) {
    if (!this.db) return;
    const s = this.getStmts();
    const ins = s.insertTask!;
    const ups = s.upsertStats!;
    const gc = s.getCache!;

    ins.run(
      task.taskId, task.slotId, task.timestamp,
      task.profile ?? null, task.model ?? null, task.version ?? null,
      task.promptTokens, task.promptTimeMs, task.promptSpeed,
      task.outputTokens, task.evalTimeMs, task.outputSpeed,
      task.totalTokens, task.totalTimeMs,
      task.draftAccepted ?? 0, task.draftGenerated ?? 0,
      task.contextSize, task.truncated ? 1 : 0, task.graphsReused ?? 0,
      task.pendingTokens ?? 0, task.nCtxSlot ?? 0, task.cachedPromptTokens ?? 0,
      task.promptMsPerToken ?? 0, task.outputMsPerToken ?? 0, task.ttsMs ?? 0,
      task.draftMeanAcceptLen ?? 0, task.slotSimilarity ?? 0,
    );

    const da = gc.get("total_count") as { value: number } | undefined;
    const dpt = gc.get("total_prompt_tokens") as { value: number } | undefined;
    const dptm = gc.get("total_prompt_time_ms") as { value: number } | undefined;
    const dot = gc.get("total_output_tokens") as { value: number } | undefined;
    const detm = gc.get("total_eval_time_ms") as { value: number } | undefined;
    const dda = gc.get("total_draft_accepted") as { value: number } | undefined;
    const ddg = gc.get("total_draft_generated") as { value: number } | undefined;

    ups.run("total_count", (da?.value ?? 0) + 1);
    ups.run("total_prompt_tokens", (dpt?.value ?? 0) + task.promptTokens);
    ups.run("total_prompt_time_ms", (dptm?.value ?? 0) + task.promptTimeMs);
    ups.run("total_output_tokens", (dot?.value ?? 0) + task.outputTokens);
    ups.run("total_eval_time_ms", (detm?.value ?? 0) + task.evalTimeMs);
    ups.run("total_draft_accepted", (dda?.value ?? 0) + (task.draftAccepted ?? 0));
    ups.run("total_draft_generated", (ddg?.value ?? 0) + (task.draftGenerated ?? 0));

    this.emit("updated");
  }

  private sampleBuffer: SpeedSample[] = [];

  onSpeedSample(sample: SpeedSample) {
    this.sampleBuffer.push(sample);
    if (this.sampleBuffer.length >= 10) {
      this.flushSamples();
    }
  }

  flushSamples() {
    if (!this.db || this.sampleBuffer.length === 0) return;
    const stmt = this.getStmts().insertSpeedSample!;
    const ins = this.db.transaction(() => {
      for (const s of this.sampleBuffer) {
        stmt.run(s.taskId, s.phase, s.position, s.speedTps, s.msPerToken, s.elapsedS);
      }
    });
    ins();
    this.sampleBuffer.length = 0;
  }

  getTotalCount(filter?: TaskFilter): number {
    if (!this.db) return 0;
    const { sql, params } = this.buildFilter(filter);
    const row = this.db.prepare(`SELECT COUNT(*) as cnt FROM tasks ${sql}`).get(...params) as { cnt: number };
    return row.cnt;
  }

  getRange(offset: number, limit: number, filter?: TaskFilter, sortField: TaskSortField = "timestamp", sortDir: TaskSortDir = "desc"): TaskMetrics[] {
    if (!this.db) return [];
    const { sql, params } = this.buildFilter(filter);
    const col = SORT_FIELD_MAP[sortField];
    const dir = sortDir.toUpperCase();
    const query = `SELECT * FROM tasks ${sql} ORDER BY ${col} ${dir} LIMIT ? OFFSET ?`;
    const rows = this.db.prepare(query).all(...params, limit, offset) as Record<string, unknown>[];
    return rows.map(r => this.rowToTask(r));
  }

  getStats(filter?: TaskFilter) {
    if (!filter) {
      const cnt = this.getCacheValue("total_count");
      const pt = this.getCacheValue("total_prompt_tokens");
      const ptm = this.getCacheValue("total_prompt_time_ms");
      const ot = this.getCacheValue("total_output_tokens");
      const etm = this.getCacheValue("total_eval_time_ms");
      const da = this.getCacheValue("total_draft_accepted");
      const dg = this.getCacheValue("total_draft_generated");

      const avgPromptSpeed = ptm > 0 ? (pt / ptm) * 1000 : 0;
      const avgOutputSpeed = etm > 0 ? (ot / etm) * 1000 : 0;
      const avgDraftAcceptance = dg > 0 ? da / dg : 0;

      return {
        avgPromptSpeed,
        avgOutputSpeed,
        totalTokens: pt + ot,
        totalPromptTokens: pt,
        totalOutputTokens: ot,
        avgDraftAcceptance,
        count: cnt,
      };
    }

    if (!this.db) {
      return { avgPromptSpeed: 0, avgOutputSpeed: 0, totalTokens: 0, totalPromptTokens: 0, totalOutputTokens: 0, avgDraftAcceptance: 0, count: 0 };
    }

    const { sql, params } = this.buildFilter(filter);
    const row = this.db.prepare(`
      SELECT
        COUNT(*) as cnt,
        COALESCE(SUM(prompt_tokens), 0) as pt,
        COALESCE(SUM(prompt_time_ms), 0) as ptm,
        COALESCE(SUM(output_tokens), 0) as ot,
        COALESCE(SUM(eval_time_ms), 0) as etm,
        COALESCE(SUM(draft_accepted), 0) as da,
        COALESCE(SUM(draft_generated), 0) as dg
      FROM tasks ${sql}
    `).get(...params) as { cnt: number; pt: number; ptm: number; ot: number; etm: number; da: number; dg: number };

    const avgPromptSpeed = row.ptm > 0 ? (row.pt / row.ptm) * 1000 : 0;
    const avgOutputSpeed = row.etm > 0 ? (row.ot / row.etm) * 1000 : 0;
    const avgDraftAcceptance = row.dg > 0 ? row.da / row.dg : 0;

    return {
      avgPromptSpeed,
      avgOutputSpeed,
      totalTokens: row.pt + row.ot,
      totalPromptTokens: row.pt,
      totalOutputTokens: row.ot,
      avgDraftAcceptance,
      count: row.cnt,
    };
  }

  private buildFilter(filter?: TaskFilter): { sql: string; params: unknown[] } {
    if (!filter) return { sql: "", params: [] };

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.slotId !== undefined) {
      conditions.push("slot_id = ?");
      params.push(filter.slotId);
    }
    if (filter.dateFrom) {
      conditions.push("timestamp >= ?");
      params.push(filter.dateFrom.toISOString());
    }
    if (filter.dateTo) {
      conditions.push("timestamp <= ?");
      params.push(filter.dateTo.toISOString());
    }
    if (filter.minOutputTokens !== undefined) {
      conditions.push("output_tokens >= ?");
      params.push(filter.minOutputTokens);
    }
    if (filter.maxOutputTokens !== undefined) {
      conditions.push("output_tokens <= ?");
      params.push(filter.maxOutputTokens);
    }
    if (filter.minSpeed !== undefined) {
      conditions.push("output_speed >= ?");
      params.push(filter.minSpeed);
    }
    if (filter.maxSpeed !== undefined) {
      conditions.push("output_speed <= ?");
      params.push(filter.maxSpeed);
    }
    if (filter.taskId !== undefined) {
      conditions.push("task_id = ?");
      params.push(filter.taskId);
    }
    if (filter.minCacheHitRatio !== undefined) {
      conditions.push("(CASE WHEN pending_tokens > 0 THEN cached_prompt_tokens * 1.0 / pending_tokens ELSE 0 END) >= ?");
      params.push(filter.minCacheHitRatio);
    }
    if (filter.maxCtxSize !== undefined) {
      conditions.push("n_ctx_slot <= ?");
      params.push(filter.maxCtxSize);
    }

    return conditions.length > 0
      ? { sql: `WHERE ${conditions.join(" AND ")}`, params }
      : { sql: "", params: [] };
  }

  private rowToTask(row: Record<string, unknown>): TaskMetrics {
    return {
      taskId: row.task_id as number,
      slotId: row.slot_id as number,
      timestamp: row.timestamp as string,
      profile: row.profile as string | undefined,
      model: row.model as string | undefined,
      version: row.version as string | undefined,
      promptTokens: row.prompt_tokens as number,
      promptTimeMs: row.prompt_time_ms as number,
      promptSpeed: row.prompt_speed as number,
      outputTokens: row.output_tokens as number,
      evalTimeMs: row.eval_time_ms as number,
      outputSpeed: row.output_speed as number,
      totalTokens: row.total_tokens as number,
      totalTimeMs: row.total_time_ms as number,
      draftAccepted: row.draft_accepted as number,
      draftGenerated: row.draft_generated as number,
      draftAcceptance: row.draft_generated ? (row.draft_accepted as number) / (row.draft_generated as number) : 0,
      contextSize: row.context_size as number,
      truncated: (row.truncated as number) === 1,
      graphsReused: row.graphs_reused as number,
      pendingTokens: (row.pending_tokens as number) ?? 0,
      nCtxSlot: (row.n_ctx_slot as number) ?? 0,
      cachedPromptTokens: (row.cached_prompt_tokens as number) ?? 0,
      promptMsPerToken: (row.prompt_ms_per_token as number) ?? 0,
      outputMsPerToken: (row.output_ms_per_token as number) ?? 0,
      ttsMs: (row.tts_ms as number) ?? 0,
      draftMeanAcceptLen: (row.draft_mean_accept_len as number) ?? 0,
      slotSimilarity: (row.slot_similarity as number) ?? 0,
    };
  }

  dispose() {
    this.flushSamples();
    if (this.stopTailer) this.stopTailer();
    logParser.stop();
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export const taskStore = new TaskStore();

logParser.on("task", (task: TaskMetrics) => {
  taskStore.onTask(task);
});

import { onSpeedSample as trackSpeedSample } from "./metricstracker";
trackSpeedSample((sample) => {
  taskStore.onSpeedSample(sample);
});
