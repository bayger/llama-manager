import type { Terminal } from "terminal-kit";
import type { RenderContext } from "../components/ui/types.js";

export interface TabContext extends RenderContext {
  setTextInputFocused(focused: boolean): void;
}
