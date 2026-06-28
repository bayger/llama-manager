import { Control } from "../../framework/Control";
import { Column } from "../../framework/Layout";
import { Section } from "../../framework/widgets/Section";
import { OptionsPanel } from "../specialized/OptionsPanel";
import { focusManager } from "../../framework/FocusManager";
import type { TabContext } from "../../lib/tabcontext";
import type { Size } from "../../framework/types";

export class OptionsControl extends Control {
  protected _ctx: TabContext | null = null;
  protected _column: Column;
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

    this._column = new Column();
    this._column.add(this._section);
    this._column.flex = 1;

    this.add(this._column);
  }

  measure(parentSize?: Size): Size {
    return parentSize ? { width: parentSize.width, height: parentSize.height } : super.measure(parentSize);
  }

  onFocus(): void {
    super.onFocus();
    focusManager.setFocus(this._panel);
  }

  onDestroy(): void {
    this._ctx = null;
  }
}

export function createOptionsTab(ctx: TabContext): Control {
  return new OptionsControl(ctx);
}
