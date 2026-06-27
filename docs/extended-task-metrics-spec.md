# Extended Task Metrics Specification

## Overview

Extends the existing task history system with real-time, per-phase performance metrics captured from llama-server log lines. Replaces the single aggregate row-per-task model with two layers:

- **Layer 1** — additional columns on the `tasks` table capturing KV cache effectiveness, latency views, first-token timing, and slot selection quality
- **Layer 2** — new `task_speed_samples` table with many rows per task, recording instantaneous speed at intermediate positions during prompt processing and generation

Enables answering questions that aggregate averages cannot: *does generation speed degrade over long outputs?*, *how much did KV cache help?*, *what was the first-token latency?*, *does prompt speed stay flat or drop with context size?*

---

## Motivation

Currently each task stores a single `promptSpeed` and `outputSpeed` (tokens/s). A 50 t/s average on a 1000-token generation could mean 60 t/s at the start and 40 t/s at the end. The existing `tasks` table cannot distinguish these cases.

The llama-server log emits intermediate speed samples every ~3 seconds during both prompt processing and generation. These are currently parsed by `metricstracker.ts` for the live Dashboard display but discarded for persistence. This spec captures them alongside additional single-value metrics that are already available in log lines but not stored.

---

## Log Line Analysis

### Lines Already Parsed (logparser.ts)

| Regex | Fields Captured | Currently Stored | Discarded |
|---|---|---|---|
| `prompt eval time` | slot, task, time_ms, tokens, **ms_per_token**, tps | time_ms, tokens, tps | ms_per_token (group 5) |
| `eval time` | slot, task, time_ms, tokens, **ms_per_token**, tps | time_ms, tokens, tps | ms_per_token (group 5) |
| `total time` | slot, task, time_ms, tokens | all | — |
| `graphs reused` | slot, task, count | count | — |
| `draft acceptance` | slot, task, rate, accepted, generated, **mean_len**, **per_pos[]** | rate, accepted, generated | mean_len, per_pos[] |
| `release` | slot, task, n_tokens, truncated | all | — |

### Lines Parsed by metricstracker.ts (not persisted)

| Regex | Fields | Phase |
|---|---|---|
| `launch_slot_` | slot, task | start |
| `new prompt` | slot, task, n_ctx_slot, n_keep, task.n_tokens | prompt start |
| `cached n_tokens` | slot, task, cached (repeated, increasing) | prompt |
| `prompt processing` | slot, task, n_tokens, progress, elapsed_s, tps | prompt mid |
| `init_sampler` | slot, task, took_ms, text_tokens, total_tokens | prompt end |
| `n_decoded` | slot, task, decoded, tg_tps, tg_3s_tps | generation |
| `reasoning-budget` | activated/deactivated | either |
| `selected slot by LCP` | sim_best, f_keep | slot selection |

### Example Task (task 1135, real log)

```
launch_slot_        task 1135, is_child = 0
new prompt          n_ctx_slot = 131072, n_keep = 0, task.n_tokens = 42877
cached n_tokens=40428    ← KV cache hit
prompt processing   n_tokens = 1933, progress = 0.99, t = 3.55 s / 544.64 t/s
prompt processing   n_tokens = 2445, progress = 1.00, t = 4.38 s / 558.78 t/s
init_sampler        took 3.27 ms, text = 42877, total = 42877
n_decoded = 149     tg = 49.19 t/s, tg_3s = 49.19 t/s
n_decoded = 242     tg = 40.01 t/s, tg_3s = 30.80 t/s
n_decoded = 338     tg = 37.25 t/s, tg_3s = 31.74 t/s
... (degrading to ~33 t/s)
prompt eval time    2449 tokens, 4451 ms, 1.82 ms/t, 550.22 t/s
eval time           1069 tokens, 31942 ms, 29.88 ms/t, 33.47 t/s
draft acceptance    0.369, mean_len=2.48, per_pos=(0.681, 0.410, 0.245, 0.141)
release             n_tokens = 43947, truncated = 0
```

Key observations:
- `pending_tokens` (42877) >> `promptTokens` (2449) — most was served from cache
- Generation speed drops from 49 t/s to 33 t/s as context grows
- `draft_mean_accept_len` (2.48) is lower than earlier tasks — draft quality degrades with context

---

## Layer 1: Extended Task Fields

### New `TaskMetrics` Fields

Added to `TaskMetrics` interface in `logparser.ts`:

| Field | Type | Source | Example | Description |
|---|---|---|---|---|
| `pendingTokens` | `number` | `new prompt, task.n_tokens=N` | 42877 | Total input tokens sent to model |
| `nCtxSlot` | `number` | `new prompt, n_ctx_slot=N` | 131072 | Context allocated for this slot |
| `cachedPromptTokens` | `number` | first `cached n_tokens` for the task | 40428 | Tokens served from KV cache before processing |
| `promptMsPerToken` | `number` | `prompt eval: X ms per token` (group 5) | 1.82 | Latency view (complements promptSpeed) |
| `outputMsPerToken` | `number` | `eval: X ms per token` (group 5) | 29.88 | Latency view (complements outputSpeed) |
| `ttsMs` | `number` | first `n_decoded` timestamp - `init_sampler` timestamp | 3100 | Time to first token (user-perceived latency) |
| `draftMeanAcceptLen` | `number` | `draft acceptance: mean acceptance length=N` | 2.48 | Average tokens accepted per draft attempt |
| `slotSimilarity` | `number` | `selected slot by LCP, sim_best=N` | 0.518 | LCP similarity score for slot selection |

### Derived Metrics (computed at query time, not stored)

| Metric | Formula | Range |
|---|---|---|
| `cacheHitRatio` | `cachedPromptTokens / pendingTokens` | 0.0–1.0 |
| `promptNewTokens` | `pendingTokens - cachedPromptTokens` | ≥ 0 |
| `promptEfficiency` | `promptNewTokens / pendingTokens` | 0.0–1.0 (work vs. total) |

### New `tasks` Table Columns

```sql
ALTER TABLE tasks ADD COLUMN pending_tokens INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN n_ctx_slot INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN cached_prompt_tokens INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN prompt_ms_per_token REAL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN output_ms_per_token REAL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN tts_ms REAL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN draft_mean_accept_len REAL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN slot_similarity REAL DEFAULT 0;
```

All nullable/zero-default for backward compatibility with existing rows.

---

## Layer 2: Speed Samples Table

### Schema

```sql
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
```

### Source Log Lines

| Log Line | Phase | position | speed_tps | ms_per_token | elapsed_s |
|---|---|---|---|---|---|
| `prompt processing, n_tokens=N, progress=P, t=X s / Y t/s` | `prompt` | N | Y | 1000/Y | X |
| `n_decoded=N, tg=X t/s, tg_3s=Y t/s` | `generation` | N | X | 0 | (computed from task start) |

### Storage Estimate

| Task Type | Prompt Samples | Gen Samples | Total |
|---|---|---|---|
| Short prompt, short gen | 0–2 | 1–3 | 1–5 |
| Long prompt, short gen | 3–8 | 1–3 | 4–11 |
| Long prompt, long gen | 5–10 | 5–15 | 10–25 |
| Very long gen (task 1135) | 2 | 10 | 12 |

At ~15 samples/task average, 10K tasks → ~150K rows. At ~50 bytes/row → ~7.5 MB. Negligible.

---

## Type Definitions

### `SpeedSample`

```typescript
interface SpeedSample {
  taskId: number;
  phase: "prompt" | "generation";
  position: number;    // cumulative tokens at this point
  speedTps: number;    // instantaneous tokens/sec
  msPerToken: number;  // instantaneous latency (0 if not available)
  elapsedS: number;    // elapsed seconds from task start
}
```

### Extended `TaskMetrics`

```typescript
export interface TaskMetrics {
  // Existing fields
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

  // New Layer 1 fields
  pendingTokens: number;
  nCtxSlot: number;
  cachedPromptTokens: number;
  promptMsPerToken: number;
  outputMsPerToken: number;
  ttsMs: number;
  draftMeanAcceptLen: number;
  slotSimilarity: number;
}
```

---

## Implementation Plan

### Phase 1: Log Parser Extensions (`logparser.ts`)

1. Add new regexes to capture discarded fields:
   - `newPromptRegex`: `new prompt, n_ctx_slot = (\d+), n_keep = (\d+), task.n_tokens = (\d+)`
   - `cachedTokensRegex`: `cached n_tokens = (\d+)`
   - `initSamplerRegex`: `init sampler, took ([\d.]+) ms`
   - `draftMeanLenRegex`: `mean acceptance length = ([\d.]+)` (extend existing draft regex)
   - `slotSelectionRegex`: `selected slot by LCP similarity, sim_best = ([\d.]+)`

2. Capture `ms_per_token` from existing `promptEvalRegex` (group 5) and `evalRegex` (group 5) — already matched, just not stored.

3. Track per-task accumulators for `pendingTokens`, `nCtxSlot`, `cachedPromptTokens` (first value), `promptMsPerToken`, `outputMsPerToken`, `draftMeanAcceptLen`, `slotSimilarity`.

4. Compute `ttsMs`: record timestamp of `init_sampler` and first `n_decoded` line; difference is TTS.

