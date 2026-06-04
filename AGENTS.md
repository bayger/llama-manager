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

- **ESM with `.js` imports** — `package.json` has `"type": "module"`. All internal imports must use `.js` extension (e.g., `import App from "./components/App.js"`), even though the source files are `.tsx`. This is required by the `moduleResolution: "bundler"` tsconfig setting.
- **Entry point is `src/main.tsx`**, not `main.ts`. Has shebang `#!/usr/bin/env node`.
- **No tests exist.** No test framework is configured.
- **No ESLint, no Prettier.** `npm run lint` only runs `tsc --noEmit`. That is the sole verification gate.
- **`dist/` is gitignored.** Must run `npm run build` before `npm run start`.
- **`npm run dev`** uses `tsx` which handles TS/TSX directly — no build step needed for development.

## Architecture

- Ink TUI with React 19. Root component `App.tsx` manages 5 tabs: Server, Tasks, Versions, Models, Dashboard.
- Tab components live in `src/components/tabs/`. Shared inputs in `src/components/inputs/`.
- Business logic in `src/lib/`: `config.ts`, `server.ts`, `logparser.ts`, `tasks.ts`, `versions.ts`, `models.ts`, `api.ts`, `hf.ts`, `theme.ts`.
- `theme.ts` provides a GitHub Dark color palette — colors are hex strings, not chalk methods.
- Uses `fullscreen-ink` for terminal fullscreen mode and `@ink-tools/ink-mouse` for mouse support.
- HTTP client is `undici` (not node-fetch).
- Config stored at `$XDG_CONFIG_HOME/llama-dashboard/config.json`. See SPEC.md for full schema.

## Dependencies

Uses recent major versions of all libraries (Ink 7, React 19, TypeScript 5, undici 7, etc.). APIs may differ from older tutorials — check current documentation on the web before following stale examples.

## Conventions

- `jsx: "react-jsx"` — no `React` import needed for JSX, but `React` is imported where hooks are used.
- Strict TypeScript. No loose `any` patterns — follow existing typing.
- Follow the directory structure from SPEC.md. New features go under `src/components/tabs/` or `src/lib/`.
