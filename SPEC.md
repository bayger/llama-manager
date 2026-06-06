# Llama.cpp Dashboard — Specification

## Overview

A terminal UI application built with TypeScript and terminal-kit that provides a unified interface for managing llama.cpp installations, controlling the llama-server process, downloading HuggingFace GGUF models, monitoring server performance in real time, and reviewing historical task statistics.

Uses a custom Control-based UI framework with composable widgets, flex-based layouts, and a singleton focus manager — no React or Ink dependency.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Language | TypeScript |
| TUI Framework | terminal-kit (imperative rendering) |
| UI Architecture | Custom Control tree with Column/Row layouts |
| HTTP Client | undici |
| Process Management | child_process (spawn) |
| State Management | Control-owned presentation state + TabContext services |
| Config Storage | JSON file at `$XDG_CONFIG_HOME/llama-manager/config.json` |
| Package Manager | npm |

---

## Storage Paths

All paths follow XDG Base Directory spec and respect environment variable overrides. Created automatically on first run if they don't exist.

| What | Default Path | Env Override |
|---|---|---|
| Config | `$XDG_CONFIG_HOME/llama-manager/config.json` | — |
| Versions (builds) | `$XDG_DATA_HOME/llama-manager/versions/` | — |
| Models (GGUF) | `$HF_HOME/llama-manager/` | `HF_HOME` |
| Tasks log | `$XDG_DATA_HOME/llama-manager/tasks.jsonl` | — |
| Server log | `$XDG_STATE_HOME/llama-manager/server.log` | — |

**Resolved defaults** (when env vars are unset):

| What | Resolved Path |
|---|---|
| Config | `~/.config/llama-manager/config.json` |
| Versions | `~/.local/share/llama-manager/versions/` |
| Models | `~/.cache/huggingface/llama-manager/` |
| Tasks | `~/.local/share/llama-manager/tasks.jsonl` |
| Server log | `~/.local/state/llama-manager/server.log` |

Models live under `HF_HOME` so users who already set `HF_HOME` to a large disk get the benefit automatically. All paths are configurable in `config.json`.

---

## UI Architecture

### Control Tree

The UI is built from a hierarchy of `Control` instances. Each control manages its own presentation state (selected index, scroll offset, edit value) and renders itself to a terminal-kit `Terminal` object.

```
App
├─ Column (flex layout)
│  ├─ Label (tab bar)
│  ├─ Control (active tab)
│  │  ├─ Column / Row (nested layouts)
│  │  ├─ Button, TextInput, List, ...
│  │  └─ ...
│  └─ HelpBar
└─ FocusManager (singleton, tracks single focus point)
```

### Layout System

Two-pass layout with flex-based space distribution:

1. **`measure()`** — each control reports its desired size
2. **`onLayout()`** — parent distributes available space, assigns child `Rect`s

`Column` distributes vertically (flex along Y), `Row` distributes horizontally (flex along X). Controls without `flex` get their measured size; remaining space goes to flexible children proportionally.

### Focus Management

`FocusManager` singleton tracks a single focus point. Tab/Shift+Tab navigates through focusable controls in tree order. Key events are delivered to the focused control. When a control has no focusable children, the manager falls back to the root for key delivery.

### Rendering

Dirty-flag based incremental rendering. Each control tracks `needsRender`; setting it propagates up to the root. The app's render loop only redraws dirty subtrees.

### RenderContext

Shared context object passed to controls, providing access to the `Terminal` and app services (config, server, tasks, versions, models, api, hf) without tight coupling.

### Widgets

| Widget | Purpose |
|---|---|
| `Label` | Static text display |
| `Button` | Clickable/focusable action button |
| `ButtonBar` | Horizontal row of buttons |
| `TextInput` | Single-line text input with cursor |
| `List` | Scrollable selectable list |
| `Scrollable` | Scrollable content container |
| `Box` | Bordered container (Unicode box-drawing) |
| `Divider` | Horizontal line separator |
| `Spacer` | Flexible space filler |
| `ProgressBar` | Download/operation progress |
| `HelpBar` | Bottom status bar with key hints |

---

## UI Structure

Tab-based navigation with 5 persistent tabs across the top:

```
┌──────────────────────────────────────────────────────────┐
│  [Server]  [Tasks]  [Versions]  [Models]  [Dashboard]   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  <Active tab content fills remaining terminal height>    │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  Status bar: active version | server status | shortcuts  │
└──────────────────────────────────────────────────────────┘
```

