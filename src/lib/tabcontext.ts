import type { ConfigData } from "../lib/config";
import type { RenderContext } from "../components/ui/types";
import type { Modal } from "../components/ui/widgets/Modal";
import { modalManager } from "../components/ui/ModalManager";

export interface TabContext extends RenderContext {
  setTextInputFocused(focused: boolean): void;
  setConfig(config: ConfigData): void;
  forceRender(): void;
  openModal<T = void>(modal: Modal): Promise<T>;
  closeModal<T = void>(result?: T, modal?: Modal): void;
}
