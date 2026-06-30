import type { Terminal } from "terminal-kit";
import { setActiveTheme, setThemeMode, fg, getThemeMode } from "./lib/theme";
import { loadConfig, saveConfig, ConfigData } from "./lib/config";
import { taskStore } from "./lib/tasks";
import { stopServer, setMaxLogLines, getStatus } from "./lib/server";
import type { TabContext } from "./lib/tabcontext";
import type { Modal } from "./framework/widgets/Modal";
import { createExitDialog } from "./framework/widgets/ExitDialog";
import { createThemeSelectorModal } from "./ui/specialized/ThemeSelectorModal";
import { createStoppingServerModal } from "./ui/specialized/StoppingServerModal";
import { MainControl, TABS } from "./ui/MainControl";
import type { TabId } from "./ui/MainControl";
import { Application } from "./framework/Application";
import { modalManager } from "./framework/ModalManager";
import { focusManager } from "./framework/FocusManager";
import type { FramebufferCanvas } from "./lib/framebuffer-canvas";

export class LlamaManagerApp {
  protected _app: Application | null = null;
  protected _main: MainControl | null = null;
  protected _ctx: TabContext | null = null;
  protected _config: ConfigData | null = null;
  protected _helpOverlayVisible = false;

  constructor(public term: Terminal) {}

  async start(): Promise<void> {
    const config = await loadConfig();
    this._config = config;
    setActiveTheme(config.themeName);
    setThemeMode(config.themeMode);
    setMaxLogLines(config.logs.maxLogLines);
    taskStore.init(config);

    this._ctx = {
      canvas: null as any,
      scheduleRender: () => {
        if (this._main) this._main.markDirty();
      },
      showMessage: (msg: string) => this.showMessage(msg),
      setTextInputFocused: (focused: boolean) => this.setTextInputFocused(focused),
      forceRender: () => this.forceRender(),
      getConfig: () => this._config,
      setConfig: (c: ConfigData) => {
        if (this._config) {
          Object.assign(this._config, c);
          if (c.logs?.maxLogLines !== undefined) setMaxLogLines(c.logs.maxLogLines);
          if (c.themeMode !== undefined) setThemeMode(c.themeMode);
        }
      },
      showCursor: () => {
        if (this._app) {
          this._app.getCanvas().showTerminalCursor();
        }
      },
      openModal: <T = void>(modal: Modal): Promise<T> => {
        const m = modal as unknown as Record<string, (...args: unknown[]) => void>;
        if (typeof m.setResolve === "function" && typeof m.closeWithResult === "function") {
          return new Promise<T>((resolve) => {
            m.setResolve(resolve);
            modal.setOnClose(() => {
              m.closeWithResult(false);
            });
            modalManager.open(modal);
            if (this._main) this._main.markAllDirty();
          });
        }
        modal.setOnClose(() => {
          modalManager.close();
          if (this._main) this._main.markAllDirty();
        });
        modalManager.open(modal);
        if (this._main) this._main.markAllDirty();
        return Promise.resolve() as Promise<T>;
      },
      closeModal: <T = void>(result?: T, modalInstance?: Modal) => {
        if (modalInstance) {
          const m = modalInstance as unknown as Record<string, unknown>;
          if (typeof m.closeWithResult === "function") {
            m.closeWithResult(result);
            return;
          }
          modalManager.close();
        } else {
          modalManager.close();
        }
        if (this._main) this._main.markAllDirty();
      },
    };

    this._main = new MainControl(this._ctx!, () => this.handleQuit());
    this._main.init();

    modalManager.setOnDirty(() => {
      if (this._main) this._main.markAllDirty();
    });

    const application = new Application({
      term: this.term,
      root: this._main,
      handleAppKey: (key: string) => this.handleAppKey(key),
      renderOverlay: (canvas: FramebufferCanvas, width: number, height: number) => {
        return this._helpOverlayVisible ? this.renderHelpOverlay(canvas, width, height) : false;
      },
      onQuit: () => this.handleQuit(),
    });

    this._app = application;
    if (this._ctx) {
      this._ctx.canvas = application.getCanvas();
    }
    focusManager.setRoot(this._main);
    application.start();
  }

  protected handleAppKey(key: string): boolean {
    const textActive = focusManager.isTextInputActive();

    if (key === "CTRL_T" && !textActive && !modalManager.isOpen()) {
      if (this._config) {
        createThemeSelectorModal(this._config.themeName).then((result) => {
          if (result && this._config) {
            this._config.themeName = result;
            this._config.themeMode = getThemeMode();
            saveConfig(this._config);
          }
          this.forceRender();
        });
      }
      return true;
    }

    if (key === "CTRL_D" && !textActive && !modalManager.isOpen()) {
      const mode = getThemeMode() === "dark" ? "light" : "dark";
      setThemeMode(mode);
      if (this._config) {
        this._config.themeMode = mode;
        saveConfig(this._config);
      }
      this.forceRender();
      return true;
    }

    if (key === "?" && !textActive) {
      this._helpOverlayVisible = !this._helpOverlayVisible;
      this.forceRender();
      return true;
    }

    if (this._helpOverlayVisible && (key === "?" || key === "Escape")) {
      this._helpOverlayVisible = false;
      this.forceRender();
      return true;
    }

    return false;
  }

