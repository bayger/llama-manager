import { Control } from "../ui/Control";
import { Section } from "../ui/widgets/Section";
import { OptionsPanel } from "../specialized/OptionsPanel";
import type { TabContext } from "../../lib/tabcontext";
import type { Size } from "../ui/types";

export class OptionsControl extends Control {
  protected _ctx: TabContext | null = null;
  protected _section: Section;

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;

    this._section = new Section();
    this._section.title = "Options";
    this._section.flex = 1;

    const panel = new OptionsPanel(ctx);
    panel.flex = 1;
    this._section.add(panel);

    this.add(this._section);
  }

  measure(parentSize?: Size): Size {
    return parentSize ? { width: parentSize.width, height: parentSize.height } : super.measure(parentSize);
  }

  onDestroy(): void {
    this._ctx = null;
  }
}

export function createOptionsTab(ctx: TabContext): Control {
  return new OptionsControl(ctx);
}
