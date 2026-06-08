import type { Cell } from "./framebuffer.js";

function cellsEqual(a: Cell, b: Cell): boolean {
  return a.ch === b.ch && a.fg === b.fg && a.bg === b.bg && a.bold === b.bold;
}

function hexToAnsi(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

function bgHexToAnsi(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[48;2;${r};${g};${b}m`;
}

interface RunEntry {
  x: number;
  ch: string;
  fg: string;
  bg: string;
  bold: boolean;
  len: number;
}

export function diffToTerminal(
  oldBuf: Cell[][],
  newBuf: Cell[][],
  write: (text: string) => void,
  width: number,
  height: number,
): void {
  let output = '';

  for (let y = 0; y < height; y++) {
    const oldRow = oldBuf[y];
    const newRow = newBuf[y];
    if (!oldRow || !newRow) continue;

    // Check if row changed
    let rowChanged = false;
    for (let x = 0; x < width; x++) {
      const o = oldRow[x];
      const n = newRow[x];
      if (!o || !n || !cellsEqual(o, n)) {
        rowChanged = true;
        break;
      }
    }
    if (!rowChanged) continue;

    // Build runs of identical style cells for this row
    const runs: RunEntry[] = [];
    let i = 0;
    while (i < width) {
      const n = newRow[i]!;
      let runLen = 1;
      while (i + runLen < width) {
        const next = newRow[i + runLen]!;
        if (next.fg === n.fg && next.bg === n.bg && next.bold === n.bold) {
          runLen++;
        } else {
          break;
        }
      }
      runs.push({ x: i, ch: n.ch, fg: n.fg, bg: n.bg, bold: n.bold, len: runLen });
      i += runLen;
    }

    // Emit moveset + style + text for each run
    for (const run of runs) {
      // Check if this run actually differs from old
      let needsUpdate = false;
      for (let dx = 0; dx < run.len; dx++) {
        const o = oldRow[run.x + dx]!;
        if (!cellsEqual(o, newRow[run.x + dx]!)) {
          needsUpdate = true;
          break;
        }
      }
      if (!needsUpdate) continue;

      output += `\x1b[${y + 1};${run.x + 1}H`;

      if (run.fg) {
        output += hexToAnsi(run.fg);
      }
      if (run.bg) {
        output += bgHexToAnsi(run.bg);
      }
      if (run.bold) {
        output += '\x1b[1m';
      }
      
      let text = '';
      for (let dx = 0; dx < run.len; dx++) {
        text += newRow[run.x + dx]!.ch;
      }
      output += text;
      

      output += '\x1b[0m';
    }
  }

  if (output) {
    write(output);
  }
}
