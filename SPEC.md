# Llama.cpp Dashboard - Specification

## Overview

A terminal UI application built with TypeScript that provides a unified interface for managing llama.cpp installations, controlling the llama-server process, downloading HuggingFace GGUF models, monitoring server performance in real time, and reviewing historical task statistics.

Uses a custom Control-based UI framework with composable widgets, flex-based layouts, a double-buffered framebuffer with diff-based rendering, and a singleton focus manager - no React or Ink dependency. terminal-kit is used only for input handling and ANSI escape sequences.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Language | TypeScript |
| TUI Framework | terminal-kit (input handling only) |
| Rendering | Double-buffered framebuffer with diff-based terminal output |
| UI Architecture | Custom Control tree with Column/Row layouts, MainControl root |
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
| Tasks database | `$XDG_DATA_HOME/llama-manager/tasks.db` | - |
| Server log | `$XDG_STATE_HOME/llama-manager/server.log` | - |

**Resolved defaults** (when env vars are unset):

| What | Resolved Path |
|---|---|
| Config | `~/.config/llama-manager/config.json` |
| Versions | `~/.local/share/llama-manager/versions/` |
| Models | `~/.cache/huggingface/llama-manager/` |
| Tasks | `~/.local/share/llama-manager/tasks.db` |
| Server log | `~/.local/state/llama-manager/server.log` |

Models live under `HF_HOME` so users who already set `HF_HOME` to a large disk get the benefit automatically. All paths are configurable in `config.json`.

---

## UI Architecture

### Control Tree

The UI is built from a hierarchy of `Control` instances. Each control manages its own presentation state (selected index, scroll offset, edit value) and renders itself to a `FramebufferCanvas`. The `MainControl` serves as the root, managing the top bar, tab bar, content area, status bar, and bottom half-block divider.

```
MainControl
├─ Row (top bar)
│  ├─ Label (app title)
│  └─ Label (version)
├─ Row (tab bar)
│  └─ TabBar (F1-F6 tabs with active indicator)
├─ Group (tab content)
│  └─ TabContent (active tab control, swapped on navigation)
├─ Row (status bar)
│  ├─ Label (active tab name)
│  ├─ Spacer
│  └─ Label (shortcut hints)
├─ HalfBar (decorative divider)
└─ FocusManager (singleton, tracks single focus point)
```

### Layout System

Two-pass layout with flex-based space distribution:

1. **`measure()`** - each control reports its desired size
2. **`onLayout()`** - parent distributes available space, assigns child `Rect`s

`Column` distributes vertically (flex along Y), `Row` distributes horizontally (flex along X). Controls without `flex` get their measured size; remaining space goes to flexible children proportionally.

### Focus Management

`FocusManager` singleton tracks a single focus point. Tab/Shift+Tab navigates through focusable controls in tree order. Key events are delivered to the focused control. Mouse events (click, scroll) are supported for tab switching, list selection, and scrollable regions. When a control has no focusable children, the manager falls back to the root for key delivery.

### Rendering

Double-buffered framebuffer with diff-based terminal output:

1. **Framebuffer** (`framebuffer.ts`) - two cell grids (front/back buffer), each cell storing character, foreground color, background color, and bold/underline attributes. Buffers are swapped after each frame.
2. **FramebufferCanvas** (`framebuffer-canvas.ts`) - drawing API with cursor positioning, clipping, color resolution (theme defs to 256-color or truecolor), and text rendering. Controls render to the canvas.
3. **FramebufferDiff** (`framebuffer-diff.ts`) - row-level diff with run-length encoding to minimize ANSI output. Only changed regions are sent to the terminal, preserving cursor position and minimizing flicker.

Dirty flags (`needsRender`) on controls determine which subtrees need re-rendering to the framebuffer.

### RenderContext

Shared context object passed to controls, providing access to the `FramebufferCanvas`, app services (config, server, tasks, versions, models, api, hf), and `ctx.showMessage` for transient status notifications.

### Widgets

