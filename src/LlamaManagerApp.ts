import type { Terminal } from "terminal-kit";
import { setActiveTheme, setThemeMode, getThemeMode } from "./lib/theme";
import { loadConfig, saveConfig, ConfigData } from "./lib/config";
import { taskStore } from "./lib/tasks";
import { stopServer, setMaxLogLines, getStatus } from "./lib/server";
import { checkForUpdate } from "./lib/updates";
import { createUpdateInfoModal } from "./ui/specialized/UpdateInfoModal";
import { createHelpModal } from "./ui/specialized/HelpModal";
import type { TabContext } from "./lib/tabcontext";
import type { Modal } from "./framework/widgets/Modal";
import pkg from "../package.json";
import { createExitDialog } from "./framework/widgets/ExitDialog";
import { createThemeSelectorModal } from "./ui/specialized/ThemeSelectorModal";
import { createStoppingServerModal } from "./ui/specialized/StoppingServerModal";
import { MainControl } from "./ui/MainControl";
import { Application } from "./framework/Application";
import { modalManager } from "./framework/ModalManager";
import { focusManager } from "./framework/FocusManager";

export class LlamaManagerApp {
  protected _app: Application | null = null;
  protected _main: MainControl | null = null;
  protected _ctx: TabContext | null = null;
  protected _config: ConfigData | null = null;

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
      renderOverlay: () => false,
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

    if (key === "CTRL_U" && !textActive && !modalManager.isOpen()) {
      if (!this._config) return false;
      this.showMessage("Checking for updates...");
      checkForUpdate(this._config, pkg.version, true).then((result) => {
        if (result?.isAvailable) {
          this._main!.setUpdateAvailable(true, result.latestVersion);
          this._ctx!.openModal(createUpdateInfoModal(pkg.version, result.latestVersion, this._ctx));
        } else {
          this.showMessage(`You are up to date (v${pkg.version})`);
        }
        this.forceRender();
      });
      return true;
    }

    if (key === "?" && !textActive && !modalManager.isOpen()) {
      this._ctx!.openModal(createHelpModal());
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
