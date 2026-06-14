import type { Cell } from "./framebuffer.js";
import { Framebuffer, DEFAULT_FG, DEFAULT_BG } from "./framebuffer.js";
import { Color, resolveColor } from "./theme.js";

export interface ClipRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const defaultCell: Cell = { ch: ' ', fg: DEFAULT_FG, bg: DEFAULT_BG, bold: false };

/** Convert 1-indexed terminal coord to 0-indexed buffer index. */
function toBuf(v: number): number {
  return Math.max(0, v - 1);
}

export class FramebufferCanvas {
  // Cursor stored in 1-indexed terminal coordinates (matches app/control rects)
  private _cursorX = 1;
  private _cursorY = 1;
  private _fg = DEFAULT_FG;
  private _bg = DEFAULT_BG;
  private _bold = false;
  private _clip: ClipRect | null = null;
  private _terminalCursorX = 1;
  private _terminalCursorY = 1;
  private _terminalCursorVisible = false;

  constructor(private _fb: Framebuffer) {}

  get cursorX(): number {
    return this._cursorX;
  }

  get cursorY(): number {
    return this._cursorY;
  }

  get terminalCursorX(): number {
    return this._terminalCursorX;
  }

  get terminalCursorY(): number {
    return this._terminalCursorY;
  }

  get terminalCursorVisible(): boolean {
    return this._terminalCursorVisible;
  }

  setTerminalCursor(x: number, y: number): void {
    this._terminalCursorX = x;
    this._terminalCursorY = y;
  }

  showTerminalCursor(): void {
    this._terminalCursorVisible = true;
  }

  hideTerminalCursor(): void {
    this._terminalCursorVisible = false;
  }

  get width(): number {
    return this._fb.width;
  }

  get height(): number {
    return this._fb.height;
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

  // colorRgbHex(hex: string): this {
  //   this._fg = hex;
  //   return this;
  // }

  // bgColorRgbHex(hex: string): this {
  //   this._bg = hex;
  //   return this;
  // }

  setForegroundColor(color: Color): this {
    this._fg = resolveColor(color);
    return this;
  }

  setBackgroundColor(color: Color): this {
    this._bg = resolveColor(color);
    return this;
  }

  bold(enabled: boolean = true): this {
    this._bold = enabled;
    return this;
  }

  styleReset(): this {
    this._fg = DEFAULT_FG;
    this._bg = DEFAULT_BG;
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

  clearRect(x: number, y: number, w: number, h: number): this {
    const buf = this._fb.front;
    const sx = toBuf(this._clip ? Math.max(this._clip.x, x) : x);
    const ex = toBuf(this._clip ? Math.min(this._clip.x + this._clip.width, x + w) : x + w);
    const sy = toBuf(this._clip ? Math.max(this._clip.y, y) : y);
    const ey = toBuf(this._clip ? Math.min(this._clip.y + this._clip.height, y + h) : y + h);

    for (let row = sy; row < ey; row++) {
      if (row < 0 || row >= this._fb.height) continue;
      const line = buf[row]!;
      for (let col = sx; col < ex; col++) {
        if (col < 0 || col >= this._fb.width) continue;
        const cell = line[col]!;
        cell.ch = ' ';
        cell.fg = this._fg;
        cell.bg = this._bg;
        cell.bold = false;
      }
    }
    return this;
  }
}