5. Merge all fields into `TaskMetrics` before emitting the `task` event.

6. Emit new `speedSample` event from `promptProgressRegex` and `decodedRegex` matches in `metricstracker.ts`.

### Phase 2: TaskStore Extensions (`tasks.ts`)

1. Extend `createTables()`:
   - Add `ALTER TABLE` for new columns (idempotent via `IF NOT EXISTS` / catch errors)
   - Create `task_speed_samples` table and indexes

2. Extend `insertTask` prepared statement with new columns.

3. Add `insertSpeedSample` prepared statement:
   ```sql
   INSERT INTO task_speed_samples (task_id, phase, position, speed_tps, ms_per_token, elapsed_s)
   VALUES (?, ?, ?, ?, ?, ?)
   ```

4. Add `onSpeedSample(sample: SpeedSample)` method — batches inserts (accumulate in array, flush every 10 samples or on task completion).

5. Extend `rowToTask()` to map new columns.

6. Extend `TaskFilter` with optional `minCacheHitRatio`, `maxCtxSize` filters.

7. Wire `logParser.on("speedSample", taskStore.onSpeedSample)` at module level.

### Phase 3: Metricstracker Extensions (`metricstracker.ts`)

1. Add `speedSample` event emission from existing regex matches:
   - `promptProgressRegex` → `emit("speedSample", { taskId, phase: "prompt", position: n_tokens, speedTps: tps, msPerToken: 1000/tps, elapsedS: elapsed })`
   - `decodedRegex` → `emit("speedSample", { taskId, phase: "generation", position: decoded, speedTps: tg, msPerToken: 0, elapsedS: elapsed })`

2. Track per-task elapsed time from `launch_slot_` timestamp.

### Phase 4: UI Extensions (`TasksTab.ts`)

1. Add new columns to the task table:
   - `Cache` — `cachedPromptTokens` with hit ratio percentage
   - `TTS` — `ttsMs` formatted as ms
   - `P ms/t` — `promptMsPerToken`
   - `O ms/t` — `outputMsPerToken`

2. Add sort support for new columns in `TaskSortField`.

3. Add filter controls for cache hit ratio and context size.

4. (Future) Speed curve viewer — expand task details to show speed vs. position graph using `task_speed_samples`.

---

## File Changes

| File | Changes |
|---|---|
| `src/lib/logparser.ts` | New regexes, extended `TaskMetrics`, new accumulator fields, TTS computation |
| `src/lib/tasks.ts` | Schema migration, new columns, `task_speed_samples` table, `onSpeedSample()`, extended filter/sort |
| `src/lib/metricstracker.ts` | New `speedSample` event, elapsed time tracking |
| `src/components/tabs/TasksTab.ts` | New columns, sort fields, filter controls |

---

## Migration Strategy

### Existing Data

- New columns default to `0` / `NULL` — existing rows remain valid
- `rowToTask()` maps `NULL` → `0` for new fields
- No data loss, no row invalidation

### Backfill

Not possible — historical tasks don't have intermediate log data available (logs are rotated). New columns will be `0` for pre-migration tasks, which is the correct "unknown" value.

### Rollback

Drop new columns and `task_speed_samples` table. Revert `TaskMetrics` interface. No data loss on existing columns.

---

## Tradeoffs

| Aspect | Decision | Rationale |
|---|---|---|
| `ttsMs` computation | Timestamp-based (init_sampler → first n_decoded) | Log timestamps are wall-clock; 3-second granularity is sufficient |
| `cachedPromptTokens` | First `cached n_tokens` value | Subsequent values increase as cache builds; first value represents initial hit |
| Speed sample batching | Accumulate + flush on task completion | Reduces DB writes; samples arrive in order per task |
| `tg_3s` field | Not stored | Redundant with `tg` for curve analysis; adds column without insight |
| `per_pos[]` draft rates | Not stored | 4 values per task → wide table; `draftMeanAcceptLen` is sufficient for filtering |
| Elapsed time in samples | Computed from `launch_slot_` timestamp | Single source of truth; avoids per-line timestamp parsing |

---

## Future Extensions

- **Speed curve visualization** — sparkline or character-based graph in task details panel
- **Aggregate speed stats** — `AVG(speed_tps)`, `MIN(speed_tps)`, `MAX(speed_tps)` per task, accessible via `getStats()`
- **Degradation ratio** — `last_sample_speed / first_sample_speed` for generation phase, stored as a derived column
- **Per-task config snapshot** — Layer 3 from earlier proposal (threads, gpu_layers, temperature, etc.)
- **Model snapshot** — architecture, quantization, GPU offload ratio at task time