### Navigation

| Input | Action |
|---|---|
| `←` / `→` | Switch tabs |
| `Tab` / `Shift+Tab` | Move focus between controls |
| `Enter` | Confirm / select |
| `Esc` | Cancel / go back |
| `q` | Quit application |
| `?` | Show help overlay |

---

## Feature 1: Server Control

### Tab: `[Server]`

Displays current server state and provides controls.

#### State Display

- **Status**: `Running` / `Stopped` / `Starting` / `Stopping`
- **PID**: Process ID if running
- **Active Version**: Currently selected llama.cpp version
- **Server URL**: `http://localhost:<port>`
- **Uptime**: Duration since start

#### Controls

- **Start** — launches `llama-server` with persisted config
- **Stop** — graceful shutdown (SIGTERM, then SIGKILL after timeout)
- **Restart** — stop then start
- **Edit Config** — inline form for server arguments

#### Curated Presets

Commonly-used arguments exposed as typed UI controls, organized by category. New flags are added to the dashboard over time, but anything missing is covered by the free-form args field below.

**Server**

| Argument | Type | Default | Description |
|---|---|---|---|
| `--host` | string | `127.0.0.1` | Bind address |
| `--port` | number | `8080` | HTTP port |
| `--parallel` | number | `-1` | Number of server slots (auto) |
| `--timeout` | number | `600` | Read/write timeout in seconds |
| `--api-key` | string | — | API key for authentication |
| `--threads-http` | number | `-1` | HTTP request worker threads |
| `--cont-batching` | boolean | `true` | Enable continuous batching |
| `--cache-prompt` | boolean | `true` | Enable prompt caching |
| `--metrics` | boolean | `false` | Prometheus metrics endpoint |
| `--ui` | boolean | `true` | Enable built-in Web UI |
| `--embedding` | boolean | `false` | Embeddings-only mode |
| `--rerank` | boolean | `false` | Enable reranking endpoint |

**Model & Loading**

| Argument | Type | Default | Description |
|---|---|---|---|
| `--model` | string | — | Path to GGUF model |
| `--lora` | string | — | LoRA adapter path (comma-separated) |
| `--hf-repo` | string | — | HuggingFace repo (`user/model[:quant]`) |
| `--hf-token` | string | — | HuggingFace access token |
| `--chat-template` | string | — | Built-in or custom Jinja template name |
| `--jinja` | boolean | `true` | Use Jinja template engine |

**Compute**

| Argument | Type | Default | Description |
|---|---|---|---|
| `--threads` | number | `-1` | CPU threads for generation |
| `--threads-batch` | number | same as `--threads` | CPU threads for batch/prompt |
| `--ctx-size` | number | `0` | Prompt context size (0 = from model) |
| `--batch-size` | number | `2048` | Logical max batch size |
| `--ubatch-size` | number | `512` | Physical max batch size |
| `--flash-attn` | enum | `auto` | Flash Attention (`on`/`off`/`auto`) |
| `--mlock` | boolean | `false` | Keep model in RAM (no swap) |
| `--mmap` | boolean | `true` | Memory-map model |
| `--cache-type-k` | enum | `f16` | KV cache type for K |
| `--cache-type-v` | enum | `f16` | KV cache type for V |

**GPU**

| Argument | Type | Default | Description |
|---|---|---|---|
| `--gpu-layers` | number | `auto` | Layers to offload to VRAM |
| `--split-mode` | enum | `layer` | Multi-GPU split (`none`/`layer`/`row`/`tensor`) |
| `--tensor-split` | string | — | GPU offload proportions (`3,1`) |
| `--main-gpu` | number | `0` | Primary GPU index |
| `--device` | string | — | Comma-separated device list |
| `--fit` | enum | `on` | Auto-fit args to device memory |

**Sampling**

