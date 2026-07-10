import { Modal } from "../../framework/widgets/Modal";
import { Control } from "../../framework/Control";
import { fg } from "../../lib/theme";
import { spinnerChar, startSpinner } from "../../lib/utils";
import type { RenderContext, Size } from "../../framework/types";

class StoppingContent extends Control {
  focusable = false;

  constructor() {
    super();
    this.disposeOnDestroy(startSpinner(() => this.markDirty()));
  }

  measure(parentSize?: Size): Size {
    return {
      width: parentSize?.width ?? this.rect.width,
      height: 1,
    };
  }

  draw(ctx: RenderContext): void {
    const { canvas } = ctx;
    const { x, y } = this.rect;

    canvas.moveTo(x, y);
    fg(canvas, "textMuted", "Stopping server ");
    fg(canvas, "textMuted", spinnerChar());
  }
}

export function createStoppingServerModal(): Modal {
  const modal = new Modal();
  modal.title = "Exiting";
  modal.setMinSize(30, 5);
  modal.setMaxSize(30, 5);
  modal.add(new StoppingContent());
  return modal;
}
