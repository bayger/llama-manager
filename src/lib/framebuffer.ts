export interface Cell {
  ch: string;
  fg: string;
  bg: string;
  bold: boolean;
}

export let DEFAULT_FG = '#7f7f7f';
export let DEFAULT_BG = '#000000';

export function setFramebufferDefaults(fg: string, bg: string): void {
  DEFAULT_FG = fg;
  DEFAULT_BG = bg;
}

function createCell(): Cell {
  return { ch: ' ', fg: DEFAULT_FG, bg: DEFAULT_BG, bold: false };
}

function createRow(width: number): Cell[] {
  const row: Cell[] = [];
  for (let i = 0; i < width; i++) {
    row.push(createCell());
  }
  return row;
}

function createBuffer(width: number, height: number): Cell[][] {
  const buf: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    buf.push(createRow(width));
  }
  return buf;
}

export class Framebuffer {
  private _buffers: [Cell[][], Cell[][]] = [[], []];
  private _width = 0;
  private _height = 0;
  private _active = 0;

  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }

  /** The buffer currently being drawn into. */
  get front(): Cell[][] {
    return this._buffers[this._active];
  }

  /** The previously rendered buffer (used for diffing). */
  get back(): Cell[][] {
    return this._buffers[1 - this._active];
  }

  /** Resize both buffers, filling with default cells. */
  resize(width: number, height: number): void {
    if (this._width === width && this._height === height) return;
    this._width = width;
    this._height = height;
    this._buffers[0] = createBuffer(width, height);
    this._buffers[1] = createBuffer(width, height);
  }

  /** Swap front/back. Call at start of each frame. */
  swap(): void {
    this._active = 1 - this._active;
  }

  /** Clear the front buffer to defaults. */
  clearFront(): void {
    const buf = this.front;
    for (let y = 0; y < this._height; y++) {
      const row = buf[y]!;
      for (let x = 0; x < this._width; x++) {
        const c = row[x]!;
        c.ch = ' ';
        c.fg = DEFAULT_FG;
        c.bg = DEFAULT_BG;
        c.bold = false;
      }
    }
  }

  /** Fill a rectangle in the front buffer. */
  fillRect(x: number, y: number, w: number, h: number, cell: Cell): void {
    const buf = this.front;
    for (let dy = 0; dy < h; dy++) {
      const row = buf[y + dy];
      if (!row) continue;
      for (let dx = 0; dx < w; dx++) {
        const c = row[x + dx];
        if (!c) continue;
        c.ch = cell.ch;
        c.fg = cell.fg;
        c.bg = cell.bg;
        c.bold = cell.bold;
      }
    }
  }

  /** Copy a region from one buffer to the front buffer. */
  copyRegion(
    src: Cell[][],
    srcX: number,
    srcY: number,
    w: number,
    h: number,
    dstX: number,
    dstY: number,
  ): void {
    const dst = this.front;
    for (let dy = 0; dy < h; dy++) {
      const srcRow = src[srcY + dy];
      const dstRow = dst[dstY + dy];
      if (!srcRow || !dstRow) continue;
      for (let dx = 0; dx < w; dx++) {
        const s = srcRow[srcX + dx];
        const d = dstRow[dstX + dx];
        if (!s || !d) continue;
        d.ch = s.ch;
        d.fg = s.fg;
        d.bg = s.bg;
        d.bold = s.bold;
      }
    }
  }
}