| Argument | Type | Default | Description |
|---|---|---|---|
| `--seed` | number | `-1` | RNG seed (-1 = random) |
| `--temperature` | number | `0.80` | Temperature |
| `--top-k` | number | `40` | Top-k sampling (0 = disabled) |
| `--top-p` | number | `0.95` | Top-p sampling (1.0 = disabled) |
| `--min-p` | number | `0.05` | Min-p sampling (0.0 = disabled) |
| `--repeat-last-n` | number | `64` | Tokens to consider for penalty |
| `--repeat-penalty` | number | `1.00` | Repeat penalty (1.0 = disabled) |
| `--presence-penalty` | number | `0.00` | Presence penalty |
| `--frequency-penalty` | number | `0.00` | Frequency penalty |
| `--grammar` | string | — | BNF grammar constraint |
| `--json-schema` | string | — | JSON schema constraint |
| `--ignore-eos` | boolean | `false` | Ignore end-of-stream token |

**Speculative Decoding**

| Argument | Type | Default | Description |
|---|---|---|---|
| `--spec-draft-model` | string | — | Draft model path |
| `--spec-type` | string | `none` | Spec types (`draft-simple`,`draft-mtp`,`ngram-mod`,…) |
| `--spec-draft-n-max` | number | `3` | Max draft tokens |
| `--spec-draft-threads` | number | same as `--threads` | Draft model threads |
| `--spec-draft-gpu-layers` | number | `auto` | Draft model GPU layers |

**Reasoning**

| Argument | Type | Default | Description |
|---|---|---|---|
| `--reasoning` | enum | `auto` | Thinking mode (`on`/`off`/`auto`) |
| `--reasoning-budget` | number | `-1` | Token budget for thinking |
| `--reasoning-format` | enum | `auto` | Format (`none`/`deepseek`/`deepseek-legacy`) |

**Logging**

| Argument | Type | Default | Description |
|---|---|---|---|
| `--log-file` | string | — | Log output file path |
| `--log-verbosity` | number | `3` | Verbosity (0-5) |
| `--log-colors` | enum | `auto` | Colored logs (`on`/`off`/`auto`) |
| `--log-timestamps` | boolean | `true` | Include timestamps |

#### Free-Form Arguments

A multi-line text input accepts arbitrary `--flag value` pairs not covered by presets. Each line is one or more arguments passed verbatim to the spawn command. This ensures day-one support for any new llama-server flag without dashboard updates.

```
Additional arguments:
┌──────────────────────────────────────────────────────────┐
│ --rope-scaling yarn                                      │
│ --rope-freq-scale 0.5                                    │
│ --yarn-orig-ctx 8192                                     │
│ --spec-draft-hf-org/user/draft-model:Q4_K_M              │
└──────────────────────────────────────────────────────────┘
```

The final command line is assembled as:
```
<active-version>/llama-server <preset-args> <free-form-args>
```

#### Process Management

- Server process is spawned via `child_process.spawn`
- PID is tracked and stored in memory
- On dashboard quit, server is **not** killed by default (configurable)
- Config is persisted to `$HOME/.llama-manager/config.json` after every change

#### Server Log Viewer

Bottom panel shows live server stdout/stderr (scrollable, last 200 lines).

---

## Feature 2: Task History

### Tab: `[Tasks]`

Displays a scrollable table of completed inference tasks with statistics parsed from server logs.

#### Log Parsing

The dashboard tails the server log file (configured via `--log-file`) or captures stderr, parsing `slot print_timing` lines to extract per-task statistics. A task is considered complete when a `slot release` or final `print_timing` with `total time` is emitted.

**Parsed per task:**

| Field | Source Line | Example |
|---|---|---|
| `taskId` | `task 93514` | `93514` |
| `slotId` | `id 1` | `1` |
| `promptTokens` | `prompt eval time ... / 688 tokens` | `688` |
| `promptTimeMs` | `prompt eval time = 1326.58 ms` | `1326.58` |
| `promptSpeed` | `518.63 tokens per second` | `518.63` |
| `outputTokens` | `eval time ... / 3209 tokens` | `3209` |
| `evalTimeMs` | `eval time = 66824.14 ms` | `66824.14` |
| `outputSpeed` | `48.02 tokens per second` | `48.02` |
| `totalTimeMs` | `total time = 68150.72 ms` | `68150.72` |
| `totalTokens` | `total time ... / 3897 tokens` | `3897` |
| `graphsReused` | `graphs reused = 85103` | `85103` |
| `draftAcceptance` | `draft acceptance = 0.51429` | `0.51429` |
| `draftAccepted` | `2160 accepted` | `2160` |
| `draftGenerated` | `4200 generated` | `4200` |
| `contextSize` | `slot release ... n_tokens = 12261` | `12261` |
| `truncated` | `truncated = 0` | `false` |
| `timestamp` | Log prefix `1435.04.248.155` | ISO string |

