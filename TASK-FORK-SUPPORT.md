# Task Spec: Fork Support for llama.cpp Variants

## Goal

Enable installing, managing, and running koboldcpp, ik_llama.cpp, and beellama.cpp alongside upstream llama.cpp through the existing Versions tab and server management flow.

## Scope

- **In scope**: Fork registry, install flow, version listing, server spawning, CLI preset handling, UI fork selector
- **Out of scope**: ik_llama.cpp prebuilt installs (no releases with assets — manual install only), log parser changes, metric parser changes

---

## 1. Fork Registry (`src/lib/forks.ts`)

### New file

```typescript
interface ForkDefinition {
  id: string;                    // "llama.cpp" | "koboldcpp" | "beellama"
  label: string;                 // "llama.cpp", "koboldcpp", "beellama.cpp"
  githubRepo: string;            // "ggml-org/llama.cpp", "LostRuins/koboldcpp", "Anbeeld/beellama.cpp"
  binaryNames: Record<string, string>;  // platform → binary name
  assetNamePattern: RegExp;      // pattern to match release assets
  extractDirPrefix: string | null; // "llama-" for upstream/beellama "beellama-", null for raw binary
  folderPrefix: string;          // "" | "koboldcpp-" | "beellama-"
  isRawBinary: boolean;          // true for koboldcpp (no archive extraction)
  backendVariants: BackendVariant[];
  hasListDevices: boolean;       // false for koboldcpp
  presetCategoryOverrides?: PresetCategory[]; // fork-specific CLI flags
}

interface BackendVariant {
  id: string;                    // "cuda", "cpu", "cuda-old"
  label: string;                 // "CUDA", "CPU (noCUDA)", "CUDA (old GPU)"
  assetMatcher: (assetName: string) => boolean;
}
```

### Registry entries

| Field | llama.cpp | koboldcpp | beellama |
|-------|-----------|-----------|----------|
| `id` | `"llama.cpp"` | `"koboldcpp"` | `"beellama"` |
| `label` | `"llama.cpp"` | `"koboldcpp"` | `"beellama.cpp"` |
| `githubRepo` | `"ggml-org/llama.cpp"` | `"LostRuins/koboldcpp"` | `"Anbeeld/beellama.cpp"` |
| `binaryNames` | `{ linux: "llama-server", macos: "llama-server", win: "llama-server.exe" }` | `{ linux: "koboldcpp-linux-x64", macos: "koboldcpp-mac-arm64", win: "koboldcpp.exe" }` | `{ linux: "llama-server", macos: "llama-server", win: "llama-server.exe" }` |
| `assetNamePattern` | `/^llama-.+-bin-/` | `/^koboldcpp-/` | `/^beellama-.+-bin-/` |
| `extractDirPrefix` | `"llama-"` | `null` | `"beellama-"` |
| `folderPrefix` | `""` | `"koboldcpp-"` | `"beellama-"` |
| `isRawBinary` | `false` | `true` | `false` |
| `hasListDevices` | `true` | `false` | `true` |

### Backend variants

**llama.cpp** — existing `extractBackendFromAsset` logic (unchanged):
- `cpu`, `metal`, `cuda12`, `cuda13`, `vulkan`, `rocm`, `openvino`, `opencl`, `hip`

**koboldcpp** — variant-based (not backend-based):
| Variant ID | Label | Asset Matcher |
|-----------|-------|---------------|
| `cuda` | "CUDA" | `koboldcpp-linux-x64` (no suffix) |
| `cpu` | "CPU" | `koboldcpp-linux-x64-nocuda` |
| `oldpc` | "CUDA (old GPU)" | `koboldcpp-linux-x64-oldpc` |
| `metal` | "Metal" | `koboldcpp-mac-arm64` |

**beellama** — similar to upstream, with `beellama-` prefix:
- `cpu`, `cuda12`, `cuda13`, `rocm`, `vulkan`, `sycl`, `hip`
- Asset pattern: `beellama-{tag}-bin-{os}-{backend}-{arch}.{ext}`

### Exported functions

