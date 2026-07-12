# llama-manager

![latest release](https://img.shields.io/github/v/release/bayger/llama-manager?style=flat-square&label=latest&color=549e6a)
![license](https://img.shields.io/badge/license-Apache%202.0-549e6a?style=flat-square)

A terminal UI for managing [llama.cpp](https://github.com/ggml-org/llama.cpp) — start and control the server, manage versions, download GGUF models from Hugging Face, and monitor inference performance in real time.

![llama-manager demo](./demo.gif)

## Install

```bash
npm install -g llama-manager
llama-manager
```

Requires Node.js 18+ and a llama.cpp binary (managed via the Versions tab or installed manually).

## Features

- **Dashboard** — real-time per-slot metrics, server controls (start/stop/restart), loaded model info, and recent-task charts
- **Logs** — dedicated server log viewer with structured severity coloring
- **Tasks** — parsed task history with token counts, speeds, draft acceptance, sorting, SQLite persistence, and aggregated charts (tasks/tokens over time)
- **Profiles** — named server configurations with type-aware preset editors and free-form arguments
- **Versions** — install, switch, and uninstall llama.cpp builds; browse releases, select backend and fork, view changelogs
- **Models** — search Hugging Face, download GGUF models with progress tracking, set active, delete
- **Options** — global settings: paths, poll interval, task limits, appearance, theme, HF token, fork selection, update checks

## Navigation

| Key | Action |
|---|---|
| `1`-`7` | Switch tabs |
| `Alt+Left` / `Alt+Right` | Cycle tabs |
| `Tab` / `Shift+Tab` | Move focus |
| `Enter` | Confirm / select |
| `Esc` | Cancel |
| `?` | Show help |
| `Ctrl+T` | Open theme selector |
| `Ctrl+D` | Toggle dark/light mode |
| `Ctrl+U` | Check for updates |
| `q` | Quit |
| Mouse click | Select tabs, list items, buttons |
| Mouse scroll | Scroll in log viewer, tables, lists |

## Tabs

| Tab | Key | Description |
|---|---|---|
| Dashboard | 1 | Per-slot metrics, server controls, model info, recent-task charts |
| Logs | 2 | Dedicated server log viewer |
| Tasks | 3 | Parsed task history, aggregated charts view |
| Profiles | 4 | Profile management, preset editing |
| Versions | 5 | Local versions, GitHub releases, backend & fork selection, changelog |
| Models | 6 | Local GGUFs, HF browse, download, delete |
| Options | 7 | Global app settings |

## Storage

Follows XDG Base Directory spec. All paths configurable in Options.

| What | Default Path |
|---|---|
| Config | `~/.config/llama-manager/config.json` |
| Versions | `~/.local/share/llama-manager/versions/` |
| Models | `~/.cache/huggingface/llama-manager/` |
| Tasks DB | `~/.local/share/llama-manager/tasks.db` |
| Server log | `~/.local/state/llama-manager/logs/server.<timestamp>.log` |

## Themes

31 bundled themes including Catppuccin, Dracula, Gruvbox, Nord, Tokyo Night, and more. Each theme supports dark and light variants. Selectable from the Options tab.

## Tech Stack

TypeScript, terminal-kit (input only), undici, better-sqlite3, custom Control-based UI framework with double-buffered framebuffer rendering (no React, no Ink).

## License

Apache License 2.0