#### Display

```
Recent tasks (24):

  Task     Prompt      Output     P t/s    O t/s    Total     Draft       Context
  ─────────────────────────────────────────────────────────────────────────────────
  93514    688 tok     3209 tok   518.6   48.0      68.2s     51.4%       12261
  94569    3320 tok    134 tok    693.7   46.4      7.7s      50.0%       12413
  94201    1250 tok    892 tok    412.1   44.2      22.1s     49.8%       11024
  ...

  Avg output speed: 46.9 t/s  |  Total tasks: 24  |  Period: last 2 hours
```

#### Filtering & Sorting

- **Sort by**: task ID, timestamp, output speed (asc/desc), total time, output tokens
- **Filter by**: slot ID, date range, min/max output tokens, min/max speed
- **Search**: by task ID

#### Aggregated Statistics

Bottom panel shows summary stats:
- Average prompt speed (t/s)
- Average output speed (t/s)
- Total tokens processed (prompt + output)
- Average draft acceptance rate
- Task count in visible period

#### Persistence

Completed tasks are appended to `$HOME/.llama-manager/tasks.jsonl` (one JSON object per line) for survival across dashboard restarts.

```jsonl
{"taskId":93514,"slotId":1,"promptTokens":688,"promptTimeMs":1326.58,"promptSpeed":518.63,"outputTokens":3209,"evalTimeMs":66824.14,"outputSpeed":48.02,"totalTimeMs":68150.72,"totalTokens":3897,"graphsReused":85103,"draftAcceptance":0.51429,"draftAccepted":2160,"draftGenerated":4200,"contextSize":12261,"truncated":false,"timestamp":"2025-01-15T14:36:04.248Z"}
```

#### Log Tailer

`lib/logparser.ts` watches the log file using `fs.watch` or `tail -f` subprocess, streaming parsed task events via EventEmitter to interested components.

---

## Feature 3: Version Management

### Tab: `[Versions]`

Lists installed llama.cpp versions and provides install/switch/uninstall actions.

#### Display

```
Installed versions:
  ✓ b7405  (active)  ~/.local/share/llama-manager/versions/b7405/
    b7389              ~/.local/share/llama-manager/versions/b7389/
    b7201              ~/.local/share/llama-manager/versions/b7201/

Storage: 245 MB used in ~/.local/share/llama-manager/versions/
```

#### Actions

- **Install** — download prebuilt binary from GitHub releases (`ggerganov/llama.cpp`)
  - Detect OS + architecture (Linux x86_64, Linux ARM64, macOS x86_64, macOS ARM64)
  - Download ZIP, extract to `$HOME/.llama-manager/versions/<version>/`
  - Show download progress bar
- **Switch** — mark a version as active (updates config, restarts server if running)
- **Uninstall** — remove version directory (blocked if version is active)
- **Check Updates** — fetch latest release tag from GitHub API

#### Prebuilt Binary Resolution

For each version, look for the appropriate build artifact in the GitHub release assets. Fallback chain:
1. Official prebuilt release asset matching OS/arch
2. Community build if official unavailable
3. If no prebuilt found, show error with link to manual build instructions

#### Storage Path

Default: `$HOME/.llama-manager/versions/`
Configurable via settings.

---

## Feature 4: Model Management

### Tab: `[Models]`

Manages GGUF model downloads from HuggingFace Hub.

#### Display

```
Local models (3):
  ✓ TheBloke/Llama-2-7B-Chat-GGUF/llama-2-7b-chat.Q4_K_M.gguf  (5.04 GB)  [active]
    bartowski/Mistral-7B-Instruct-v0.3-GGUF/mistral-7b-instruct-v0.3.Q5_K_M.gguf  (5.33 GB)
     Qwen/Qwen2.5-7B-Instruct-GGUF/qwen2.5-7b-instruct-q4_k_m.gguf  (4.92 GB)

Storage: 15.29 GB used in ~/.cache/huggingface/llama-manager/
```

#### Actions

- **Search** — query HuggingFace API for GGUF models
  - Filter by tag `gguf`
  - Show repo name, size, last modified, likes
- **Download** — fetch model file(s) with progress tracking
  - Uses HuggingFace `hf_hub_download` endpoint or direct URL
  - Resumes interrupted downloads
  - Shows ETA and current speed