| Widget | Purpose |
|---|---|
| `Label` | Static text display |
| `Button` | Clickable/focusable action button |
| `ButtonBar` | Horizontal row of buttons |
| `TextInput` | Single-line text input with cursor |
| `List` | Scrollable selectable list |
| `Table` | Virtual-scrolling table with columns, sorting, custom renderers |
| `Scrollable` | Scrollable content container |
| `Box` | Bordered container (Unicode box-drawing) |
| `StyledText` | Multi-color text segments with builder pattern |
| `Section` | Titled section with left border and background |
| `HalfBar` | Half-block decorative divider |
| `Spacer` | Flexible space filler |
| `ProgressBar` | Download/operation progress |
| `HelpBar` | Bottom status bar with key hints |

---

## UI Structure

Tab-based navigation with 6 persistent tabs across the top:

```
┌─────────────────────────────────────────────────────────┐
│  Llama Dashboard                     b7405              │
│  F1 Dashboard  F2 Tasks  F3 Profiles  F4 Versions  ...  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
├─────────────────────────────────────────────────────────┤
│  <Active tab content fills remaining terminal height>   │
├─────────────────────────────────────────────────────────┤
│  Dashboard                      F1-F6 navigate | q quit │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
└─────────────────────────────────────────────────────────┘
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
| Mouse click | Select tabs, list items, buttons |
| Mouse scroll | Scroll in log viewer, tables, lists |

---

## Feature 1: Server Profiles

### Tab: `F3 Profiles`

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
| `--parallel` | number | `-1` | Server slots (-1=auto) |
| `--timeout` | number | `600` | Read/write timeout (s) |
| `--api-key` | string | - | API key |
| `--threads-http` | number | `-1` | HTTP worker threads |
| `--cont-batching` | boolean | `true` | Continuous batching |
| `--cache-prompt` | boolean | `true` | Prompt caching |
| `--metrics` | boolean | `false` | Prometheus metrics |
| `--ui` | boolean | `true` | Built-in Web UI |
| `--embedding` | boolean | `false` | Embeddings mode |
| `--rerank` | boolean | `false` | Reranking endpoint |
| `--predict` | number | `-1` | Max tokens to predict (-1=inf) |
| `--cache-reuse` | number | `0` | Min chunk size for KV cache reuse |
| `--cache-ram` | number | `8192` | Max cache size (MiB) |
| `--kv-unified` | boolean | `true` | Unified KV buffer |
| `--cache-idle-slots` | boolean | `true` | Save/clear idle slots |
| `--ctx-checkpoints` | number | `32` | Context checkpoints per slot |
| `--checkpoint-every-n-tokens` | number | `8192` | Checkpoint interval |
| `--context-shift` | boolean | `false` | Context shift for infinite gen |
| `--warmup` | boolean | `true` | Warmup with empty run |
| `--special` | boolean | `false` | Output special tokens |
| `--skip-chat-parsing` | boolean | `false` | Force pure content parser |
| `--prefill-assistant` | boolean | `true` | Prefill assistant response |
| `--slot-prompt-similarity` | number | `0.10` | Slot prompt similarity |
| `--slot-save-path` | string | - | Slot KV cache save path |
| `--reuse-port` | boolean | `false` | Allow port reuse |
| `--props` | boolean | `false` | Enable /props endpoint |
| `--no-slots` | boolean | `false` | Disable slots endpoint |
| `--sleep-idle-seconds` | number | `-1` | Sleep after idle (s, -1=off) |
| `--tools` | string | - | Built-in tools (all/...) |
| `--ui-mcp-proxy` | boolean | `false` | MCP CORS proxy |
| `--media-path` | string | - | Media files directory |
| `--alias` | string | - | Model name aliases |
| `--api-key-file` | string | - | API keys file path |
| `--ssl-key-file` | string | - | SSL private key |
| `--ssl-cert-file` | string | - | SSL certificate |
| `--path` | string | - | Static files path |
| `--api-prefix` | string | - | API prefix path |

**Model**

| Argument | Type | Default | Description |
|---|---|---|---|
| `--model` | string | - | GGUF model path |
| `--lora` | string | - | LoRA adapter path |
| `--hf-repo` | string | - | HF repo (user/model[:quant]) |
| `--chat-template` | string | - | Chat template name |
| `--jinja` | boolean | `true` | Jinja template engine |
| `--mmproj` | string | - | Multimodal projector path |
| `--mmproj-auto` | boolean | `true` | Auto-download mmproj |
| `--mmproj-offload` | boolean | `true` | GPU offload mmproj |
| `--chat-template-file` | string | - | Chat template file |
| `--chat-template-kwargs` | string | - | Chat template JSON kwargs |
| `--lora-scaled` | string | - | LoRA with scaling |
| `--lora-init-without-apply` | boolean | `false` | Load LoRA without applying |
| `--model-url` | string | - | Model download URL |
| `--docker-repo` | string | - | Docker Hub model repo |

**Compute**

| Argument | Type | Default | Description |
|---|---|---|---|
| `--threads` | number | `-1` | CPU threads |
| `--threads-batch` | number | - | Batch threads |
| `--ctx-size` | number | `0` | Context size (0=model) |
| `--batch-size` | number | `2048` | Max batch size |
| `--ubatch-size` | number | `512` | Physical batch size |
| `--flash-attn` | enum | `auto` | Flash Attention (`on`/`off`/`auto`) |
| `--mlock` | boolean | `false` | Lock model in RAM |
| `--mmap` | boolean | `true` | Memory-map model |
| `--cache-type-k` | enum | `f16` | KV cache K type |
| `--cache-type-v` | enum | `f16` | KV cache V type |
| `--cpu-moe` | boolean | `false` | Keep MoE weights on CPU |
| `--no-kv-offload` | boolean | `false` | Disable KV cache offloading |
| `--no-host` | boolean | `false` | Bypass host buffer |
| `--direct-io` | boolean | `false` | Use DirectIO |
| `--numa` | enum | - | NUMA (`distribute`/`isolate`/`numactl`) |
| `--rope-scaling` | enum | - | RoPE scaling (`none`/`linear`/`yarn`) |
| `--rope-freq-scale` | number | - | RoPE frequency scaling factor |
| `--rope-freq-base` | number | - | RoPE base frequency |

**GPU**

| Argument | Type | Default | Description |
|---|---|---|---|
| `--gpu-layers` | string | `auto` | VRAM layers (auto/number) |
| `--split-mode` | enum | `layer` | Multi-GPU split (`none`/`layer`/`row`/`tensor`) |
| `--tensor-split` | string | - | GPU proportions (3,1) |
| `--main-gpu` | number | `0` | Primary GPU index |
| `--device` | string | - | Device list |
| `--fit` | enum | `on` | Auto-fit to VRAM |
| `--fit-target` | string | - | Target VRAM margin per GPU (MiB) |
| `--fit-ctx` | number | - | Min ctx size for --fit |
| `--override-tensor` | string | - | Override tensor buffer type |

**Sampling**

| Argument | Type | Default | Description |
|---|---|---|---|
| `--seed` | number | `-1` | RNG seed (-1=random) |
| `--temperature` | number | `0.8` | Temperature |
| `--top-k` | number | `40` | Top-k (0=off) |
| `--top-p` | number | `0.95` | Top-p (1.0=off) |
| `--min-p` | number | `0.05` | Min-p (0.0=off) |
| `--repeat-last-n` | number | `64` | Penalty window |
| `--repeat-penalty` | number | `1.0` | Repeat penalty |
| `--presence-penalty` | number | `0.0` | Presence penalty |
| `--frequency-penalty` | number | `0.0` | Frequency penalty |
| `--grammar` | string | - | BNF grammar |
| `--json-schema` | string | - | JSON schema |
| `--ignore-eos` | boolean | `false` | Ignore EOS token |
| `--typical-p` | number | `1.0` | Locally typical sampling |
| `--top-n-sigma` | number | `-1.0` | Top-n-sigma sampling (-1=off) |
| `--xtc-probability` | number | `0.0` | XTC probability |
| `--xtc-threshold` | number | `0.1` | XTC threshold |
| `--dry-multiplier` | number | `0.0` | DRY multiplier |
| `--dry-base` | number | `1.75` | DRY base value |
| `--dynatemp-range` | number | `0.0` | Dynamic temp range |
| `--dynatemp-exp` | number | `1.0` | Dynamic temp exponent |
| `--mirostat` | number | `0` | Mirostat (0=off, 1, 2) |
| `--mirostat-ent` | number | `5.0` | Mirostat target entropy |
| `--mirostat-lr` | number | `0.1` | Mirostat learning rate |
| `--logit-bias` | string | - | Token bias |
| `--grammar-file` | string | - | Grammar file path |
| `--json-schema-file` | string | - | JSON schema file path |
| `--backend-sampling` | boolean | `false` | Backend sampling |
| `--adaptive-target` | number | `-1.0` | Adaptive-p target |
| `--adaptive-decay` | number | `0.90` | Adaptive-p decay |
| `--sampling-seq` | string | - | Sampler sequence |

**Speculative**

| Argument | Type | Default | Description |
|---|---|---|---|
| `--spec-draft-model` | string | - | Draft model path |
| `--spec-type` | string | `none` | Spec type |
| `--spec-draft-n-max` | number | `3` | Max draft tokens |
| `--spec-draft-threads` | number | - | Draft threads |
| `--spec-draft-gpu-layers` | string | `auto` | Draft GPU layers |
| `--spec-draft-n-min` | number | `0` | Min draft tokens |
| `--spec-draft-p-split` | number | `0.10` | Split probability |
| `--spec-draft-p-min` | number | `0.75` | Min probability (greedy) |
| `--spec-draft-hf-repo` | string | - | HF repo for draft model |
| `--cache-type-k-draft` | enum | `f16` | KV cache K type (draft) |
| `--cache-type-v-draft` | enum | `f16` | KV cache V type (draft) |

**Reasoning**

| Argument | Type | Default | Description |
|---|---|---|---|
| `--reasoning` | enum | `auto` | Thinking mode (`on`/`off`/`auto`) |
| `--reasoning-budget` | number | `-1` | Thinking token budget |
| `--reasoning-format` | enum | `auto` | Format (`none`/`deepseek`/`deepseek-legacy`/`auto`) |
| `--reasoning-budget-message` | string | - | Budget exhausted message |

**Logging**

| Argument | Type | Default | Description |
|---|---|---|---|
| `--log-verbosity` | number | `3` | Verbosity (0-5) |
| `--log-colors` | enum | `auto` | Colored logs (`on`/`off`/`auto`) |
| `--log-timestamps` | boolean | `true` | Include timestamps |
| `--log-prefix` | boolean | `false` | Enable log prefix |

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

### Tab: `F2 Tasks`

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

Completed tasks are stored in a SQLite database (`better-sqlite3`) at `$XDG_DATA_HOME/llama-manager/tasks.db`. Two tables:

- **`tasks`** - one row per completed task with all parsed fields (taskId, slotId, promptTokens, outputTokens, speeds, times, draft stats, contextSize, truncated, timestamp)
- **`stats`** - aggregated statistics: total tasks, avg prompt speed, avg output speed, total tokens, average draft acceptance rate

The `TaskStore` class provides prepared-statement insert, query with filtering/sorting, and live tailing of the log file. A migration from legacy JSONL to SQLite runs automatically on first access.

#### Log Parsing

`lib/logparser.ts` parses `slot print_timing` and `slot release` lines from the server log, emitting structured `TaskMetrics` objects via EventEmitter. `lib/metricstracker.ts` parses live slot metrics (state, speed, progress, checkpoints, context size, thinking mode) for the real-time dashboard display.

---

## Feature 3: Version Management

### Tab: `F4 Versions`

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

- **Install** - download prebuilt binary from GitHub releases (`ggml-org/llama.cpp`)
  - Select backend: `cpu`, `metal`, `cuda12`, `cuda13`, `vulkan`, `rocm`, `sycl_blas`, `sycl_metal`
  - Detect OS + architecture (Linux x86_64, Linux ARM64, macOS x86_64, macOS ARM64)
  - Download ZIP, extract to `$XDG_DATA_HOME/llama-manager/versions/<version>/`
  - Show download progress bar
  - Persist installed versions in `versions.json` in data directory
- **Switch** - mark a version as active (updates config, restarts server if running)
- **Uninstall** - remove version directory and metadata (blocked if version is active)
- **Check Updates** - fetch latest release tag from GitHub API

#### Prebuilt Binary Resolution

For each version and backend, look for the appropriate build artifact in the GitHub release assets. Fallback chain:
1. Official prebuilt release asset matching OS/arch/backend
2. Community build if official unavailable
3. If no prebuilt found, show error with link to manual build instructions

#### Storage Path

Default: `$XDG_DATA_HOME/llama-manager/versions/` (resolves to `~/.local/share/llama-manager/versions/`)
Configurable via settings.

---

## Feature 4: Model Management

### Tab: `F5 Models`

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
│  Slot 0:  ● decode  42.3 t/s  ██████████░░  ctx: 8192    │
│  Slot 1:  ● prompt  518.6 t/s  ████████████  ctx: 4096   │
│  Slot 2:  ○ idle                                      │
│  ───────────────────────────────────────────────────────  │
│  Running  PID: 12345  Uptime: 2h 15m                     │
│  ───────────────────────────────────────────────────────  │
│  [Live server log viewer - scrollable, colored]          │
│  ...                                                      │
└──────────────────────────────────────────────────────────┘
```

