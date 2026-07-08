# GGUF Model Inspection — Modal Specification

## Overview

Adds GGUF metadata inspection for local models in the Models tab. Spawns `llama-tokenize` against a selected model file, parses the output for architecture, quantization, attention, vision, tokenizer, and provenance metadata, and presents it in a scrollable modal dialog.

Replaces the sidebar panel approach from the `detailed-metrics` branch with a modal that opens on explicit user action (Enter on a model row).

---

## Motivation

The Models tab currently shows repo ID, filename, and size. Users cannot inspect model architecture, parameter count, quantization format, attention config, or vision capabilities without opening the file externally. GGUF files embed rich KV metadata that is useful for understanding what a model can do before loading it.

---

## Data Source

### Binary

Uses `llama-tokenize` from the active llama.cpp version (falls back to first available version). Invoked with:

```
llama-tokenize -m <model.gguf> -p x --no-bos --ids
```

The `-p x --no-bos --ids` flags cause the binary to dump KV metadata and exit without requiring meaningful input. Output is captured from both stdout and stderr. A 30-second timeout with SIGTERM→SIGKILL escalation prevents hangs.

### Parsing

Two-pass approach:

1. **First pass**: collect all KV pairs matching `-\s+kv\s+\d+:\s+([\S]+)\s+(u32|f32|str|bool|arr\[[^\]]+\])\s+=\s+(.+)`
2. **Second pass**: extract summary lines (`file type`, `file size`, `version GGUF V\d+`, tensor type counts)

KV values are resolved by architecture prefix (e.g., `llama.block_count`, `mpt.block_count`) using `general.architecture` as the prefix key.

---

## GGUFInfo Interface

```typescript
interface GGUFInfo {
  // Identity
  name: string;
  author: string;
  version: string;
  organization: string;
  license: string;
  url: string;
  description: string;
  date: string;

  // Architecture
  architecture: string;
  quantization: string;
  fileSize: string;
  ggufVersion: string;
  layers: number;
  layersAll: number;
  contextTrain: number;
  vocabSize: number;
  embeddingLength: number;
  feedForwardLength: number;

  // Attention
  attentionHeads: number;
  attentionHeadsKV: number;
  attentionKeyLength: number;
  attentionValueLength: number;
  attentionSlidingWindow: number;
  gqa: number;
  ropeScalingType: string;
  ropeScalingFactor: string;
  ropeFreqBase: string;

  // Vision (multimodal)
  visionBlockCount: number;
  visionEmbeddingLength: number;
  visionFeedForwardLength: number;
  visionImageSize: number;
  visionPatchSize: number;
  visionNumChannels: number;
  visionHeadCount: number;
  mmTokensPerImage: number;

  // MoE
  expertCount: number;
  expertUsed: number;

  // Tokenizer
  tokenizerModel: string;
  bosTokenId: number;
  eosTokenId: number;
  padTokenId: number;
  unknownTokenId: number;
  chatTemplate: string;

  // Tensors
  tensorTypes: string[];
}
```

All string fields default to `"-"`, all numbers to `0`, arrays to `[]`. Empty state is distinguishable from missing data via a dedicated error path when `llama-tokenize` is not found.

---

## API

### `src/lib/gguf.ts`

```typescript
function inspectGGUF(config: ConfigData, modelPath: string): Promise<GGUFInfo>
```

Returns resolved `GGUFInfo` or info with `architecture: "(no llama-tokenize)"` when the binary is unavailable.

---

## UI

### Trigger

**Enter** (or Return/Space) on a highlighted model row in the local models list opens the modal. Replaces the current `setOnSelect` handler behavior — the existing "set active model" action moves to an explicit **Set Active** button in the modal footer.

### Modal Layout

```
┌── Model Info: meta-llama/Llama-3.8b-Instruct.Q4_K_M.gguf ─────────────────┐
│                                                                            │
│  Name:        meta-llama/Llama-3.8b-Instruct                               │
│  Arch:        llama                                                        │
│  Quant:       Q4_K_M                                                       │
│  Size:        5.7G                                                         │
│  GGUF:        V3                                                           │
│                                                                            │
│  Layers:      36                                                           │
│  Ctx Train:   8k                                                           │
│  Vocab:       128_256                                                      │
│  Embedding:   4096                                                         │
│  FFN:         14_336                                                       │
│                                                                            │
│  Attn Heads:  32                                                           │
│  KV Heads:    8                                                            │
│  Key Len:     128                                                          │
│  Val Len:     128                                                          │
│  GQA:         8                                                            │
│  RoPE Scale:  none                                                         │
│  RoPE Base:   500000                                                       │
│                                                                            │
│  Tokenizer:   gpt2                                                         │
│  BOS:         128000                                                       │
│  EOS:         128001                                                       │
│                                                                            │
│  Author:      meta-llama                                                   │
│  License:     apache-2.0                                                   │
│                                                                            │
│  ─────────────────────────────────────────────────────────────────────────  │
│  [Set Active]                                    [Close (ESC)]              │
└──┘
```

### Section Grouping

Fields are grouped into collapsible sections to keep the modal manageable:

| Section | Fields | Default |
|---------|--------|---------|
| **Identity** | Name, Arch, Quant, Size, GGUF | Open |
| **Architecture** | Layers, Ctx Train, Vocab, Embedding, FFN, Experts, Experts Used | Open |
| **Attention** | Heads, KV Heads, Key/Val Len, SWA, GQA, RoPE (Scale/Factor/Base) | Open |
| **Vision** | Vision Layers, Embed, FFN, Res, Patch, Ch, Heads, Tokens/Img | Collapsed (only shown for multimodal models) |
| **Tokenizer** | Tokenizer, BOS, EOS, PAD, UNK, Chat Template | Collapsed |
| **Provenance** | Author, Org, Version, License, URL, Description, Date | Collapsed |
| **Tensors** | Counted sub-items (type → count) | Collapsed |

Collapsed sections show `▼ Label (N fields)` and expand to `▲ Label` with the fields listed. Vision section is hidden entirely when `visionBlockCount === 0`.

### Formatting

- Numbers ≥ 1M: `143.4M`, ≥ 1K: `4.1k`, else plain integer
- Zero values and `"-"` strings are omitted from rendering
- Section header shows count of visible (non-empty) fields

### Modal Dimensions

- Min: 60 × 12
- Max: 120 × 30
- Computed from content: `max(titleLen + 6, 60)` wide, `visibleRows + 6` tall

### Footer

Two buttons:
- **Set Active** — sets the inspected model as active (same as current `setOnSelect` behavior)
- **Close** — dismisses modal (also bound to ESC)

### Key Handling

| Key | Action |
|-----|--------|
| ESC | Close modal |
| Enter on Set Active | Set active model |
| Up/Down in collapsed sections | Expand/collapse toggle (or skip over) |
| Tab/Shift+Tab | Navigate between footer buttons |

### Loading State

While `llama-tokenize` is running, the modal shows:

```
┌── Inspecting model... ───────────────────────────────────────────────────┐
│                                                                          │
│    Running llama-tokenize, please wait...                                │
│                                                                          │
│                                                                          │
│                              [Cancel (ESC)]                              │
└──┘
```

ESC during loading cancels the child process and closes the modal.

---

## Implementation Plan

### Phase 1: Core (`src/lib/gguf.ts`)

1. Create `inspectGGUF(config, modelPath)` — spawns `llama-tokenize`, captures output, parses KV pairs and summary lines
2. Export `GGUFInfo` interface
3. Handle missing binary gracefully

### Phase 2: Modal Component (`src/framework/widgets/GGUFInfoModal.ts`)

1. Create `GGUFInfoModal extends Modal`
2. `setInfo(info: GGUFInfo | null)` and `setLoading(bool)` public API
3. Build grouped section rows from `GGUFInfo`
4. Collapsible section rendering with up/down arrow toggles
5. Footer with Set Active / Close buttons
6. Loading state with cancel support

### Phase 3: Factory (`src/framework/widgets/GGUFInfoModal.ts`)

```typescript
function createGGUFInfoModal(modelPath: string, config: ConfigData): GGUFInfoModal
```

Inspects the model asynchronously, transitions from loading → info state. Returns modal with `onSetActive` callback.

### Phase 4: ModelsTab Integration (`src/ui/tabs/ModelsTab.ts`)

1. Remove sidebar `GGUFInfoPanel` and `_detailsSection`
2. Replace `_modelList.setOnSelect` with `_modelList.handleKey` — Enter/Return/Space opens modal
3. Remove `_handleHighlight`, `_debounceTimer`, `_lastInspectedPath`, `_ggufPanel`
4. Remove `setOnHighlight` usage
5. Wire modal `onSetActive` callback to existing `selectModel` logic

---

## File Changes

| File | Changes |
|------|---------|
| `src/lib/gguf.ts` | **New** — `inspectGGUF()`, `GGUFInfo` interface |
| `src/framework/widgets/GGUFInfoModal.ts` | **New** — modal component + factory |
| `src/framework/widgets/index.ts` | Export `createGGUFInfoModal` |
| `src/ui/tabs/ModelsTab.ts` | Remove sidebar, add Enter→modal trigger, wire Set Active |

---

## Migration from Branch Approach

The `detailed-metrics` branch used a sidebar `GGUFInfoPanel` with debounced inspection on highlight. Changes:

| Aspect | Branch (sidebar) | Spec (modal) |
|--------|-----------------|--------------|
| Trigger | Highlight (debounced 1s) | Enter on selected row |
| Layout | Fixed 40-col right panel | Centered modal, 60-120 wide |
| Inspection | Per-highlight, cancelled on navigate | Once per open, cancelled on ESC |
| Set Active | Separate logic | Footer button in modal |
| Model list | Narrowed to accommodate sidebar | Full width |
| State | Persistent panel, always visible | Ephemeral, dismissed on close |

---

## Tradeoffs

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| No caching | Inspect on every open | GGUF files don't change; 30s timeout bounds cost; keeps implementation simple |
| No background parse | Modal blocks until done | `llama-tokenize` exits quickly for metadata-only; blocking avoids stale state |
| Collapsible sections | Default: Identity+Arch+Attn open, rest collapsed | Most useful fields visible immediately; advanced details available on demand |
| Vision section hidden when empty | `visionBlockCount === 0` → hide | Reduces noise for non-multimodal models |
| Set Active in modal | Footer button | Keeps action context with the inspected model; no ambiguity about which model is being set |