- **Delete** — remove local model file
- **Set Active** — mark model for server to use on next start
- **Browse Local** — file browser for models directory

#### Model Metadata

Each downloaded model stores a sidecar JSON:
```json
{
  "repoId": "TheBloke/Llama-2-7B-Chat-GGUF",
  "filename": "llama-2-7b-chat.Q4_K_M.gguf",
  "path": "~/.cache/huggingface/llama-manager/TheBloke/Llama-2-7B-Chat-GGUF/llama-2-7b-chat.Q4_K_M.gguf",
  "sizeBytes": 5435284480,
  "downloadedAt": "2025-01-15T10:30:00Z",
  "sha256": "..."
}
```

#### Storage Path

Default: `$HF_HOME/llama-manager/` (resolves to `~/.cache/huggingface/llama-manager/`)
Configurable via settings. Respects `HF_HOME` env var so users who point it to a large disk get the benefit automatically.

#### Search Interface

```
Search HuggingFace:
  ┌──────────────────────────────────────────────────────────┐
  │  > llama 2 7b                                            │
  └──────────────────────────────────────────────────────────┘

  Results (12):
    TheBloke/Llama-2-7B-Chat-GGUF          14 files  12.4k likes
    bartowski/Llama-2-7B-Chat-GGUF         22 files  3.1k likes
    ...
```

---

## Feature 5: Live Dashboard

### Tab: `[Dashboard]`

Real-time monitoring panel. Polls llama-server API endpoints at configurable interval (default: 2s).

#### Layout

```
┌──────────────────────────────────────────────────────────┐
│  TOKEN STATS              RESOURCE USAGE    QUEUE         │
│                                                          │
│  tokens/s:    42.3     GPU VRAM:    4.2 / 8.0 GB   Active: 1  │
│  prompt t/s:  128.1    CPU RAM:     1.8 / 16.0 GB  Queued: 0  │
│  total:       1,247    GPU Layers:  33 / 33        Completed: 42│
│  eval time:   23.7ms   CPU Threads: 8               Failed:  0  │
│  prompt ms:   184ms                                                   │
└──────────────────────────────────────────────────────────┘
```

#### Metrics Sources

| Metric | Source |
|---|------|
| tokens/s, prompt tokens/s, total tokens | `/stats` API endpoint |
| eval time, prompt ms | `/stats` API endpoint |
| GPU VRAM usage | System command (`nvidia-smi`) or `/stats` if available |
| CPU RAM usage | `/proc/self/status` or `/stats` |
| GPU layers | Server config (`--gpu-layers`) |
| Active/queued/completed/failed | `/stats` or `/queue` endpoint |

#### Connection State

- If server is offline, show: `Server not running. Start server from [Server] tab.`
- Auto-reconnect when server comes back online
- Show last successful poll timestamp

#### Historical Charts (Optional, Phase 2)

- Token/s over time (sparkline in terminal using custom rendering)
- Context usage over time

---

## Configuration File

Path: `$XDG_CONFIG_HOME/llama-manager/config.json` (resolves to `~/.config/llama-manager/config.json`)

