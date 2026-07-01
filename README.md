# llama-manager

A terminal UI for managing [llama.cpp](https://github.com/ggml-org/llama.cpp) — start and control the server, manage versions, download GGUF models from Hugging Face, and monitor inference performance in real time.

![llama-manager demo](./demo.gif)

## Install

```bash
npm install -g llama-manager
llama-manager
```

Requires Node.js 18+ and a llama.cpp binary (managed via the Versions tab or installed manually).

## Features

- **Dashboard** — real-time per-slot metrics, server controls (start/stop/restart), live log viewer
- **Logs** — dedicated server log viewer with structured severity coloring
- **Tasks** — parsed task history with token counts, speeds, draft acceptance, filtering, and SQLite persistence
- **Profiles** — named server configurations with type-aware preset editors and free-form arguments
- **Versions** — install, switch, and uninstall llama.cpp builds from GitHub releases
- **Models** — search Hugging Face, download GGUF models with progress tracking, set active model
- **Options** — global settings: paths, poll interval, task limits, appearance, theme, HF token

## Navigation

| Key | Action |
|---|---|
| `F1`-`F7` | Switch tabs |
| `Tab` / `Shift+Tab` | Move focus |
| `Enter` | Confirm / select |
| `Esc` | Cancel |
| `?` | Show help |
| `q` | Quit |
| Mouse click | Select tabs, list items, buttons |
| Mouse scroll | Scroll in log viewer, tables, lists |

## Tabs

| Tab | Key | Description |
|---|---|---|
| Dashboard | F1 | Per-slot metrics, server controls, live log viewer |
| Logs | F2 | Dedicated server log viewer |
| Tasks | F3 | Parsed task history with columns |
| Profiles | F4 | Profile management, preset editing |
| Versions | F5 | Local versions, GitHub install/uninstall |
| Models | F6 | Local GGUFs, HF browse, download |
| Options | F7 | Global app settings |

## Storage

Follows XDG Base Directory spec. All paths configurable in Options.

| What | Default Path |
|---|---|
| Config | `~/.config/llama-manager/config.json` |
| Versions | `~/.local/share/llama-manager/versions/` |
| Models | `~/.cache/huggingface/llama-manager/` |
| Tasks DB | `~/.local/share/llama-manager/tasks.db` |
| Server log | `~/.local/state/llama-manager/server.log` |

## Themes

33 bundled themes including Catppuccin, Dracula, Gruvbox, Nord, Tokyo Night, and more. Selectable from the Options tab. Compatible with opencode theme format.

## Tech Stack

TypeScript, terminal-kit (input only), undici, better-sqlite3, custom Control-based UI framework with double-buffered framebuffer rendering (no React, no Ink).

## License

Apache License 2.0