```typescript
function getFork(id: string): ForkDefinition;
function getAllForks(): ForkDefinition[];
function detectForkFromFolder(folderName: string): ForkDefinition | null;
function resolveBinaryName(fork: ForkDefinition): string;
```

---

## 2. Changes to `src/lib/versions.ts`

### 2.1 Replace `GITHUB_REPO` constant

Remove `const GITHUB_REPO = "ggml-org/llama.cpp"`. All calls to GitHub API take a `forkId` parameter and resolve the repo from the registry.

### 2.2 `parseFolderName` → `parseFolderNameV2`

Handle prefixed folder names:

```typescript
function parseFolderName(name: string): { fork: string; tag: string; backend: string } {
  if (name.startsWith("koboldcpp-")) {
    const rest = name.slice("koboldcpp-".length);
    const match = rest.match(/^v[\d.]+(-.+)?$/);
    return {
      fork: "koboldcpp",
      tag: match ? rest.split("-")[0] : rest,
      backend: match && match[1] ? match[1].slice(1) : "cuda",
    };
  }
  if (name.startsWith("beellama-")) {
    const rest = name.slice("beellama-".length);
    const match = rest.match(/^v[\d.]+(-.+)?$/);
    return {
      fork: "beellama",
      tag: match ? rest.split("-")[0] : rest,
      backend: match && match[1] ? match[1].slice(1) : "cpu",
    };
  }
  // Existing upstream logic
  const match = name.match(/^(b\d+)(-.+)?$/);
  if (match) {
    return { fork: "llama.cpp", tag: match[1], backend: match[2] ? match[2].slice(1) : "cpu" };
  }
  return { fork: "llama.cpp", tag: name, backend: "cpu" };
}
```

### 2.3 `listVersions` — fork-aware binary resolution

```typescript
// Current:
const binary = path.join(versionPath, "llama-server");

// New:
const { fork } = parseFolderName(entry.name);
const forkDef = getFork(fork);
const binaryName = resolveBinaryName(forkDef);
const binary = path.join(versionPath, binaryName);
```

### 2.4 `switchVersion` — same binary resolution

Same change as `listVersions` — resolve binary name from fork instead of hardcoding `"llama-server"`.

### 2.5 `extractBackendFromAsset` — fork-specific

Split into three strategies:

```typescript
function extractBackendFromAsset(
  assetName: string,
  version: string,
  platform: string,
  fork: ForkDefinition,
): string | null;
```

- **llama.cpp / beellama**: existing prefix-based parsing, with `beellama-` prefix support
- **koboldcpp**: variant matching against `backendVariants[].assetMatcher`

### 2.6 `getAvailableBackends` — fork parameter

```typescript
export function getAvailableBackends(
  version: string,
  platform: string,
  assets: Array<{ name: string }>,
  fork: ForkDefinition,
): AvailableBackend[];
```

### 2.7 `installVersion` — fork-aware extraction

```typescript
export async function installVersion(
  config: ConfigData,
  forkId: string,          // NEW parameter
  version: string,
  backend: string,
  onProgress: InstallProgress,
): Promise<string>;
```

Changes:
1. Resolve `GITHUB_REPO` from fork registry
2. `getFolderName` → prepend `forkDef.folderPrefix`
3. **Raw binary path** (koboldcpp): after download, rename the binary to the platform-specific name in the version folder. Skip extraction entirely.
4. **Archive extraction**: update `extractDirPrefix` from fork def. For beellama, look for `beellama-*` subdirectory instead of `llama-*`.
5. **Binary chmod**: resolve binary name from fork def

### 2.8 `checkLatestVersion` — fork parameter

```typescript
export async function checkLatestVersion(forkId: string): Promise<string>;
```

### 2.9 `listRecentVersions` — fork parameter

```typescript
export async function listRecentVersions(forkId: string, limit = 20): Promise<RemoteVersion[]>;
```

---

## 3. Changes to `src/lib/server.ts`

### 3.1 `startServer` — fork-aware binary

```typescript
const { fork } = parseFolderName(activeVersion);
const forkDef = getFork(fork);
const binaryName = resolveBinaryName(forkDef);
const binary = path.join(versionsDir, activeVersion, binaryName);
```