```json
{
  "versionsDir": null,
  "modelsDir": null,
  "tasksFile": null,
  "activeVersion": "b7405",
  "activeModel": "TheBloke/Llama-2-7B-Chat-GGUF/llama-2-7b-chat.Q4_K_M.gguf",
  "hfToken": null,
  "server": {
    "logFile": null,
    "freeFormArgs": [
      "--rope-scaling yarn",
      "--rope-freq-scale 0.5"
    ],
    "presets": {
      "server": {
        "host": "127.0.0.1",
        "port": 8080,
        "parallel": -1,
        "timeout": 600,
        "apiKey": null,
        "threadsHttp": -1,
        "contBatching": true,
        "cachePrompt": true,
        "metrics": false,
        "ui": true,
        "embedding": false,
        "rerank": false
      },
      "model": {
        "model": null,
        "lora": null,
        "hfRepo": null,
        "hfToken": null,
        "chatTemplate": null,
        "jinja": true
      },
      "compute": {
        "threads": -1,
        "threadsBatch": null,
        "ctxSize": 0,
        "batchSize": 2048,
        "ubatchSize": 512,
        "flashAttn": "auto",
        "mlock": false,
        "mmap": true,
        "cacheTypeK": "f16",
        "cacheTypeV": "f16"
      },
      "gpu": {
        "gpuLayers": "auto",
        "splitMode": "layer",
        "tensorSplit": null,
        "mainGpu": 0,
        "device": null,
        "fit": "on"
      },
      "sampling": {
        "seed": -1,
        "temperature": 0.8,
        "topK": 40,
        "topP": 0.95,
        "minP": 0.05,
        "repeatLastN": 64,
        "repeatPenalty": 1.0,
        "presencePenalty": 0.0,
        "frequencyPenalty": 0.0,
        "grammar": null,
        "jsonSchema": null,
        "ignoreEos": false
      },
      "speculative": {
        "draftModel": null,
        "specType": "none",
        "draftNMax": 3,
        "draftThreads": null,
        "draftGpuLayers": "auto"
      },
      "reasoning": {
        "reasoning": "auto",
        "reasoningBudget": -1,
        "reasoningFormat": "auto"
      },
      "logging": {
        "logFile": null,
        "logVerbosity": 3,
        "logColors": "auto",
        "logTimestamps": true
      }
    }
  },
  "dashboard": {
    "pollIntervalMs": 2000,
    "killServerOnExit": false
  },
  "tasks": {
    "maxStored": 10000,
    "autoParse": true
  }
}
```

**Path resolution**: Any `null` value falls back to the XDG default from the Storage Paths table above. The config only stores paths the user has explicitly changed.

---

## Directory Structure

```
llama-manager/
├── src/
│   ├── main.ts                 # Entry point (shebang: #!/usr/bin/env node)
│   ├── components/
│   │   ├── App.ts              # Root app: tabs, terminal-kit render loop
│   │   ├── ui/
│   │   │   ├── Control.ts      # Base control: lifecycle, children, dirty flags
│   │   │   ├── Layout.ts       # Column (vertical flex) and Row (horizontal flex)
│   │   │   ├── FocusManager.ts # Singleton focus tracker, Tab navigation
│   │   │   ├── Group.ts        # Control grouping
│   │   │   ├── types.ts        # Rect, Size, RenderContext interfaces
│   │   │   ├── widgets/
│   │   │   │   ├── Label.ts
│   │   │   │   ├── Button.ts
│   │   │   │   ├── ButtonBar.ts
│   │   │   │   ├── TextInput.ts
│   │   │   │   ├── List.ts
│   │   │   │   ├── Scrollable.ts
│   │   │   │   ├── Box.ts
│   │   │   │   ├── Divider.ts
│   │   │   │   ├── Spacer.ts
│   │   │   │   ├── ProgressBar.ts
│   │   │   │   └── HelpBar.ts
│   │   │   └── index.ts        # Re-exports
│   │   └── tabs/
│   │       ├── ServerTab.ts    # ServerControl (profile mgmt, preset editor)
│   │       ├── TasksTab.ts     # TasksControl (task list, stats footer)
│   │       ├── VersionsTab.ts  # VersionsControl (install/switch, releases)
│   │       ├── ModelsTab.ts    # ModelsControl (model list, search, HF browse)
│   │       ├── DashboardTab.ts # DashboardControl (metrics, status polling)
│   │       └── LiveLogsTab.ts  # LiveLogsControl (scrollable log viewer)
│   └── lib/
│       ├── config.ts           # Config I/O, XDG path resolution, defaults
│       ├── server.ts           # Server process management
│       ├── logparser.ts        # Parse server logs, emit task events
│       ├── tasks.ts            # Task storage, filtering, aggregation
│       ├── versions.ts         # Install/switch/uninstall versions
│       ├── models.ts           # HF search, download, local mgmt
│       ├── api.ts              # HTTP client for llama-server API
│       ├── hf.ts               # HuggingFace Hub API client
│       ├── theme.ts            # GitHub Dark palette, fg(), bg(), fgBg()
│       └── tabcontext.ts       # Shared context: services + RenderContext
├── package.json
├── tsconfig.json
└── AGENTS.md
```

---

## Key Dependencies

| Package | Purpose |
|---|---|
| `terminal-kit` | Terminal rendering, input handling, colors |
| `undici` | HTTP requests (llama-server API, GitHub, HuggingFace) |
| `fs-extra` | File operations with promises |
| `chalk` | Terminal colors (legacy, partial) |