  showMessage(msg: string): void {
    this._main!.showMessage(msg);
  }

  setTextInputFocused(focused: boolean): void {
    if (this._app) {
      this._app.setTextInputFocused(focused);
    }
  }

  forceRender(): void {
    if (this._main) {
      this._main.markAllDirty();
    }
  }

  protected renderHelpOverlay(canvas: FramebufferCanvas, width: number, height: number): boolean {
    const overlayY = 3;
    const overlayHeight = height - 4;

    const helpSections = [
      {
        title: "Navigation",
        keys: [
          ["F1-F7", "Switch tabs"],
          ["Tab / Shift+Tab", "Move focus"],
          ["Enter", "Confirm / select"],
          ["Esc", "Cancel / go back"],
        ],
      },
      {
        title: "Actions",
        keys: [
          ["?", "Toggle help"],
          ["Ctrl+T", "Open theme selector"],
          ["Ctrl+D", "Toggle dark/light mode"],
          ["q", "Quit application"],
        ],
      },
      {
        title: "Tab Shortcuts",
        keys: [
          ["F1", "Dashboard - metrics and server control"],
          ["F2", "Logs - live server log viewer"],
          ["F3", "Tasks - inference task history"],
          ["F4", "Profiles - preset editing and management"],
          ["F5", "Versions - install and switch llama.cpp builds"],
          ["F6", "Models - browse, download, and manage GGUF models"],
          ["F7", "Options - global application settings"],
        ],
      },
    ];

    const contentLines: { text: string; key: string; desc: string; isTitle: boolean; isHeader: boolean }[] = [];
    contentLines.push({ text: "  KEYBOARD SHORTCUTS", key: "", desc: "", isTitle: true, isHeader: false });
    contentLines.push({ text: "", key: "", desc: "", isTitle: false, isHeader: false });

    for (const section of helpSections) {
      contentLines.push({ text: `  ${section.title}`, key: "", desc: "", isTitle: false, isHeader: true });
      for (const [key, desc] of section.keys) {
        contentLines.push({ text: `    ${key.padEnd(22)}     ${desc}`, key, desc, isTitle: false, isHeader: false });
      }
      contentLines.push({ text: "", key: "", desc: "", isTitle: false, isHeader: false });
    }

    const contentHeight = contentLines.length;
    const startY = overlayY + Math.max(1, Math.floor((overlayHeight - contentHeight) / 2));

    canvas.setForegroundColor("canvas");
    canvas.setBackgroundColor("canvasSubtle");
    canvas.clearRect(1, overlayY, width, height - overlayY);

    for (let i = 0; i < overlayHeight && i < contentLines.length; i++) {
      const line = contentLines[i]!;
      const y = startY + i;
      canvas.moveTo(1, y);

      if (line.isTitle) {
        fg(canvas, "accent", line.text);
      } else if (line.isHeader) {
        fg(canvas, "accentColor", line.text);
      } else if (line.key) {
        fg(canvas, "accent", `    ${line.key}`);
        fg(canvas, "text", `     ${line.desc}`);
      } else {
        fg(canvas, "canvasSubtle", line.text);
      }
    }

    return true;
  }

  protected async handleQuit(): Promise<void> {
    if (!getStatus().running) {
      this.quit();
      return;
    }
    const result = await this._ctx!.openModal<string>(createExitDialog());
    if (result === "cancel") return;
    if (result === "exit") {
      this.quit();
      return;
    }
    if (result === "stop_and_exit") {
      const stoppingModal = createStoppingServerModal();
      modalManager.open(stoppingModal);
      if (this._main) this._main.markAllDirty();
      await stopServer();
      modalManager.close();
      if (this._main) this._main.markAllDirty();
      this.quit();
    }
  }

  protected quit(): void {
    if (this._app) {
      this._app.dispose();
      this._app = null;
    }
    this.term.grabInput(false);
    this.term.fullscreen(false);
    this.term.styleReset();
    process.exit(0);
  }

  dispose(): void {
    if (this._app) {
      this._app.dispose();
      this._app = null;
    }
    taskStore.dispose();
    this.term.grabInput(false);
    this.term.fullscreen(false);
    this.term.styleReset();
    const cfg = this._config;
    if (cfg?.dashboard.killServerOnExit) {
      stopServer().catch(() => {});
    }
  }
}