#### Metrics

Two sources for real-time metrics:

1. **MetricsTracker** (`lib/metricstracker.ts`) - parses server log lines for per-slot state (launch, idle, loading, decoding, prompt processing), token speeds (TG/s, TPG/s), checkpoint progress, context size, and thinking mode. Provides per-slot and aggregated metrics.
2. **Prometheus API** (`lib/api.ts`) - polls llama-server `/metrics` endpoint at configurable interval (default: 2s) for additional server-wide statistics.

| Metric | Source |
|---|------|
| Slot state | Log parsing (`slot *` lines) |
| Token speed (TG/s, TPG/s) | Log parsing (`MetricsTracker`) |
| Checkpoint progress | Log parsing (`MetricsTracker`) |
| Context size | Log parsing (`slot release` lines) |
| Thinking mode | Log parsing (`MetricsTracker`) |
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
  "themeName": "opencode",
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
          "server": { "host": "127.0.0.1", "port": 8080, "parallel": -1, "timeout": 600, "apiKey": null, "threadsHttp": -1, "contBatching": true, "cachePrompt": true, "metrics": false, "ui": true, "embedding": false, "rerank": false, "predict": -1, "cacheReuse": 0, "cacheRam": 8192, "kvUnified": true, "cacheIdleSlots": true, "ctxCheckpoints": 32, "checkpointEveryN": 8192, "contextShift": false, "warmup": true, "special": false, "skipChatParsing": false, "prefillAssistant": true, "slotPromptSim": 0.10, "slotSavePath": null, "reusePort": false, "props": false, "noSlots": false, "sleepIdle": -1, "tools": null, "uiMcpProxy": false, "mediaPath": null, "alias": null, "apiKeyFile": null, "sslKeyFile": null, "sslCertFile": null, "path": null, "apiPrefix": null },
          "model": { "model": null, "lora": null, "hfRepo": null, "chatTemplate": null, "jinja": true, "mmproj": null, "mmprojAuto": true, "mmprojOffload": true, "chatTemplateFile": null, "chatTemplateKwargs": null, "loraScaled": null, "loraInitWithoutApply": false, "modelUrl": null, "dockerRepo": null },
          "compute": { "threads": -1, "threadsBatch": null, "ctxSize": 0, "batchSize": 2048, "ubatchSize": 512, "flashAttn": "auto", "mlock": false, "mmap": true, "cacheTypeK": "f16", "cacheTypeV": "f16", "cpuMoe": false, "noKvOffload": false, "noHost": false, "directIo": false, "numa": null, "ropeScaling": null, "ropeFreqScale": null, "ropeFreqBase": null },
          "gpu": { "gpuLayers": "auto", "splitMode": "layer", "tensorSplit": null, "mainGpu": 0, "device": null, "fit": "on", "fitTarget": null, "fitCtx": null, "overrideTensor": null },
          "sampling": { "seed": -1, "temperature": 0.8, "topK": 40, "topP": 0.95, "minP": 0.05, "repeatLastN": 64, "repeatPenalty": 1.0, "presencePenalty": 0.0, "frequencyPenalty": 0.0, "grammar": null, "jsonSchema": null, "ignoreEos": false, "typicalP": 1.0, "topNSigma": -1.0, "xtcProbability": 0.0, "xtcThreshold": 0.1, "dryMultiplier": 0.0, "dryBase": 1.75, "dynatempRange": 0.0, "dynatempExp": 1.0, "mirostat": 0, "mirostatEnt": 5.0, "mirostatLr": 0.1, "logitBias": null, "grammarFile": null, "jsonSchemaFile": null, "backendSampling": false, "adaptiveTarget": -1.0, "adaptiveDecay": 0.90, "samplingSeq": null },
          "speculative": { "draftModel": null, "specType": "none", "draftNMax": 3, "draftThreads": null, "draftGpuLayers": "auto", "draftNMin": 0, "draftPSplit": 0.10, "draftPMin": 0.75, "draftHfRepo": null, "draftCacheTypeK": "f16", "draftCacheTypeV": "f16" },
          "reasoning": { "reasoning": "auto", "reasoningBudget": -1, "reasoningFormat": "auto", "reasoningBudgetMessage": null },
          "logging": { "logVerbosity": 3, "logColors": "auto", "logTimestamps": true, "logPrefix": false }
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
│   │   ├── MainControl.ts              # Root control: top bar, tab bar, content, status bar
│   │   ├── ui/
│   │   │   ├── Control.ts              # Base control: lifecycle, children, dirty flags, events
│   │   │   ├── Layout.ts               # Column (vertical flex), Row (horizontal flex), Group
│   │   │   ├── FocusManager.ts         # Singleton focus tracker, Tab navigation
│   │   │   ├── types.ts                # Rect, Size, RenderContext interfaces
│   │   │   ├── widgets/
│   │   │   │   ├── Label.ts
│   │   │   │   ├── Button.ts
│   │   │   │   ├── ButtonBar.ts
│   │   │   │   ├── TextInput.ts
│   │   │   │   ├── List.ts
│   │   │   │   ├── Table.ts            # Virtual-scrolling table with columns, sorting
│   │   │   │   ├── Scrollable.ts
│   │   │   │   ├── Box.ts
│   │   │   │   ├── StyledText.ts       # Multi-color text segments, builder pattern
│   │   │   │   ├── Section.ts          # Titled section with left border, background
│   │   │   │   ├── HalfBar.ts          # Half-block decorative divider
│   │   │   │   ├── Spacer.ts
│   │   │   │   ├── ProgressBar.ts
│   │   │   │   └── HelpBar.ts
│   │   │   └── index.ts                # Re-exports
│   │   ├── specialized/
│   │   │   ├── SettingsPanel.ts        # Profile settings editor (type-aware fields)
│   │   │   ├── ProfileList.ts          # Clickable profile list with CRUD actions
│   │   │   ├── LogsViewer.ts           # Structured log coloring, scrollable
│   │   │   ├── MetricsPanel.ts         # Per-slot metrics: state dots, speed bars, checkpoints
│   │   │   └── OptionsPanel.ts         # Global app settings editor
│   │   └── tabs/
│   │       ├── DashboardTab.ts         # F1: Metrics, server controls, live log viewer
│   │       ├── TasksTab.ts             # F2: Parsed task history with columns
│   │       ├── ServerTab.ts            # F3: Profile management, preset editing
│   │       ├── VersionsTab.ts          # F4: Local versions, GitHub install/uninstall
│   │       ├── ModelsTab.ts            # F5: Local GGUFs, HF browse, download
│   │       └── OptionsTab.ts           # F6: Global app settings
│   └── lib/
│       ├── config.ts                   # Config I/O, XDG paths, profiles, presets, migration
│       ├── server.ts                   # Server process management, log tailing
│       ├── logparser.ts                # Parse server logs, emit task events
│       ├── logcolors.ts                # Log line colorization by severity
│       ├── metricstracker.ts           # Real-time slot metrics (state, speed, checkpoints)
│       ├── tasks.ts                    # SQLite TaskStore (better-sqlite3), filtering, migration
│       ├── versions.ts                 # Install/switch/uninstall versions, GitHub releases
│       ├── models.ts                   # HF search, download, local mgmt
│       ├── api.ts                      # HTTP client for llama-server API (/metrics)
│       ├── hf.ts                       # HuggingFace Hub API client
│       ├── theme.ts                    # Theme resolution (JSON themes, semantic roles)
│       ├── framebuffer.ts              # Double-buffered cell grid
│       ├── framebuffer-canvas.ts       # Drawing API: cursor, clipping, color, text
│       ├── framebuffer-diff.ts         # Row-level diff, run-length encoded ANSI output
│       ├── utils.ts                    # Formatting: fireAsync, formatMs, formatDuration, etc.
│       └── tabcontext.ts               # Shared context: services + RenderContext + showMessage
├── themes/                             # JSON theme files (33 themes)
│   ├── opencode.json
│   ├── dracula.json
│   ├── nord.json
│   ├── gruvbox_dark.json
│   ├── catppuccin_latte.json
│   ├── catppuccin_frappe.json
│   ├── catppuccin_macchiato.json
│   ├── catppuccin_mocha.json
│   ├── flexoki_light.json
│   ├── flexoki_dark.json
│   └── ...                             # additional themes
├── package.json
├── tsconfig.json
├── SPEC.md
└── AGENTS.md
```

---

## Key Dependencies

| Package | Purpose |
|---|---|
| `terminal-kit` | Terminal input handling, mouse events, ANSI escapes |
| `better-sqlite3` | SQLite storage for tasks database |
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
- `tasksFile` - custom path for tasks database
- `logFile` - custom path for server log

**Dashboard**
- `pollIntervalMs` - metrics polling interval (default: 2000ms)
- `killServerOnExit` - whether to kill server on app quit (default: false)

**Tasks**
- `maxStored` - maximum tasks in history (default: 10000)
- `autoParse` - automatic log parsing (default: true)

**Appearance**
- `themeName` - active theme name (default: `opencode`)
- `compactTasks` - compact task list layout
- `showDraftRate` - display draft acceptance rate in tasks

**HuggingFace**
- `hfToken` - access token for gated models

---

## Feature 7: Theme System

Themes provide color palettes loaded from JSON files under `themes/`. The `theme.ts` module resolves theme names, maps theme color definitions to 20+ semantic roles (title, tabActive, tabInactive, statusBar, halfBar, error, warning, info, success, button, buttonActive, etc.), and exposes `fg()`, `bg()`, `fgBg()` helpers for ANSI color codes.

**Resolution order:**
1. `opencode` - built-in, uses opencode's own theme config if available
2. `themes/<name>.json` - bundled theme file
3. Fallback to default GitHub Dark palette

**Available themes (33):** flexoki (light/dark), dracula, nord, gruvbox (light/dark), catppuccin (latte, frappe, macchiato, mocha), and many more.

Each theme JSON defines base colors (`base`, `mantle`, `crust`, `red`, `orange`, `yellow`, `green`, `cyan`, `blue`, `purple`, `pink`, `surface0`-`surface2`, `overlay0`-`overlay2`, `text`) which the engine maps to semantic roles.

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
- Custom theme editor
- Model quantization/dequantization tools