---

## CLI Interface

```
llama-manager              # Launch TUI
llama-manager --help       # Show usage
llama-manager --version    # Print version
llama-manager server start # Headless: start server with config
llama-manager server stop  # Headless: stop server
llama-manager models list  # Headless: list local models
```

The TUI is the primary interface. Headless commands are convenience shortcuts that read/write the same config.

---

## Error Handling

- Network failures (HF, GitHub): retry with backoff, show user-friendly message
- Server crashes: detect via process exit code, notify in UI, offer restart
- Disk space: check before downloads, warn if less than 2x model size available
- Permission errors: clear messages for version/model directories
- Version mismatch: if server binary fails, offer to switch version

---

## Feature 6: Model Browser

### Tab: `[Models]` — Enhanced Browse Mode

Extends the existing model search with a full HuggingFace model browser. Accessible via a new "Browse" action alongside "Set Active", "Delete", and "Search". Provides a curated, filterable view of the HuggingFace model hub without requiring a specific search query.

#### Browse Modes

The models tab supports three modes for discovering models:

| Mode | Trigger | Description |
|---|---|------|
| **Search** (existing) | `Search` action + query | Free-text search with GGUF filter |
| **Browse** (new) | `Browse` action | Curated, filterable hub browse |
| **Repo Detail** (existing) | Enter on search result | File listing for a given repo |

#### Browse Interface

```
Browse HuggingFace Models:
  ┌──────────────────────────────────────────────────────────┐
  │  Filters: [All Tasks] [Q4_K_M] [Q5_K_M] [Q8_]  Sort: [↓Likes] │
  │  > mistral 7b                                              │
  └──────────────────────────────────────────────────────────┘

  Results (42):
    bartowski/Mistral-7B-Instruct-v0.3-GGUF      22 files   ♥ 3.1k   ↓ 120k
    ✓ TheBloke/Mistral-7B-v0.1-GGUF              14 files   ♥ 2.8k   ↓ 98k
    Qwen/Qwen2.5-7B-Instruct-GGUF                18 files   ♥ 5.2k   ↓ 240k
    ...

  Storage: 15.29 GB used │ Page 1/5 │ j/k navigate │ f filters │ s sort │ Enter open
```

#### Filters

Filters are applied as query parameters to the HuggingFace API. Each filter is toggleable with `Enter` when focused, navigable with `h`/`l`.

**Task Filters**

| Filter | API Parameter | Description |
|---|---|---|
| Text Generation | `pipeline_tag:text-generation` | General-purpose LLMs |
| Text Generation Infilling | `pipeline_tag:text-generation-infilling` | Fill-in-the-middle models |
| Feature Extraction | `pipeline_tag:feature-extraction` | Embedding models |

**Quantization Filters** (quick-access tags)

| Filter | API Parameter | Description |
|---|---|---|
| Q2_K | `tag:q2_k` | 2-bit quantization |
| Q3_K_S / Q3_K_M / Q3_K_L | `tag:q3_k_*` | 3-bit variants |
| Q4_0 | `tag:q4_0` | Original 4-bit |
| Q4_K_S / Q4_K_M | `tag:q4_k_*` | Q4 K-quants (most common) |
| Q5_K_S / Q5_K_M | `tag:q5_k_*` | Q5 K-quants |
| Q6_K | `tag:q6_k` | 6-bit quantization |
| Q8_0 | `tag:q8_0` | 8-bit quantization |
| FP16 | `tag:fp16` | Half-precision |
| FP32 | `tag:fp32` | Full precision |

**Author / Organization Filters**

| Filter | API Parameter | Description |
|---|---|---|
| TheBloke | `author:TheBloke` | Popular GGUF converter |
| bartowski | `author:bartowski` | Active GGUF quantizer |
| Qwen | `author:Qwen` | Qwen family models |
| meta-llama | `author:meta-llama` | Llama family (may require auth) |

**Sort Options**

| Sort | API Parameter | Description |
|---|---|---|
| Likes (default) | `sort:likes` | Most liked |
| Downloads | `sort:downloads` | Most downloaded |
| Last Modified | `sort:lastModified` | Recently updated |
| Trending | `sort:trending` | Rising popularity |
| Created | `sort:created` | Oldest / newest |

Each sort can be ascending or descending (toggled with `R`).

#### Filter UI

