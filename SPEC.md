# Llama.cpp Dashboard - Specification

## Overview

A terminal UI application built with TypeScript and terminal-kit that provides a unified interface for managing llama.cpp installations, controlling the llama-server process, downloading HuggingFace GGUF models, monitoring server performance in real time, and reviewing historical task statistics.

Uses a custom Control-based UI framework with composable widgets, flex-based layouts, and a singleton focus manager - no React or Ink dependency.

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
| Config | `$XDG_CONFIG_HOME/llama-manager/config.json` | - |
| Versions (builds) | `$XDG_DATA_HOME/llama-manager/versions/` | - |
| Models (GGUF) | `$HF_HOME/llama-manager/` | `HF_HOME` |
| Tasks log | `$XDG_DATA_HOME/llama-manager/tasks.jsonl` | - |
| Server log | `$XDG_STATE_HOME/llama-manager/server.log` | - |

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

1. **`measure()`** - each control reports its desired size
2. **`onLayout()`** - parent distributes available space, assigns child `Rect`s

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

Tab-based navigation with 6 persistent tabs across the top:

```
┌──────────────────────────────────────────────────────────┐
│  F1 Dashboard  F2 Profiles  F3 Tasks  F4 Versions  ...   │
│  ═══════════════════════════════════════════════════════  │
│                                                          │
│  <Active tab content fills remaining terminal height>    │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  Dashboard | F1-F6 navigate | q quit | ? help            │
└──────────────────────────────────────────────────────────┘
```

### Navigation

| Input | Action |
|---|---|
| `F1`-`F6` | Switch tabs |
| `Tab` / `Shift+Tab` | Move focus between controls |
| `Enter` | Confirm / select |
| `Esc` | Cancel / go back |
| `q` | Quit application |
| `?` | Show help overlay |

---

## Feature 1: Server Profiles

### Tab: `F2 Profiles`

Manages server profiles - named collections of preset arguments and free-form arguments. Each profile can be activated independently, allowing quick switching between different server configurations (e.g., one for chat, one for embeddings, one for experimentation).

#### Profile List

- **Create** - add a new profile (clones current presets)
- **Rename** - change profile name
- **Delete** - remove profile (blocked if active)
- **SetActive** - mark profile as active for server start
- Active profile shown with indicator

#### Settings Panel

Inline editor for all preset categories. Fields are type-aware with inline editing:

- String fields: free text, Enter to save
- Number fields: numeric input with validation
- Boolean fields: toggle true/false
- Enum fields: cycle through options

Categories: Server, Model, Compute, GPU, Sampling, Speculative, Reasoning, Logging.

#### Free-Form Arguments

Multi-line text input per profile for arbitrary `--flag value` pairs not covered by presets.

#### Devices Button

Probes `llama-server --list-devices` to show available GPU/CPU devices for the active version.

The final command line is assembled as:
```
<active-version>/llama-server <preset-args> <free-form-args>
```

#### Curated Presets

Commonly-used arguments exposed as typed UI controls, organized by category. New flags are added to the dashboard over time, but anything missing is covered by the free-form args field below.

**Server**

| Argument | Type | Default | Description |
|---|---|---|---|
| `--host` | string | `127.0.0.1` | Bind address |
| `--port` | number | `8080` | HTTP port |
| `--parallel` | number | `-1` | Number of server slots (auto) |
| `--timeout` | number | `600` | Read/write timeout in seconds |
| `--api-key` | string | - | API key for authentication |
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
| `--model` | string | - | Path to GGUF model |
| `--lora` | string | - | LoRA adapter path (comma-separated) |
| `--hf-repo` | string | - | HuggingFace repo (`user/model[:quant]`) |
| `--hf-token` | string | - | HuggingFace access token |
| `--chat-template` | string | - | Built-in or custom Jinja template name |
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
| `--tensor-split` | string | - | GPU offload proportions (`3,1`) |
| `--main-gpu` | number | `0` | Primary GPU index |
| `--device` | string | - | Comma-separated device list |
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
| `--grammar` | string | - | BNF grammar constraint |
| `--json-schema` | string | - | JSON schema constraint |
| `--ignore-eos` | boolean | `false` | Ignore end-of-stream token |

**Speculative Decoding**

| Argument | Type | Default | Description |
|---|---|---|---|
| `--spec-draft-model` | string | - | Draft model path |
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
| `--log-file` | string | - | Log output file path |
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
- On dashboard quit, server is **not** killed by default (configurable via `dashboard.killServerOnExit`)
- Config is persisted to `$XDG_CONFIG_HOME/llama-manager/config.json` after every change

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

