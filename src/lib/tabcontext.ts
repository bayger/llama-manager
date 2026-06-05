import type { Terminal } from "terminal-kit";

export interface TabContext {
  term: Terminal;
  scheduleRender(): void;
  showMessage(msg: string): void;
  setTextInputFocused(focused: boolean): void;
  getConfig(): any | null;
}
