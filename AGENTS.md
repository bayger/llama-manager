# llama-dashboard — Agent Instructions

## Quick Start

```
npm install
npm run dev       # Run with tsx (hot-reload dev loop)
npm run build     # tsc → dist/
npm run start     # node dist/main.js
npm run lint      # tsc --noEmit (only type check, no ESLint)
```

## Important Quirks

- **ESM with `.js` imports** — `package.json` has `"type": "module"`. All internal imports must use `.js` extension (e.g., `import { App } from "./components/App.js"`), even though the source files are `.ts`. This is required by the `moduleResolution: "bundler"` tsconfig setting.
- **Entry point is `src/main.ts`**. Has shebang `#!/usr/bin/env node`.
- **No tests exist.** No test framework is configured.
- **No ESLint, no Prettier.** `npm run lint` only runs `tsc --noEmit`. That is the sole verification gate.
- **`dist/` is gitignored.** Must run `npm run build` before `npm run start`.
- **`npm run dev`** uses `tsx` which handles TS directly — no build step needed for development.

## Architecture

- terminal-kit TUI with a custom Control-based UI framework. Root app `App.ts` manages 7 tabs: Server, Tasks, Versions, Models, Dashboard, LiveLogs, Options.
- Tab controls live in `src/components/tabs/`. UI framework in `src/components/ui/`.
- Control tree: `Control` base class with lifecycle hooks, child management, and dirty-flag rendering. `Column`/`Row` layouts with flex-based space distribution. `FocusManager` singleton for Tab/Shift+Tab navigation.
- Widget library in `src/components/ui/widgets/`: Label, Button, ButtonBar, TextInput, List, Scrollable, Box, Divider, Spacer, ProgressBar, HelpBar.
- Business logic in `src/lib/`: `config.ts`, `server.ts`, `logparser.ts`, `tasks.ts`, `versions.ts`, `models.ts`, `api.ts`, `hf.ts`, `theme.ts`, `tabcontext.ts`.
- `theme.ts` provides a GitHub Dark color palette — colors are hex strings, not chalk methods.
- `tabcontext.ts` provides shared context with app services and `RenderContext` for terminal access.
- HTTP client is `undici` (not node-fetch).
- Config stored at `$XDG_CONFIG_HOME/llama-dashboard/config.json`. See SPEC.md for full schema.

## Dependencies

Uses terminal-kit 3, undici 7, TypeScript 5, fs-extra 11. No React, no Ink. APIs may differ from tutorials referencing older stacks — check current documentation on the web before following stale examples.

## Conventions

- No JSX. All rendering is imperative via terminal-kit `Terminal` object.
- Controls own presentation state (selectedIndex, scrollOffset, editValue); business data passed via config/props.
- Dirty flags (`needsRender`) enable incremental rendering without full-tree redraw.
- Two-pass layout: `measure()` reports desired size, `onLayout()` assigns child rects.
- `FocusManager` singleton tracks single focus point; Tab/Shift+Tab navigation through focusable controls.
- Cursor visibility via ANSI escapes (`\x1b[?25h`/`\x1b[?25l`) — `terminal-kit`'s `Terminal` type lacks `showCursor`/`hideCursor`.
- Strict TypeScript. No loose `any` patterns — follow existing typing.
- Follow the directory structure from SPEC.md. New features go under `src/components/tabs/` or `src/lib/`.
