import { Modal } from "./Modal";
import { Control } from "../Control";
import { fg } from "../../lib/theme";
import { spinnerChar, SPINNER_INTERVAL } from "../../lib/utils";
import type { RenderContext, Size } from "../types";

class StoppingContent extends Control {
  focusable = false;
  protected _spinnerTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this._spinnerTimer = setInterval(() => {
      this.markDirty();
    }, SPINNER_INTERVAL);
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

  onDestroy(): void {
    if (this._spinnerTimer) {
      clearInterval(this._spinnerTimer);
      this._spinnerTimer = null;
    }
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
