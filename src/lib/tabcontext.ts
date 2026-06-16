import type { ConfigData } from "../lib/config";
import type { RenderContext } from "../components/ui/types";

export interface TabContext extends RenderContext {
  setTextInputFocused(focused: boolean): void;
  setConfig(config: ConfigData): void;
  forceRender(): void;
}