- **Install** - download prebuilt binary from GitHub releases (`ggerganov/llama.cpp`)
  - Detect OS + architecture (Linux x86_64, Linux ARM64, macOS x86_64, macOS ARM64)
  - Download ZIP, extract to `$HOME/.llama-manager/versions/<version>/`
  - Show download progress bar
- **Switch** - mark a version as active (updates config, restarts server if running)
- **Uninstall** - remove version directory (blocked if version is active)
- **Check Updates** - fetch latest release tag from GitHub API

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

- **Search** - query HuggingFace API for GGUF models
  - Filter by tag `gguf`
  - Show repo name, size, last modified, likes
- **Download** - fetch model file(s) with progress tracking
  - Uses HuggingFace `hf_hub_download` endpoint or direct URL
  - Resumes interrupted downloads
  - Shows ETA and current speed
- **Delete** - remove local model file
- **Set Active** - mark model for server to use on next start
- **Browse Local** - file browser for models directory

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

## Feature 5: Dashboard

### Tab: `F1 Dashboard`

Combined monitoring and server control panel. Includes metrics, server status, start/stop/restart buttons, and a live log viewer.

#### Layout

```
┌──────────────────────────────────────────────────────────┐
│  [Start]  [Stop]  [Restart]        Profile: Default      │
│  ───────────────────────────────────────────────────────  │
│  Prompt/s: 128.1    Predict/s: 42.3                      │
│  Processing: 1        Deferred: 0                        │
│  ───────────────────────────────────────────────────────  │
│  Running  PID: 12345  Uptime: 2h 15m                     │
│  ───────────────────────────────────────────────────────  │
│  [Live server log viewer - scrollable, colored]          │
│  ...                                                      │
└──────────────────────────────────────────────────────────┘
```

#### Metrics

Polls llama-server `/metrics` (Prometheus endpoint) at configurable interval (default: 2s).

| Metric | Source |
|---|------|
| Prompt/s | `/metrics` - `llama_tokens_per_second` (prompt) |
| Predict/s | `/metrics` - `llama_tokens_per_second` (predicted) |
| Processing | `/metrics` - `llama_requests_processing` |
| Deferred | `/metrics` - `llama_requests_deferred` |

#### Server Controls

- **Start** - launches `llama-server` with active profile config
- **Stop** - graceful shutdown (SIGTERM, then SIGKILL after timeout)
- **Restart** - stop then start

#### Live Log Viewer

Bottom panel shows live server stdout/stderr with structured coloring:
- Error lines highlighted in red
- Warning lines highlighted in yellow
- Scrollable, follows latest output
- Managed by `LogsViewer` specialized component

#### Connection State

- If server is offline, metrics show `-`
- Auto-reconnect when server comes back online

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
    "profiles": {
      "Default": {
        "presets": {
          "server": { "host": "127.0.0.1", "port": 8080, "parallel": -1, "timeout": 600, "apiKey": null, "threadsHttp": -1, "contBatching": true, "cachePrompt": true, "metrics": false, "ui": true, "embedding": false, "rerank": false },
          "model": { "model": null, "lora": null, "hfRepo": null, "chatTemplate": null, "jinja": true },
          "compute": { "threads": -1, "threadsBatch": null, "ctxSize": 0, "batchSize": 2048, "ubatchSize": 512, "flashAttn": "auto", "mlock": false, "mmap": true, "cacheTypeK": "f16", "cacheTypeV": "f16" },
          "gpu": { "gpuLayers": "auto", "splitMode": "layer", "tensorSplit": null, "mainGpu": 0, "device": null, "fit": "on" },
          "sampling": { "seed": -1, "temperature": 0.8, "topK": 40, "topP": 0.95, "minP": 0.05, "repeatLastN": 64, "repeatPenalty": 1.0, "presencePenalty": 0.0, "frequencyPenalty": 0.0, "grammar": null, "jsonSchema": null, "ignoreEos": false },
          "speculative": { "draftModel": null, "specType": "none", "draftNMax": 3, "draftThreads": null, "draftGpuLayers": "auto" },
          "reasoning": { "reasoning": "auto", "reasoningBudget": -1, "reasoningFormat": "auto" },
          "logging": { "logFile": null, "logVerbosity": 3, "logColors": "auto", "logTimestamps": true }
        },
        "freeFormArgs": []
      }
    },
    "activeProfile": "Default"
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

**Profile-based config**: Server presets are organized per-profile. Each profile has its own `presets` and `freeFormArgs`. The `activeProfile` determines which config is used on server start. Legacy flat config (pre-profiles) is auto-migrated on load.

**Path resolution**: Any `null` value falls back to the XDG default from the Storage Paths table above. The config only stores paths the user has explicitly changed.

