import { Control } from "../ui/Control";
import { fg } from "../../lib/theme";
import type { RenderContext, Size } from "../ui/types";
import type { GGUFInfo } from "../../lib/gguf";

interface KVRow {
  label: string;
  value: string;
  color?: "text" | "info" | "accent" | "success";
  subItems?: { label: string; value: string; color?: "text" | "info" | "accent" | "success" }[];
}

export class GGUFInfoPanel extends Control {
  focusable = false;
  protected _info: GGUFInfo | null = null;
  protected _loading = false;

  constructor() {
    super();
  }

  public setInfo(info: GGUFInfo | null): void {
    this._info = info;
    this._loading = false;
    this.markDirty();
  }

  public setLoading(loading: boolean): void {
    this._loading = loading;
    this.markDirty();
  }

  measure(parentSize?: Size): Size {
    if (!this._info && !this._loading) {
      return { width: parentSize?.width ?? this.rect.width, height: 1 };
    }
    const rows = this._loading ? 1 : this.buildRows().reduce((sum, r) => sum + 1 + (r.subItems?.length || 0), 0);
    return {
      width: parentSize?.width ?? this.rect.width,
      height: Math.min(rows + 1, parentSize?.height ?? 999),
    };
  }

  protected buildRows(): KVRow[] {
    if (!this._info) return [];
    const i = this._info;
    const rows: KVRow[] = [];

    if (i.name !== "-") rows.push({ label: "Name", value: i.name, color: "accent" });
    if (i.architecture !== "-") rows.push({ label: "Arch", value: i.architecture, color: "info" });
    if (i.quantization !== "-") rows.push({ label: "Quant", value: i.quantization, color: "success" });
    if (i.fileSize !== "-") rows.push({ label: "Size", value: i.fileSize });
    if (i.ggufVersion !== "-") rows.push({ label: "GGUF", value: i.ggufVersion });
    if (i.layers > 0) rows.push({ label: "Layers", value: String(i.layers) });
    if (i.contextTrain > 0) rows.push({ label: "Ctx Train", value: fmt(i.contextTrain) });
    if (i.vocabSize > 0) rows.push({ label: "Vocab", value: fmt(i.vocabSize) });
    if (i.embeddingLength > 0) rows.push({ label: "Embedding", value: fmt(i.embeddingLength) });
    if (i.feedForwardLength > 0) rows.push({ label: "FFN", value: fmt(i.feedForwardLength) });
    if (i.attentionHeads > 0) rows.push({ label: "Attn Heads", value: String(i.attentionHeads) });
    if (i.attentionHeadsKV > 0) rows.push({ label: "KV Heads", value: String(i.attentionHeadsKV) });
    if (i.attentionKeyLength > 0) rows.push({ label: "Key Len", value: String(i.attentionKeyLength) });
    if (i.attentionValueLength > 0) rows.push({ label: "Val Len", value: String(i.attentionValueLength) });
    if (i.attentionSlidingWindow > 0) rows.push({ label: "SWA", value: fmt(i.attentionSlidingWindow) });
    if (i.gqa > 0) rows.push({ label: "GQA", value: String(i.gqa) });
    if (i.ropeScalingType !== "-") rows.push({ label: "RoPE Scale", value: i.ropeScalingType });
    if (i.ropeScalingFactor !== "-") rows.push({ label: "RoPE Factor", value: i.ropeScalingFactor });
    if (i.ropeFreqBase !== "-") rows.push({ label: "RoPE Base", value: i.ropeFreqBase });
    if (i.expertCount > 0) rows.push({ label: "Experts", value: String(i.expertCount) });
    if (i.expertUsed > 0) rows.push({ label: "Experts Used", value: String(i.expertUsed) });
    if (i.visionBlockCount > 0) rows.push({ label: "Vision Layers", value: String(i.visionBlockCount) });
    if (i.visionEmbeddingLength > 0) rows.push({ label: "Vision Embed", value: fmt(i.visionEmbeddingLength) });
    if (i.visionFeedForwardLength > 0) rows.push({ label: "Vision FFN", value: fmt(i.visionFeedForwardLength) });
    if (i.visionImageSize > 0) rows.push({ label: "Vision Res", value: `${i.visionImageSize}x${i.visionImageSize}` });
    if (i.visionPatchSize > 0) rows.push({ label: "Vision Patch", value: String(i.visionPatchSize) });
    if (i.visionNumChannels > 0) rows.push({ label: "Vision Ch", value: String(i.visionNumChannels) });
    if (i.visionHeadCount > 0) rows.push({ label: "Vision Heads", value: String(i.visionHeadCount) });
    if (i.mmTokensPerImage > 0) rows.push({ label: "Tokens/Img", value: String(i.mmTokensPerImage) });
    if (i.tensorTypes.length > 0) {
      rows.push({
        label: "Tensors",
        value: String(i.tensorTypes.length),
        color: "info",
        subItems: i.tensorTypes.map((t) => {
          const parts = t.split(" ");
          return { label: parts[1] || "", value: parts[0] || "", color: "text" as const };
        }),
      });
    }
    if (i.tokenizerModel !== "-") rows.push({ label: "Tokenizer", value: i.tokenizerModel });
    if (i.bosTokenId > 0) rows.push({ label: "BOS", value: String(i.bosTokenId) });
    if (i.eosTokenId > 0) rows.push({ label: "EOS", value: String(i.eosTokenId) });
    if (i.padTokenId > 0) rows.push({ label: "PAD", value: String(i.padTokenId) });
    if (i.unknownTokenId > 0) rows.push({ label: "UNK", value: String(i.unknownTokenId) });
    if (i.author !== "-") rows.push({ label: "Author", value: i.author });
    if (i.organization !== "-") rows.push({ label: "Org", value: i.organization });
    if (i.license !== "-") rows.push({ label: "License", value: i.license });
    if (i.version !== "-") rows.push({ label: "Version", value: i.version });
    if (i.url !== "-") rows.push({ label: "URL", value: i.url });
    if (i.description !== "-") rows.push({ label: "Desc", value: i.description });
    if (i.date !== "-") rows.push({ label: "Date", value: i.date });

    return rows;
  }