### 3.2 `listDevices` — skip for koboldcpp

```typescript
const { fork } = parseFolderName(activeVersion);
const forkDef = getFork(fork);
if (!forkDef.hasListDevices) return `${forkDef.label} does not support --list-devices`;
```

### 3.3 `buildArgs` — fork-specific preset categories

```typescript
export function buildArgs(config: ConfigData, logFile: string): string[] {
  const { fork } = parseFolderName(config.activeVersion!);
  const forkDef = getFork(fork);
  const categories = forkDef.presetCategoryOverrides || PRESET_CATEGORIES;
  // ... rest uses `categories` instead of `PRESET_CATEGORIES`
}
```

---

## 4. Changes to `src/lib/config.ts`

### 4.1 No structural config changes needed

The `activeVersion` field already encodes the fork via the folder prefix (`koboldcpp-v1.116`, `beellama-v0.3.1-cuda12`). The fork is derived at runtime from the folder name — no new config field required.

### 4.2 Fork-specific preset categories

Add to `src/lib/forks.ts` (not config.ts):

**koboldcpp presets** — minimal subset of upstream flags + KoboldAI-specific:
- Server: `--host`, `--port`, `--threads`, `--ctx-size`, `--batch-size`
- Model: `--model`, `--lora`
- KoboldAI: `--api-user`, `--api-pass`, `--notebook-on`, `--server-log-file`, `--server-name`
- Note: koboldcpp does NOT support `--cont-batching`, `--cache-prompt`, `--jinja`, `--flash-attn`, most speculative/reasoning flags

**beellama presets** — upstream flags + DFlash/TurboQuant extensions:
- All upstream `PRESET_CATEGORIES` (beellama is a superset)
- Additional Compute fields: `--cache-type-k` options extended with `turbo2`, `turbo3`, `turbo4`, `turbo2_tcq`, `turbo3_tcq`
- Additional Speculative fields: `--spec-draft-ngl`, `--spec-dflash-cross-ctx`, `--spec-draft-temp`, `--spec-branch-budget`
- Additional Server fields: `--reasoning-loop-window`, `--reasoning-loop-max-period`

---

## 5. Changes to `src/components/tabs/VersionsTab.ts`

### 5.1 Fork selector

Add a fork selector control at the top of the releases view:

```
[llama.cpp ▼]  [Install]  [Back]
```

Options: `llama.cpp`, `koboldcpp`, `beellama.cpp`

The selector persists across mode changes. Default: `llama.cpp`.

### 5.2 `showReleases` — fork parameter

```typescript
async showReleases(): Promise<void> {
  const forkId = this._selectedFork || "llama.cpp";
  const releases = await listRecentVersions(forkId, 30);
  // ...
}
```

### 5.3 `showBackends` — fork parameter

```typescript
async showBackends(release: RemoteVersion): Promise<void> {
  const forkDef = getFork(this._selectedFork || "llama.cpp");
  this._availableBackends = getAvailableBackends(
    release.tag,
    getPlatformKey(),
    release.assets,
    forkDef,
  );
  // ...
}
```

### 5.4 `install` — fork parameter

```typescript
async install(backendId: string): Promise<void> {
  const forkId = this._selectedFork || "llama.cpp";
  // ...
  await installVersion(this.config, forkId, release.tag, backendId, onProgress);
}
```

### 5.5 Local versions list — fork labels

In the local versions list, display the fork label alongside each version:

```
b7405-cuda12        [llama.cpp]   CUDA 12      450 MB   ● active
koboldcpp-v1.116    [koboldcpp]   CUDA         610 MB
beellama-v0.3.1     [beellama]    CUDA 12.4    720 MB
```

### 5.6 State additions

```typescript
protected _selectedFork: string = "llama.cpp";
```

---

## 6. Changes to `src/components/tabs/ServerTab.ts` (Profiles)

### 6.1 Preset visibility

When the active version belongs to a fork, show/hide preset categories and fields based on fork compatibility:

