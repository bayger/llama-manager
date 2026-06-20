import { Column } from "../ui/Layout";
import { Section } from "../ui/widgets/Section";
import { OptionsPanel } from "../specialized/OptionsPanel";
import { focusManager } from "../ui/FocusManager";
import type { TabContext } from "../../lib/tabcontext";
import type { Size } from "../ui/types";

export class OptionsControl extends Column {
  protected _ctx: TabContext | null = null;
  protected _section: Section;
  protected _panel: OptionsPanel;

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;

    this._section = new Section();
    this._section.title = "Options";
    this._section.flex = 1;

    this._panel = new OptionsPanel(ctx);
    this._panel.flex = 1;
    this._section.add(this._panel);

    this.add(this._section);
  }

  measure(parentSize?: Size): Size {
    const ps = parentSize || { width: 80, height: 24 };
    return { width: ps.width, height: ps.height };
  }

  onFocus(): void {
    super.onFocus();
    focusManager.setFocus(this._panel);
  }

  onDestroy(): void {
    this._ctx = null;
  }
}

export function createOptionsTab(ctx: TabContext): OptionsControl {
  return new OptionsControl(ctx);
}
