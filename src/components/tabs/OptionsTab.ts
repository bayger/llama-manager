import { Control } from "../ui/Control.js";
import type { TabContext } from "../../lib/tabcontext.js";
import type { Size } from "../ui/types.js";

export class OptionsControl extends Control {
  protected _ctx: TabContext | null = null;

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;
  }

  measure(parentSize?: Size): Size {
    return parentSize ? { width: parentSize.width, height: parentSize.height } : super.measure(parentSize);
  }

  onDetach(): void {
    this._ctx = null;
  }
}

export function createOptionsTab(ctx: TabContext): Control {
  return new OptionsControl(ctx);
}