  draw(ctx: RenderContext): void {
    const { canvas } = ctx;
    const { x, y, width, height } = this.rect;

    if (this._loading) {
      canvas.moveTo(x, y);
      fg(canvas, "textMuted", "Inspecting model...");
      return;
    }

    if (!this._info) {
      canvas.moveTo(x, y);
      fg(canvas, "textMuted", "Select a model to see details");
      return;
    }

    const rows = this.buildRows();
    if (rows.length === 0) {
      canvas.moveTo(x, y);
      fg(canvas, "textMuted", "(no metadata available)");
      return;
    }

    const maxLabelLen = 14;
    let cy = y;
    let drawnRows = 0;

    for (let ri = 0; ri < rows.length && cy < y + height; ri++) {
      const row = rows[ri]!;
      canvas.moveTo(x, cy);
      const label = (" " + row.label + ":").padEnd(maxLabelLen + 1);
      fg(canvas, "textMuted", label);
      fg(canvas, row.color || "text", row.value);
      cy++;
      drawnRows++;

      if (row.subItems && row.subItems.length > 0) {
        for (const sub of row.subItems) {
          if (cy >= y + height) break;
          canvas.moveTo(x, cy);
          const subLabel = "   " + sub.label.padEnd(maxLabelLen - 3);
          fg(canvas, "textMuted", subLabel);
          fg(canvas, sub.color || "text", sub.value);
          cy++;
          drawnRows++;
        }
      }
    }

    if (drawnRows < rows.length + rows.reduce((sum, r) => sum + (r.subItems?.length || 0), 0)) {
      const total = rows.length + rows.reduce((sum, r) => sum + (r.subItems?.length || 0), 0);
      const remaining = total - drawnRows;
      canvas.moveTo(x, cy - 1);
      fg(canvas, "textMuted", `  ... +${remaining} more fields`);
    }
  }

  onDestroy(): void {
    this._info = null;
  }
}

function fmt(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
