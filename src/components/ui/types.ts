import type { FramebufferCanvas } from "../../lib/framebuffer-canvas.js";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface RenderContext {
  canvas: FramebufferCanvas;
  scheduleRender(): void;
  showMessage(msg: string): void;
  getConfig(): any | null;
}

export type ControlCallback = (value: any) => void;

export interface EventEmitter {
  on(event: string, callback: (...args: any[]) => void): void;
  off(event: string, callback: (...args: any[]) => void): void;
  emit(event: string, ...args: any[]): void;
}
