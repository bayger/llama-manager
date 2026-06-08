import type { Terminal } from "terminal-kit";
import type { Cell } from "./framebuffer.js";
import { Framebuffer } from "./framebuffer.js";

export interface ClipRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const defaultCell: Cell = { ch: ' ', fg: '', bg: '', bold: false };

/** Convert 1-indexed terminal coord to 0-indexed buffer index. */
function toBuf(v: number): number {
  return Math.max(0, v - 1);
}

export class FramebufferCanvas {
  // Cursor stored in 1-indexed terminal coordinates (matches app/control rects)
  private _cursorX = 1;
  private _cursorY = 1;
  private _fg = '';
  private _bg = '';
  private _bold = false;
  private _clip: ClipRect | null = null;

  constructor(
    private _fb: Framebuffer,
    private _term: Terminal,
  ) {}

  get cursorX(): number {
    return this._cursorX;
  }

  get width(): number {
    return this._fb.width || (this._term.width as number);
  }

  get height(): number {
    return this._fb.height || (this._term.height as number);
  }

  setClipRect(rect: ClipRect | null): void {
    this._clip = rect;
  }

  getClipRect(): ClipRect | null {
    return this._clip;
  }

  moveTo(x: number, y: number): void {
    this._cursorX = x;
    this._cursorY = y;
  }

  write(text: string): void {
    const buf = this._fb.front;
    let i = 0;
    while (i < text.length) {
      const ch = text[i]!;
      if (ch === '\n') {
        this._cursorY++;
        this._cursorX = 1;
        i++;
        continue;
      }
      if (ch === '\r') {
        this._cursorX = 1;
        i++;
        continue;
      }

      // Clip test in 1-indexed coords
      if (this._clip) {
        if (this._cursorX < this._clip.x || this._cursorX >= this._clip.x + this._clip.width ||
            this._cursorY < this._clip.y || this._cursorY >= this._clip.y + this._clip.height) {
          this._cursorX++;
          i++;
          continue;
        }
      }

      // Convert to 0-indexed for buffer access
      const bx = toBuf(this._cursorX);
      const by = toBuf(this._cursorY);

      if (by < 0 || by >= this._fb.height || bx < 0 || bx >= this._fb.width) {
        this._cursorX++;
        i++;
        continue;
      }

      const cell = buf[by]![bx]!;
      cell.ch = ch;
      cell.fg = this._fg;
      cell.bg = this._bg;
      cell.bold = this._bold;

      this._cursorX++;
      i++;
    }
  }

  colorRgbHex(hex: string, text?: string): this {
    this._fg = hex;
    if (text !== undefined) {
      this.write(text);
    }
    return this;
  }

  bgColorRgbHex(hex: string, text?: string): this {
    this._bg = hex;
    if (text !== undefined) {
      this.write(text);
    }
    return this;
  }

  bold(): this {
    this._bold = true;
    return this;
  }

  styleReset(): this {
    this._fg = '';
    this._bg = '';
    this._bold = false;
    return this;
  }

  eraseLine(): this {
    const buf = this._fb.front;
    // Convert 1-indexed cursor Y to 0-indexed buffer row
    const by = toBuf(this._cursorY);
    if (by < 0 || by >= this._fb.height) return this;

    const row = buf[by]!;
    // Clip bounds in 1-indexed, convert to 0-indexed for buffer
    const startX = toBuf(this._clip ? Math.max(this._clip.x, 1) : 1);
    const endX = toBuf(this._clip ? Math.min(this._clip.x + this._clip.width, this._fb.width + 1) : this._fb.width + 1);

    for (let x = startX; x < endX; x++) {
      if (x < 0 || x >= this._fb.width) continue;
      const cell = row[x]!;
      cell.ch = ' ';
      cell.fg = this._fg;
      cell.bg = this._bg;
      cell.bold = this._bold;
    }

    return this;
  }

  fillRect(x: number, y: number, w: number, h: number): this {
    this._fb.fillRect(toBuf(x), toBuf(y), w, h, defaultCell);
    return this;
  }
}
