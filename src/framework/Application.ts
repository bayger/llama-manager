import type { Terminal } from "terminal-kit";
import { Framebuffer } from "../lib/framebuffer";
import { FramebufferCanvas } from "../lib/framebuffer-canvas";
import { diffToTerminal } from "../lib/framebuffer-diff";
import { focusManager } from "./FocusManager";
import { modalManager } from "./ModalManager";
import { Control } from "./Control";
import type { RenderContext, Rect } from "./types";
import { setFramebufferDefaults } from "../lib/framebuffer";
import { DEFAULT_FG, DEFAULT_BG } from "../lib/framebuffer";

const CURSOR_SHOW = "\x1b[?25h";
const CURSOR_HIDE = "\x1b[?25l";

export interface ApplicationOptions {
  term: Terminal;
  root: Control;

  handleAppKey?: (key: string) => boolean;

  renderOverlay?: (canvas: FramebufferCanvas, width: number, height: number) => boolean;

  onQuit?: () => void | Promise<void>;
}

export class Application {
  protected _fb: Framebuffer;
  protected _canvas: FramebufferCanvas;
  protected _term: Terminal;
  protected _root: Control;
  protected _handleAppKey: ((key: string) => boolean) | null = null;
  protected _renderOverlay: ((canvas: FramebufferCanvas, width: number, height: number) => boolean) | null = null;
  protected _onQuit: (() => void | Promise<void>) | null = null;

  private _keyHandler: ((name: string, matches: string[], data: any) => void) | null = null;
  private _mouseHandler: ((action: string, data: any) => void) | null = null;
  private _resizeHandler: (() => void) | null = null;
  private _resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private _renderInterval: ReturnType<typeof setInterval> | null = null;
  private _firstRender = true;
  private _cursorVisible = false;

  constructor(options: ApplicationOptions) {
    this._term = options.term;
    this._root = options.root;
    this._handleAppKey = options.handleAppKey || null;
    this._renderOverlay = options.renderOverlay || null;
    this._onQuit = options.onQuit || null;

    this._fb = new Framebuffer();
    this._fb.resize(process.stdout.columns || 80, process.stdout.rows || 24);
    this._fb.clearFront();

    this._canvas = new FramebufferCanvas(this._fb);
  }

  public start(): void {
    focusManager.setRoot(this._root);
    this.setupKeyHandler();
    this.setupResizeHandler();
    this._renderInterval = setInterval(() => {
      try {
        this.render();
      } catch (e) {
        console.error("[Application] Render error:", e);
      }
    }, 10);
  }

  public getCanvas(): FramebufferCanvas {
    return this._canvas;
  }

  public markDirty(): void {
    this._root.markDirty();
  }

  public markAllDirty(): void {
    this._root.markAllDirty();
  }

  public setTextInputFocused(focused: boolean): void {
    focusManager.activateTextInput(focused);
  }

  protected render(): void {
    const { _term: term, _fb: fb, _canvas: canvas, _root: root } = this;
    const width = process.stdout.columns || 80;
    const height = process.stdout.rows || 24;

    if (!root.needsRender && !modalManager.needsRender) return;

    fb.resize(width, height);

    if (this._firstRender) {
      fb.clearFront();
      this._firstRender = false;
    }

    fb.swap();
    fb.copyRegion(fb.back, 0, 0, width, height, 0, 0);

    canvas.hideTerminalCursor();

    const renderCtx: RenderContext = {
      canvas,
      scheduleRender: () => this.markDirty(),
      showMessage: () => {},
      showCursor: () => canvas.showTerminalCursor(),
    };

    let overlayBlocks = false;
    if (this._renderOverlay) {
      overlayBlocks = this._renderOverlay(canvas, width, height);
    }

    if (!overlayBlocks) {
      root.layout({ x: 1, y: 1, width, height });
      root.render(renderCtx);

      if (modalManager.isOpen()) {
        modalManager.render(canvas);
      }
    }

    diffToTerminal(fb.back, fb.front, (text) => term(text), width, height);

    term(`\x1b[${canvas.terminalCursorY};${canvas.terminalCursorX}H`);

    const wantVisible = canvas.terminalCursorVisible;
    if (wantVisible !== this._cursorVisible) {
      term(wantVisible ? CURSOR_SHOW : CURSOR_HIDE);
      this._cursorVisible = wantVisible;
    }
  }

  protected setupKeyHandler(): void {
    this._keyHandler = (name: string, _matches: string[], _data: any) => {
      if (this._handleAppKey && this._handleAppKey(name)) return;

      if (modalManager.handleKey(name)) return;

      focusManager.handleKey(name);
    };

    this._term.on("key", this._keyHandler);

    this._mouseHandler = (action: string, data: any) => {
      if (typeof data?.x !== "number" || typeof data?.y !== "number") return;
      const point = { x: data.x, y: data.y };
      focusManager.handleMouseMove(point);
      if (action === "MOUSE_WHEEL_UP" || action === "MOUSE_WHEEL_DOWN") {
        focusManager.handleMouseWheel(point, action === "MOUSE_WHEEL_UP" ? "up" : "down");
        return;
      }
      if (modalManager.isOpen()) {
        if (action === "MOUSE_LEFT_BUTTON_PRESSED") modalManager.handleMouseDown(point);
        else if (action === "MOUSE_LEFT_BUTTON_RELEASED") modalManager.handleMouseUp(point);
        return;
      }
      if (action === "MOUSE_LEFT_BUTTON_PRESSED") {
        focusManager.handleMouseDown(point);
      } else if (action === "MOUSE_LEFT_BUTTON_RELEASED") {
        focusManager.handleMouseUp(point);
      }
    };
    (this._term as any).on("mouse", this._mouseHandler);
  }

  protected setupResizeHandler(): void {
    this._resizeHandler = () => {
      if (this._resizeTimer) clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => {
        this.markDirty();
        this._resizeTimer = null;
      }, 100);
    };
    this._term.on("resize", this._resizeHandler);
  }

  public dispose(): void {
    if (this._renderInterval) {
      clearInterval(this._renderInterval);
      this._renderInterval = null;
    }
    if (this._keyHandler) {
      this._term.removeListener("key", this._keyHandler);
      this._keyHandler = null;
    }
    if (this._mouseHandler) {
      (this._term as any).removeListener("mouse", this._mouseHandler);
      this._mouseHandler = null;
    }
    if (this._resizeHandler) {
      this._term.removeListener("resize", this._resizeHandler);
      this._resizeHandler = null;
    }
    if (this._resizeTimer) {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = null;
    }
    focusManager.clear();
    this._root.destroy();
    this._term(CURSOR_SHOW);
  }
}
