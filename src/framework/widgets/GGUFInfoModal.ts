import { Modal } from "./Modal";
import { Column, Row, createSplitButtonRow } from "../Layout";
import { Button } from "./Button";
import { Spacer } from "./Spacer";
import { Scrollable } from "./Scrollable";
import { StyledText } from "./StyledText";
import { fg } from "../../lib/theme";
import { focusManager } from "../FocusManager";
import { modalManager } from "../ModalManager";
import { inspectGGUF } from "../../lib/gguf";
import { spawn } from "child_process";
import os from "os";
import type { GGUFInfo } from "../../lib/gguf";
import type { ConfigData } from "../../lib/config";
import type { Point, RenderContext } from "../types";

interface KVRow {
  label: string;
  value: string;
  color?: "text" | "info" | "accent" | "success";
}

interface SectionDef {
  title: string;
  getRows: (info: GGUFInfo) => KVRow[];
  skipIfZero?: keyof GGUFInfo;
}

function fmt(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function nonEmpty(value: string | number): boolean {
  if (typeof value === "number") return value > 0;
  return value !== "-" && value !== "";
}

const SECTIONS: SectionDef[] = [
  {
    title: "Identity",
    getRows: (i: GGUFInfo) => {
      const rows: KVRow[] = [];
      if (nonEmpty(i.name)) rows.push({ label: "Name", value: i.name, color: "accent" });
      if (nonEmpty(i.architecture)) rows.push({ label: "Arch", value: i.architecture, color: "info" });
      if (nonEmpty(i.params)) rows.push({ label: "Params", value: i.params, color: "info" });
      if (nonEmpty(i.quantization)) rows.push({ label: "Quant", value: i.quantization, color: "success" });
      if (nonEmpty(i.fileSize)) rows.push({ label: "Size", value: i.fileSize });
      if (nonEmpty(i.ggufVersion)) rows.push({ label: "GGUF", value: i.ggufVersion });
      return rows;
    },
  },
  {
    title: "Architecture",
    getRows: (i: GGUFInfo) => {
      const rows: KVRow[] = [];
      if (nonEmpty(i.layers)) rows.push({ label: "Layers", value: String(i.layers) });
      if (nonEmpty(i.contextTrain)) rows.push({ label: "Ctx Train", value: fmt(i.contextTrain) });
      if (nonEmpty(i.vocabSize)) rows.push({ label: "Vocab", value: fmt(i.vocabSize) });
      if (nonEmpty(i.embeddingLength)) rows.push({ label: "Embedding", value: fmt(i.embeddingLength) });
      if (nonEmpty(i.feedForwardLength)) rows.push({ label: "FFN", value: fmt(i.feedForwardLength) });
      if (nonEmpty(i.expertCount)) rows.push({ label: "Experts", value: String(i.expertCount) });
      if (nonEmpty(i.expertUsed)) rows.push({ label: "Experts Used", value: String(i.expertUsed) });
      return rows;
    },
  },
  {
    title: "Attention",
    getRows: (i: GGUFInfo) => {
      const rows: KVRow[] = [];
      if (nonEmpty(i.attentionHeads)) rows.push({ label: "Attn Heads", value: String(i.attentionHeads) });
      if (nonEmpty(i.attentionHeadsKV)) rows.push({ label: "KV Heads", value: String(i.attentionHeadsKV) });
      if (nonEmpty(i.attentionKeyLength)) rows.push({ label: "Key Len", value: String(i.attentionKeyLength) });
      if (nonEmpty(i.attentionValueLength)) rows.push({ label: "Val Len", value: String(i.attentionValueLength) });
      if (nonEmpty(i.attentionSlidingWindow)) rows.push({ label: "SWA", value: fmt(i.attentionSlidingWindow) });
      if (nonEmpty(i.gqa)) rows.push({ label: "GQA", value: String(i.gqa) });
      if (nonEmpty(i.ropeScalingType)) rows.push({ label: "RoPE Scale", value: i.ropeScalingType });
      if (nonEmpty(i.ropeScalingFactor)) rows.push({ label: "RoPE Factor", value: i.ropeScalingFactor });
      if (nonEmpty(i.ropeFreqBase)) rows.push({ label: "RoPE Base", value: i.ropeFreqBase });
      return rows;
    },
  },
  {
    title: "Vision",
    skipIfZero: "visionBlockCount",
    getRows: (i: GGUFInfo) => {
      const rows: KVRow[] = [];
      if (nonEmpty(i.visionBlockCount)) rows.push({ label: "Vision Layers", value: String(i.visionBlockCount) });
      if (nonEmpty(i.visionEmbeddingLength)) rows.push({ label: "Vision Embed", value: fmt(i.visionEmbeddingLength) });
      if (nonEmpty(i.visionFeedForwardLength)) rows.push({ label: "Vision FFN", value: fmt(i.visionFeedForwardLength) });
      if (nonEmpty(i.visionImageSize)) rows.push({ label: "Vision Res", value: `${i.visionImageSize}x${i.visionImageSize}` });
      if (nonEmpty(i.visionPatchSize)) rows.push({ label: "Vision Patch", value: String(i.visionPatchSize) });
      if (nonEmpty(i.visionNumChannels)) rows.push({ label: "Vision Ch", value: String(i.visionNumChannels) });
      if (nonEmpty(i.visionHeadCount)) rows.push({ label: "Vision Heads", value: String(i.visionHeadCount) });
      if (nonEmpty(i.mmTokensPerImage)) rows.push({ label: "Tokens/Img", value: String(i.mmTokensPerImage) });
      return rows;
    },
  },
  {
    title: "Tokenizer",
    getRows: (i: GGUFInfo) => {
      const rows: KVRow[] = [];
      if (nonEmpty(i.tokenizerModel)) rows.push({ label: "Tokenizer", value: i.tokenizerModel });
      if (nonEmpty(i.bosTokenId)) rows.push({ label: "BOS", value: String(i.bosTokenId) });
      if (nonEmpty(i.eosTokenId)) rows.push({ label: "EOS", value: String(i.eosTokenId) });
      if (nonEmpty(i.padTokenId)) rows.push({ label: "PAD", value: String(i.padTokenId) });
      if (nonEmpty(i.unknownTokenId)) rows.push({ label: "UNK", value: String(i.unknownTokenId) });
      if (nonEmpty(i.chatTemplate)) rows.push({ label: "Chat Template", value: "(set)" });
      return rows;
    },
  },
  {
    title: "Provenance",
    getRows: (i: GGUFInfo) => {
      const rows: KVRow[] = [];
      if (nonEmpty(i.author)) rows.push({ label: "Author", value: i.author });
      if (nonEmpty(i.organization)) rows.push({ label: "Org", value: i.organization });
      if (nonEmpty(i.license)) rows.push({ label: "License", value: i.license });
      if (nonEmpty(i.version)) rows.push({ label: "Version", value: i.version });
      if (nonEmpty(i.url)) rows.push({ label: "URL", value: i.url });
      if (nonEmpty(i.description)) rows.push({ label: "Desc", value: i.description });
      if (nonEmpty(i.date)) rows.push({ label: "Date", value: i.date });
      return rows;
    },
  },
  {
    title: "Tensors",
    getRows: (i: GGUFInfo) => {
      const rows: KVRow[] = [];
      if (i.tensorTypes.length > 0) {
        for (const t of i.tensorTypes) {
          const parts = t.split(" ");
          rows.push({ label: parts[1] || "", value: parts[0] || "", color: "text" });
        }
      }
      return rows;
    },
  },
];

class GGUFContentPanel extends Scrollable {
  focusable = true;
  protected _info: GGUFInfo | null = null;
  protected _modelLabel = "";

  constructor() {
    super();
  }

  setInfo(info: GGUFInfo | null, modelLabel?: string): void {
    this._info = info;
    if (modelLabel) this._modelLabel = modelLabel;
    this.scrollOffset = 0;
    this.markDirty();
  }

  onLayout(): void {
    super.onLayout();
    if (!this._info) {
      this.contentHeight = 0;
      return;
    }
    this.contentHeight = this._totalContentHeight();
  }

  protected _visibleSections(): number[] {
    if (!this._info) return [];
    const result: number[] = [];
    for (let si = 0; si < SECTIONS.length; si++) {
      const sec = SECTIONS[si]!;
      const rows = sec.getRows(this._info);
      if (sec.skipIfZero && this._info[sec.skipIfZero] === 0) continue;
      if (rows.length === 0 && si !== 0) continue;
      result.push(si);
    }
    return result;
  }

  protected _sectionRowCount(si: number): number {
    if (!this._info) return 0;
    let count = SECTIONS[si]!.getRows(this._info).length;
    if (si === 0 && this._modelLabel) count++;
    return count;
  }

  protected _totalContentHeight(): number {
    let h = 0;
    const visible = this._visibleSections();
    for (let i = 0; i < visible.length; i++) {
      h++;
      h += this._sectionRowCount(visible[i]!);
      if (i < visible.length - 1) h++;
    }
    return h;
  }

  handleKey(key: string): boolean {
    if (key === "UP" || key === "k") {
      this.scrollOffset = Math.max(0, this.scrollOffset - 1);
      this.markDirty();
      return true;
    }
    if (key === "DOWN" || key === "j") {
      this.scrollOffset = Math.min(this.maxScrollOffset, this.scrollOffset + 1);
      this.markDirty();
      return true;
    }
    if (key === "PAGE_UP" || key === "u") {
      this.scrollOffset = Math.max(0, this.scrollOffset - 5);
      this.markDirty();
      return true;
    }
    if (key === "PAGE_DOWN" || key === "d") {
      this.scrollOffset = Math.min(this.maxScrollOffset, this.scrollOffset + 5);
      this.markDirty();
      return true;
    }
    if (key === "HOME") {
      this.scrollOffset = 0;
      this.markDirty();
      return true;
    }
    if (key === "END") {
      this.scrollOffset = this.maxScrollOffset;
      this.markDirty();
      return true;
    }
    return false;
  }

  draw(ctx: RenderContext): void {
    const { canvas } = ctx;
    const { x, y, height } = this.rect;
    const cw = this.contentWidth;

    if (!this._info) {
      canvas.moveTo(x, y);
      fg(canvas, "textMuted", "(no metadata available)");
      return;
    }

    const maxLabelLen = 14;
    const visible = this._visibleSections();
    let visualY = 0;

    for (let i = 0; i < visible.length; i++) {
      const si = visible[i]!;
      const sec = SECTIONS[si]!;
      const rows = sec.getRows(this._info);

      // Section header
      if (visualY >= this.scrollOffset && visualY < this.scrollOffset + height) {
        const drawY = y + (visualY - this.scrollOffset);
        canvas.moveTo(x, drawY);
        fg(canvas, "secondary", sec.title);
      }
      visualY++;

      // Model label row (first in Identity, front-truncated)
      if (si === 0 && this._modelLabel) {
        const maxValLen = Math.max(1, cw - maxLabelLen - 5);
        let labelVal = this._modelLabel;
        if (labelVal.length > maxValLen) {
          labelVal = "…" + labelVal.slice(-maxValLen + 3);
        }
        if (visualY >= this.scrollOffset && visualY < this.scrollOffset + height) {
          const drawY = y + (visualY - this.scrollOffset);
          canvas.moveTo(x, drawY);
          canvas.setForegroundColor("borderMuted");
          canvas.write(" ");
          const lbl = ("  Model:").padEnd(maxLabelLen + 2);
          fg(canvas, "textMuted", lbl);
          fg(canvas, "text", labelVal);
        }
        visualY++;
      }

      // Section rows (indented 2 chars)
      for (const row of rows) {
        if (visualY >= this.scrollOffset && visualY < this.scrollOffset + height) {
          const drawY = y + (visualY - this.scrollOffset);
          canvas.moveTo(x, drawY);
          canvas.setForegroundColor("borderMuted");
          canvas.write(" ");
          const label = ("  " + row.label + ":").padEnd(maxLabelLen + 2);
          fg(canvas, "textMuted", label);
          fg(canvas, row.color || "text", row.value);
        }
        visualY++;
      }

      // Blank line between sections
      if (i < visible.length - 1) {
        if (visualY >= this.scrollOffset && visualY < this.scrollOffset + height) {
          const drawY = y + (visualY - this.scrollOffset);
          canvas.moveTo(x, drawY);
          canvas.clearRect(x, drawY, cw, 1);
        }
        visualY++;
      }
    }

    const totalH = this._totalContentHeight();
    for (let row = 0; row < height; row++) {
      const vr = this.scrollOffset + row;
      if (vr >= totalH) {
        const drawY = y + row;
        canvas.moveTo(x, drawY);
        canvas.clearRect(x, drawY, cw, 1);
      }
    }

    if (this.needsScrollbar) {
      this.drawScrollbar(canvas, x + cw, y, this._scrollbarWidth, height);
    }
  }

  onMouseWheel(_point: Point, direction: 'up' | 'down'): boolean {
    if (direction === 'up' && this.scrollOffset > 0) {
      this.scrollOffset--;
      this.markDirty();
      return true;
    }
    if (direction === 'down' && this.scrollOffset < this.maxScrollOffset) {
      this.scrollOffset++;
      this.markDirty();
      return true;
    }
    return false;
  }

  onMouseDown(point: Point): boolean {
    if (!this.needsScrollbar) return false;

    const sx = this.rect.x + this.contentWidth;
    const sw = this._scrollbarWidth;

    if (point.x >= sx && point.x < sx + sw) {
      const trackTop = this.rect.y;
      const trackHeight = this.rect.height;
      const clickY = point.y - trackTop;
      const thumbMinHeight = 2;
      const ratio = this._viewportHeight / this.contentHeight;
      const thumbHeight = Math.max(thumbMinHeight, Math.floor(ratio * trackHeight));
      const maxThumbPos = trackHeight - thumbHeight;

      if (maxThumbPos <= 0) return false;

      this.scrollOffset = Math.floor((clickY / maxThumbPos) * this.maxScrollOffset);
      this.scrollOffset = Math.max(0, Math.min(this.maxScrollOffset, this.scrollOffset));
      this.markDirty();
      return true;
    }

    return false;
  }
}

export class GGUFInfoModal extends Modal {
  protected _loading = false;
  protected _showMessage: ((msg: string) => void) | null = null;
  protected _modelPath = "";
  protected _contentColumn: Column;
  protected _buttonRow: Row;
  protected _copyPathBtn: Button;
  protected _setActiveBtn: Button;
  protected _closeBtn: Button;
  protected _cancelBtn: Button;
  protected _loadingLabel: StyledText;
  protected _footerSpacer: Spacer;
  protected _contentPanel: GGUFContentPanel;

  constructor() {
    super();
    this.setMinSize(60, 30);
    this.setMaxSize(60, 30);

    this._loadingLabel = new StyledText();
    this._loadingLabel.builder.muted("Running llama-tokenize, please wait...");

    this._contentPanel = new GGUFContentPanel();

    this._copyPathBtn = new Button({ label: "Copy path" });
    this._setActiveBtn = new Button({ label: "Set Active" });
    this._closeBtn = new Button({ label: "Close" });
    this._cancelBtn = new Button({ label: "Cancel" });

    this._copyPathBtn.setAction(() => this._copyPath());
    this._setActiveBtn.setAction(() => this.closeWithResult(true));
    this._closeBtn.setAction(() => this.closeWithResult(false));
    this._cancelBtn.setAction(() => this.closeWithResult(false));

    this._cancelBtn.visible = false;
    this._buttonRow = createSplitButtonRow(this._copyPathBtn, this._setActiveBtn, this._closeBtn, this._cancelBtn);

    this._contentColumn = new Column();
    this._contentColumn.add(this._loadingLabel);
    this._contentColumn.add(this._contentPanel);
    this._loadingLabel.flex = 1;
    this._contentPanel.flex = 1;
    this._contentPanel.visible = false;
    this._contentColumn.flex = 1;

    this._footerSpacer = new Spacer();

    this.add(this._contentColumn);
    this.add(this._footerSpacer);
    this.add(this._buttonRow);
  }

  setShowMessage(cb: (msg: string) => void): void {
    this._showMessage = cb;
  }

  setModelPath(path: string): void {
    this._modelPath = path;
  }

  protected _copyPath(): void {
    if (!this._modelPath) return;
    const platform = os.platform();
    let copyCmd: string, copyArgs: string[];
    if (platform === "darwin") {
      copyCmd = "pbcopy";
      copyArgs = [];
    } else if (platform === "win32") {
      copyCmd = "clip";
      copyArgs = [];
    } else {
      copyCmd = "xclip";
      copyArgs = ["-selection", "clipboard"];
    }
    const child = spawn(copyCmd, copyArgs);
    child.stdin.write(this._modelPath);
    child.stdin.end();
    child.on("error", () => {
      this._showMessage?.("Could not copy to clipboard");
    });
    this._showMessage?.("Path copied to clipboard");
  }

  setLoading(loading: boolean): void {
    this._loading = loading;
    this._loadingLabel.visible = loading;
    this._contentPanel.visible = !loading;
    this._copyPathBtn.visible = !loading;
    this._setActiveBtn.visible = !loading;
    this._closeBtn.visible = !loading;
    this._cancelBtn.visible = loading;
    this.markDirty();
  }

  setInfo(info: GGUFInfo | null, modelLabel?: string): void {
    this._loading = false;
    this._loadingLabel.visible = false;
    this._contentPanel.visible = true;
    this._copyPathBtn.visible = true;
    this._setActiveBtn.visible = true;
    this._closeBtn.visible = true;
    this._cancelBtn.visible = false;
    this._contentPanel.setInfo(info, modelLabel);
    this.markDirty();
  }

  closeWithResult(result: boolean): void {
    super.closeWithResult(result);
  }

  handleKey(key: string): boolean {
    if (key === "ESC" || key === "ESCAPE") {
      this.closeWithResult(false);
      return true;
    }
    return super.handleKey(key);
  }

  onFocus(): void {
    super.onFocus();
    if (this._loading) {
      focusManager.setFocus(this._cancelBtn);
    } else {
      focusManager.setFocus(this._contentPanel);
    }
  }

  onLayout(): void {
    const { x, y, width, height } = this.rect;
    const contentRect = { x: x + 2, y: y + 3, width: width - 4, height: height - 6 };
    const spacerRect = { x: x + 2, y: y + height - 3, width: width - 4, height: 1 };
    const buttonRect = { x: x + 2, y: y + height - 2, width: width - 4, height: 1 };
    this._contentColumn.layout(contentRect);
    this._footerSpacer.layout(spacerRect);
    this._buttonRow.layout(buttonRect);
  }
}

export function createGGUFInfoModal(
  modelLabel: string,
  config: ConfigData,
  modelPath: string,
  showMessage: (msg: string) => void,
): GGUFInfoModal {
  const modal = new GGUFInfoModal();
  modal.title = "Model Info";
  modal.hint = "j/k scroll";
  modal.setModelPath(modelPath);
  modal.setShowMessage(showMessage);
  modal.setLoading(true);

  inspectGGUF(config, modelPath).then((info) => {
    modal.setInfo(info, modelLabel);
  });

  return modal;
}
