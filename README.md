# llama-manager

Terminal UI for managing llama.cpp — start and control the server, manage versions, download GGUF models from HuggingFace, and monitor inference performance.

## Features

- **Dashboard** — real-time metrics (prompt/predict tokens/s), server controls, live log viewer
- **Profiles** — named server configurations with type-aware preset editors and free-form arguments
- **Tasks** — parsed task history with token counts, speeds, draft acceptance, and filtering
- **Versions** — install, switch, and uninstall llama.cpp builds from GitHub releases
- **Models** — search HuggingFace, download GGUF models with progress tracking, set active model
- **Options** — global settings: paths, poll interval, task limits, appearance, HF token

## Requirements

- Node.js 18+
- llama.cpp binaries (managed via the Versions tab or installed manually)

## Usage

```bash
npm install
npm run dev    # development (tsx, hot-reload)
npm run build  # production build
npm start      # run production build
```

Or as a CLI binary:

```bash
npm install -g .
llama-manager
```

## Navigation

| Key | Action |
|---|---|
| `F1`-`F6` | Switch tabs |
| `Tab` / `Shift+Tab` | Move focus |
| `Enter` | Confirm / select |
| `Esc` | Cancel |
| `q` | Quit |

## Storage

Follows XDG Base Directory spec. Config at `~/.config/llama-manager/config.json`, versions in `~/.local/share/llama-manager/versions/`, models in `~/.cache/huggingface/llama-manager/`. All paths configurable.

## Tech Stack

TypeScript, terminal-kit, undici, custom Control-based UI framework (no React, no Ink).

This project was written with the help of Qwen 3.6 27B.