---

## Directory Structure

```
llama-manager/
├── src/
│   ├── main.ts                         # Entry point (shebang: #!/usr/bin/env node)
│   ├── components/
│   │   ├── App.ts                      # Root app: 6 tabs, render loop, key handling
│   │   ├── ui/
│   │   │   ├── Control.ts              # Base control: lifecycle, children, dirty flags
│   │   │   ├── Layout.ts               # Column (vertical flex) and Row (horizontal flex)
│   │   │   ├── FocusManager.ts         # Singleton focus tracker, Tab navigation
│   │   │   ├── Group.ts                # Control grouping
│   │   │   ├── types.ts                # Rect, Size, RenderContext interfaces
│   │   │   ├── widgets/
│   │   │   │   ├── Label.ts
│   │   │   │   ├── Button.ts
│   │   │   │   ├── TextInput.ts
│   │   │   │   ├── List.ts
│   │   │   │   ├── Scrollable.ts
│   │   │   │   ├── Box.ts
│   │   │   │   ├── Divider.ts
│   │   │   │   ├── Spacer.ts
│   │   │   │   ├── ProgressBar.ts
│   │   │   │   └── HelpBar.ts
│   │   │   └── index.ts                # Re-exports
│   │   ├── specialized/
│   │   │   ├── SettingsPanel.ts        # Profile settings editor (type-aware fields)
│   │   │   ├── ProfileList.ts          # Clickable profile list with CRUD actions
│   │   │   ├── LogsViewer.ts           # Structured log coloring, scrollable
│   │   │   └── OptionsPanel.ts         # Global app settings editor
│   │   └── tabs/
│   │       ├── DashboardTab.ts         # F1: Metrics, server controls, live log viewer
│   │       ├── ServerTab.ts            # F2: Profile management, preset editing
│   │       ├── TasksTab.ts             # F3: Parsed task history with columns
│   │       ├── VersionsTab.ts          # F4: Local versions, GitHub install/uninstall
│   │       ├── ModelsTab.ts            # F5: Local GGUFs, HF browse, download
│   │       └── OptionsTab.ts           # F6: Global app settings
│   └── lib/
│       ├── config.ts                   # Config I/O, XDG paths, profiles, presets, migration
│       ├── server.ts                   # Server process management, log tailing
│       ├── logparser.ts                # Parse server logs, emit task events
│       ├── logcolors.ts                # Log line colorization by severity
│       ├── tasks.ts                    # Task storage, filtering, aggregation
│       ├── versions.ts                 # Install/switch/uninstall versions
│       ├── models.ts                   # HF search, download, local mgmt
│       ├── api.ts                      # HTTP client for llama-server API (/metrics)
│       ├── hf.ts                       # HuggingFace Hub API client
│       ├── theme.ts                    # GitHub Dark palette, fg(), bg(), fgBg()
│       ├── utils.ts                    # Formatting: fireAsync, formatMs, formatDuration, etc.
│       └── tabcontext.ts               # Shared context: services + RenderContext
├── package.json
├── tsconfig.json
├── SPEC.md
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

## Error Handling

- Network failures (HF, GitHub): retry with backoff, show user-friendly message
- Server crashes: detect via process exit code, notify in UI, offer restart
- Disk space: check before downloads, warn if less than 2x model size available
- Permission errors: clear messages for version/model directories
- Version mismatch: if server binary fails, offer to switch version

---

## Feature 6: Options

### Tab: `F6 Options`

Global application settings. Managed by `OptionsPanel` specialized component. All fields are inline-editable with save on Enter.

#### Settings Categories

**Paths**
- `versionsDir` - custom directory for llama.cpp builds
- `modelsDir` - custom directory for GGUF models
- `tasksFile` - custom path for tasks JSONL
- `logFile` - custom path for server log

**Dashboard**
- `pollIntervalMs` - metrics polling interval (default: 2000ms)
- `killServerOnExit` - whether to kill server on app quit (default: false)

**Tasks**
- `maxStored` - maximum tasks in history (default: 10000)
- `autoParse` - automatic log parsing (default: true)

**Appearance**
- `compactTasks` - compact task list layout
- `showDraftRate` - display draft acceptance rate in tasks

**HuggingFace**
- `hfToken` - access token for gated models

---

## Future Considerations

- Enhanced model browser with filters, sort, and model card preview
- Multi-server support (run several instances on different ports)
- LoRA adapter management
- Prompt templates library
- Chat interface within the TUI
- Export/import dashboard config
- Plugin system for custom metrics
- CLI headless commands (`server start/stop`, `models list`)
- Historical charts (sparklines for token/s over time)