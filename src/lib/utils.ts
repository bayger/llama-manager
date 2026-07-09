export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠇"];
export const SPINNER_INTERVAL = 100;

export function spinnerChar(): string {
  return SPINNER_FRAMES[Math.floor(Date.now() / SPINNER_INTERVAL) % SPINNER_FRAMES.length];
}

// - Responsive breakpoints -

export type Breakpoint = "sm" | "md" | "lg" | "xl" | "2xl";

const widthBreakpoints: [Breakpoint, number][] = [
  ["sm", 0],
  ["md", 100],
  ["lg", 140],
  ["xl", 180],
  ["2xl", 240],
];

const heightBreakpoints: [Breakpoint, number][] = [
  ["sm", 0],
  ["md", 30],
  ["lg", 50],
  ["xl", 80],
  ["2xl", 120],
];

function getBreakpointFor(width: number, breakpoints: [Breakpoint, number][]): Breakpoint {
  let result: Breakpoint = "sm";
  for (const [bp, min] of breakpoints) {
    if (width >= min) result = bp;
    else break;
  }
  return result;
}

export function getBreakpoint(width: number): Breakpoint {
  return getBreakpointFor(width, widthBreakpoints);
}

export function getBreakpointHeight(height: number): Breakpoint {
  return getBreakpointFor(height, heightBreakpoints);
}

export function isAtLeast(width: number, minBp: Breakpoint): boolean {
  const min = widthBreakpoints.find(bp => bp[0] === minBp)?.[1] ?? Infinity;
  return width >= min;
}

export function isAtLeastHeight(height: number, minBp: Breakpoint): boolean {
  const min = heightBreakpoints.find(bp => bp[0] === minBp)?.[1] ?? Infinity;
  return height >= min;
}

export function isBelow(width: number, maxBp: Breakpoint): boolean {
  const entry = widthBreakpoints.find(bp => bp[0] === maxBp);
  if (!entry) return false;
  const idx = widthBreakpoints.indexOf(entry);
  const nextMin = idx < widthBreakpoints.length - 1 ? widthBreakpoints[idx + 1]?.[1] ?? Infinity : Infinity;
  return width < nextMin;
}

export function isBelowHeight(height: number, maxBp: Breakpoint): boolean {
  const entry = heightBreakpoints.find(bp => bp[0] === maxBp);
  if (!entry) return false;
  const idx = heightBreakpoints.indexOf(entry);
  const nextMin = idx < heightBreakpoints.length - 1 ? heightBreakpoints[idx + 1]?.[1] ?? Infinity : Infinity;
  return height < nextMin;
}

const orderedBreakpoints: Breakpoint[] = ["sm", "md", "lg", "xl", "2xl"];

function responsiveFor<T>(bp: Breakpoint, values: { sm: T; md?: T; lg?: T; xl?: T; "2xl"?: T }): T {
  const idx = orderedBreakpoints.indexOf(bp);
  for (let i = idx; i >= 0; i--) {
    const key = orderedBreakpoints[i]!;
    if (values[key] !== undefined) return values[key];
  }
  return values.sm;
}

export function responsive<T>(width: number, values: { sm: T; md?: T; lg?: T; xl?: T; "2xl"?: T }): T {
  return responsiveFor(getBreakpoint(width), values);
}

export function responsiveHeight<T>(height: number, values: { sm: T; md?: T; lg?: T; xl?: T; "2xl"?: T }): T {
  return responsiveFor(getBreakpointHeight(height), values);
}

export function fireAsync(fn: () => Promise<void>, app: { showMessage: (msg: string) => void }): void {
  fn().catch((err) => {
    app.showMessage(`Error: ${err.message}`);
  });
}

export function pad(str: string, len: number): string {
  if (str.length >= len) return str.substring(0, len);
  return str + " ".repeat(len - str.length);
}

export function formatMs(ms: number): string {
  if (ms < 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSec = ms / 1000;
  if (totalSec < 60) return `${totalSec.toFixed(1)}s`;
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m ${s}s`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s}s`;
}

export function formatUptime(ms: number): string {
  if (ms < 0) return "0s";
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m ${s}s`;
}

export function formatNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function formatDraftRate(rate: number): string {
  return rate > 0 ? `${(rate * 100).toFixed(1)}%` : "-";
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((v) => String(v).padStart(2, "0")).join(":");
}

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
