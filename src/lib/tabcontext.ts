import type { ConfigData } from "../lib/config.js";
import type { RenderContext } from "../components/ui/types.js";

export interface TabContext extends RenderContext {
  setTextInputFocused(focused: boolean): void;
  setConfig(config: ConfigData): void;
  forceRender(): void;
}