- **koboldcpp**: hide Speculative (most flags), Reasoning, advanced Server flags (`--cont-batching`, `--cache-prompt`, etc.), `--flash-attn`, `--jinja`. Show KoboldAI-specific fields.
- **beellama**: show all upstream fields + extended `--cache-type-k`/`--cache-type-v` options + DFlash-specific speculative fields.

### 6.2 Implementation approach

Option 1: Filter `PRESET_CATEGORIES` at render time based on active fork.
Option 2: Fork registry includes a `visiblePresetKeys: string[]` whitelist.

Recommendation: Option 1 — filter existing categories and fields, add fork-specific fields conditionally.

---

## 7. ik_llama.cpp — Manual Install Only

Since ik_llama.cpp has no prebuilt releases:

1. **Not in fork registry** for the installer flow
2. **Manual install**: user clones repo, builds from source, places in `versions/ik_llama-t0002-cuda12/`
3. **Detection**: `parseFolderName` handles `ik_llama-` prefix, maps to upstream-compatible behavior (same binary name `llama-server`, same CLI surface)
4. **No UI entry** in fork selector — it appears in local versions list when detected

Add to `parseFolderName`:

```typescript
if (name.startsWith("ik_llama-")) {
  // Treat as upstream-compatible: same binary, same presets
  const rest = name.slice("ik_llama-".length);
  return { fork: "ik_llama", tag: rest.split("-")[0], backend: rest.split("-")[1] || "cpu" };
}
```

Add minimal registry entry for runtime resolution (binary name, hasListDevices, presets = same as upstream).

---

## 8. Testing Plan

### Manual testing checklist

- [ ] Install koboldcpp v1.116 CUDA variant — binary lands correctly, no extraction
- [ ] Install koboldcpp v1.116 CPU variant — `koboldcpp-linux-x64-nocuda` binary
- [ ] Install beellama v0.3.1 CUDA 12.4 — archive extracts, `beellama-*` subdir flattened
- [ ] Switch between forks — correct binary resolved, server starts
- [ ] Start koboldcpp server — no `--list-devices` call, correct args passed
- [ ] Start beellama server — `--list-devices` works, DFlash flags available in presets
- [ ] Uninstall fork version — folder removed correctly
- [ ] Local versions list shows fork labels for all installed versions
- [ ] Fork selector persists across mode changes
- [ ] Manual ik_llama install detected in local versions list

### Edge cases

- [ ] koboldcpp binary already exists — `pathExists` check prevents overwrite
- [ ] beellama archive has no `beellama-*` subdir — falls through to no-flatten
- [ ] Active version is koboldcpp, user clicks Devices button — shows "not supported" message
- [ ] Switching from upstream to koboldcpp with incompatible presets — free-form args still applied, preset args filtered

---

## 9. File Change Summary

| File | Change Type | Effort |
|------|------------|--------|
| `src/lib/forks.ts` | **New file** | Medium |
| `src/lib/versions.ts` | Modify: 9 functions, 1 constant removed | High |
| `src/lib/server.ts` | Modify: 3 functions | Low |
| `src/lib/config.ts` | No changes | None |
| `src/components/tabs/VersionsTab.ts` | Modify: add fork selector, 4 methods | Medium |
| `src/components/tabs/ServerTab.ts` | Modify: preset visibility filtering | Medium |
| `src/components/tabs/DashboardTab.ts` | Modify: Devices button behavior for koboldcpp | Low |

---

## 10. Migration & Backwards Compatibility

- Existing installed versions (e.g., `b7405-cuda12`) continue to work — `parseFolderName` returns `fork: "llama.cpp"` for unprefixed folders
- No config migration needed — `activeVersion` folder names are unchanged for existing installs
- Existing preset profiles are compatible — fork-specific fields are additive, not replacing upstream fields

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| koboldcpp binary naming changes | Registry is data-driven — update one entry |
| beellama archive structure changes | `extractDirPrefix` is configurable per fork |
| Preset flag incompatibility causes server crash | Free-form args always applied; preset args filtered per fork |
| koboldcpp API differs from llama-server | Out of scope — this task is about install/run, not API compatibility |
| ik_llama build instructions change | Documented as manual install, no automated flow |
