# llama-manager - Agent Instructions

## Quick Start

```
npm install
npm run dev       # Run with tsx (hot-reload dev loop)
npm run build     # tsc → dist/
npm run start     # node dist/main.js
npm run lint      # tsc --noEmit (only type check, no ESLint)
```

## Important Quirks

- **ESM project** - `package.json` has `"type": "module"`.
- **Entry point is `src/main.ts`**. Has shebang `#!/usr/bin/env node`.
- **No tests exist.** No test framework is configured.
- **No ESLint, no Prettier.** `npm run lint` only runs `tsc --noEmit`. That is the sole verification gate.
- **`dist/` is gitignored.** Must run `npm run build` before `npm run start`.
- **`npm run dev`** uses `tsx` which handles TS directly - no build step needed for development.

## Architecture

- Terminal UI with a custom Control-based UI framework. Root control `MainControl.ts` manages 6 tabs: Dashboard, Tasks, Profiles, Versions, Models, Options. Rendering uses a double-buffered framebuffer with diff-based terminal output (terminal-kit is used only for input handling).
- Tab navigation via `F1`-`F6` keys. Status bar shows active tab name and shortcut hints.
- Tab controls live in `src/components/tabs/`. UI framework in `src/components/ui/`. Specialized components in `src/components/specialized/`.
- Control tree: `Control` base class with lifecycle hooks, child management, and dirty-flag rendering. `Column`/`Row` layouts with flex-based space distribution. `FocusManager` singleton for Tab/Shift+Tab navigation.
- Widget library in `src/components/ui/widgets/`: Label, Button, ButtonBar, TextInput, List, Table, Scrollable, Box, StyledText, Section, HalfBar, Spacer, ProgressBar, HelpBar.
- Specialized components in `src/components/specialized/`: SettingsPanel (profile preset editor), ProfileList (CRUD), LogsViewer (structured log coloring), MetricsPanel (per-slot metrics), OptionsPanel (global settings).
- Business logic in `src/lib/`: `config.ts`, `server.ts`, `logparser.ts`, `logcolors.ts`, `metricstracker.ts`, `tasks.ts`, `versions.ts`, `models.ts`, `api.ts`, `hf.ts`, `theme.ts`, `framebuffer.ts`, `framebuffer-canvas.ts`, `framebuffer-diff.ts`, `utils.ts`, `tabcontext.ts`.
- `theme.ts` provides theme resolution from JSON files (33 themes) with semantic color roles - colors are hex strings, not chalk methods.
- `logcolors.ts` provides severity-based log line colorization (error/warning/info).
- `utils.ts` provides formatting helpers: `fireAsync`, `formatMs`, `formatDuration`, `formatUptime`, `formatNum`, `formatDate`, `formatTime`.
- `tabcontext.ts` provides shared context with app services, `RenderContext` for framebuffer access, and `ctx.showMessage` for transient notifications.
- `config.ts` manages profile-based configuration with legacy migration. Each profile has its own presets and free-form args.
- HTTP client is `undici` (not node-fetch).
- Config stored at `$XDG_CONFIG_HOME/llama-manager/config.json`. See SPEC.md for full schema.

## Tabs

| Tab | Key | File | Description |
|---|---|---|---|
| Dashboard | F1 | `DashboardTab.ts` | Per-slot metrics (state, speed, checkpoints), server status, Start/Stop/Restart buttons, live log viewer |
| Tasks | F2 | `TasksTab.ts` | Parsed task history with columns: Date, Time, Slot, Task, Prompt tokens, Output tokens, Speed, Time, Draft rate |
| Profiles | F3 | `ServerTab.ts` | Profile list (create/rename/delete), SettingsPanel for editing presets per profile, Devices button |
| Versions | F4 | `VersionsTab.ts` | Local llama.cpp versions, GitHub install/uninstall, active version indicator, backend selection |
| Models | F5 | `ModelsTab.ts` | Local GGUF models, HF browse/search, download with progress, set active, delete |
| Options | F6 | `OptionsTab.ts` | Global app settings: paths, dashboard poll interval, task limits, appearance, theme, HF token |

## Dependencies

Uses terminal-kit 3 (input only), better-sqlite3, undici 7, TypeScript 5, fs-extra 11, chalk 4. No React, no Ink. APIs may differ from tutorials referencing older stacks - check current documentation on the web before following stale examples.

## Conventions

- No JSX. All rendering is imperative via `FramebufferCanvas` (double-buffered framebuffer, diff-based terminal output).
- Controls own presentation state (selectedIndex, scrollOffset, editValue); business data passed via config/props.
- Dirty flags (`needsRender`) enable incremental rendering without full-tree redraw.
- Two-pass layout: `measure()` reports desired size, `onLayout()` assigns child rects.
- `FocusManager` singleton tracks single focus point; Tab/Shift+Tab navigation through focusable controls.
- Cursor visibility via ANSI escapes (`\x1b[?25h`/`\x1b[?25l`) - `terminal-kit`'s `Terminal` type lacks `showCursor`/`hideCursor`.
- Strict TypeScript. No loose `any` patterns - follow existing typing.
- Follow the directory structure from SPEC.md. New features go under `src/components/tabs/` or `src/lib/`.
- Tabs use factory functions (`createXxxTab(ctx)`) that return either a `Control` or a legacy `TabModule`. App wraps Controls automatically.
- `fireAsync` from `utils.ts` should be used for async button handlers - it catches errors and shows them via `ctx.showMessage`.