```
  Filters:
    [✓ All Tasks]  [Text Gen]  [Embedding]  [Infilling]
    [Q4_K_M]  [Q5_K_M]  [Q8_]  [FP16]
    [TheBloke]  [bartowski]  [Qwen]
    Sort: [↓Likes]  [↓Downloads]  [↓Modified]  [Trending]

  h/l navigate │ Enter toggle │ g back │ Enter on repo to open
```

Filters are combined with AND logic. The `gguf` tag is always applied. When no filter is active, the "All" option shows top GGUF models sorted by the selected criterion.

#### Model Card Preview

Pressing `m` on a selected repo shows an expanded model card with metadata from the HuggingFace API:

```
  Model Card: bartowski/Mistral-7B-Instruct-v0.3-GGUF

  Author:     bartowski
  Likes:      3,142
  Downloads:  124,583
  Tags:       mistral, gguf, q4_k_m, q5_k_m, q8_0, fp16
  Pipeline:   text-generation
  Created:    15 Mar 2024
  Modified:   02 Jun 2025

  README (first 8 lines):
    # Mistral-7B-Instruct-v0.3 GGUF
    Converted from original Mistral-7B-Instruct-v0.3.
    Quantizations: Q2_K, Q3_K_S/M/L, Q4_0, Q4_K_S/M, ...

  m close │ Enter open files
```

Fetched from `GET /api/models/{repoId}`. Cached locally to avoid repeated API calls.

#### API Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/models?sort={sort}&direction={dir}&search={q}&filter={filter}&limit={n}` | Browse/list models |
| `GET /api/models/{repoId}` | Model metadata (for card preview) |
| `GET /api/models/{repoId}/tree/main` | File listing (existing) |
| `GET /api/whoami` | Auth check — validates HF token |

The browse mode reuses the existing `searchRepos()` function in `hf.ts` but with different default parameters (no search query, different sort/filter). A new `getModelInfo()` function fetches full model metadata for the card preview.

#### New Functions in `hf.ts`

```typescript
export interface HFModelInfo {
  id: string;
  author: string;
  likes: number;
  downloads: number;
  tags: string[];
  pipelineTag: string | null;
  createdAt: string;
  lastModified: string;
  private: boolean;
  disabled: boolean;
  cardData?: {
    language?: string[];
    license?: string;
    library_name?: string;
  };
}

export interface BrowseOptions {
  sort?: "likes" | "downloads" | "lastModified" | "trending" | "created";
  direction?: 1 | -1;
  search?: string;
  filters?: string[];    // e.g. ["author:bartowski", "tag:q4_k_m"]
  limit?: number;
  offset?: number;
}

export async function browseModels(
  options: BrowseOptions,
  token?: string,
): Promise<HFRepoInfo[]>

export async function getModelInfo(
  repoId: string,
  token?: string,
): Promise<HFModelInfo>
```

#### State and Navigation

New focus area: `browse`. New action in the actions bar: `Browse`.

```
Actions:  [Set Active]  [Delete]  [Search]  [Browse]
```

Navigation flow:
1. `g` → actions → `Browse` → Enter
2. Lands in `browse` focus area with filter bar at top
3. `f` → enter filter mode, `h`/`l` navigate filters, `Enter` toggles
4. `s` → enter sort mode, `h`/`l` pick sort, `R` reverse
5. `j`/`k` → navigate results
6. `Enter` → open repo files (download)
7. `m` → model card preview
8. `g` → back to main model list

#### Auth Handling

Gated repos (e.g., `meta-llama/Llama-3.1-8B-Instruct-GGUF`) require authentication. The browser should:
- Show a lock icon (🔒) next to gated repos
- Attempt fetch with token if configured
- Display clear error: `Access denied. Set HF token in config.`
- Provide hint: `Token needed for gated models. Export HF_TOKEN or set in config.`

#### Caching

Model metadata and browse results are cached in memory for the session duration. Model card data (`getModelInfo`) is cached per repo ID to avoid repeated API calls when navigating back to the same repo.

#### Config

No new config fields required. Reuses existing `hfToken` from config. The browse mode is always available alongside the existing search.

---

## Future Considerations

- Multi-server support (run several instances on different ports)
- LoRA adapter management
- Prompt templates library
- Chat interface within the TUI
- Export/import dashboard config
- Plugin system for custom metrics