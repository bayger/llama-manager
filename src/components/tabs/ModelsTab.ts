import { Control } from "../ui/Control.js";
import { Column, Row } from "../ui/Layout.js";
import { Button } from "../ui/widgets/Button.js";
import { Divider } from "../ui/widgets/Divider.js";
import { Label } from "../ui/widgets/Label.js";
import { List, ListItem } from "../ui/widgets/List.js";
import { themeColors, fg, fgBg } from "../../lib/theme.js";
import { focusManager } from "../ui/FocusManager.js";
import { listLocalModels, deleteModel, setActiveModel, LocalModel, formatSize, getTotalModelsSize } from "../../lib/models.js";
import { saveConfig } from "../../lib/config.js";
import type { TabContext } from "../../lib/tabcontext.js";
import type { Size } from "../ui/types.js";

export class ModelsControl extends Control {
  protected _ctx: TabContext | null = null;
  protected _attached = false;

  protected _column: Column;
  protected _headerLabel: Label;
  protected _buttonRow: Row;
  protected _browseBtn: Button;
  protected _removeBtn: Button;
  protected _modelList: List<string>;

  constructor(ctx: TabContext) {
    super();
    this._ctx = ctx;

    this._headerLabel = new Label();
    this._headerLabel.text = "Models: 0  Size: 0 B";
    this._headerLabel.color = themeColors.text;

    this._browseBtn = new Button({ label: "Browse HF" });
    this._removeBtn = new Button({ label: "Remove" });
    this._buttonRow = new Row();
    this._buttonRow.add(this._browseBtn);
    this._buttonRow.add(this._removeBtn);

    this._modelList = new List<string>();
    this._modelList.flex = 1;
    this._modelList.setOnSelect((item) => {
      const model = (item as any).data as LocalModel;
      this.selectModel(model);
    });
    this._modelList.setRenderer((term, item, _index, isSelected, _x, rowY, width) => {
      const model = (item as any).data as LocalModel;
      const prefix = model.active ? "● " : "  ";
      const name = `${model.repoId}/${model.filename}`;
      const size = formatSize(model.sizeBytes);
      const line = ` ${prefix}${name}  ${size}`;

      if (isSelected) {
        fgBg(term, themeColors.accent, themeColors.canvas, line.padEnd(width));
        term.styleReset();
      } else {
        term.moveTo(_x, rowY);
        fg(term, model.active ? themeColors.success : themeColors.text, line);
      }
    });

    this._column = new Column();
    this._column.add(this._headerLabel);
    this._column.add(new Divider());
    this._column.add(this._buttonRow);
    this._column.add(new Divider());
    this._column.add(this._modelList);

    this.add(this._column);
  }

  measure(parentSize?: Size): Size {
    return parentSize ? { width: parentSize.width, height: parentSize.height } : super.measure(parentSize);
  }

  onAttach(): void {
    if (!this._ctx || this._attached) return;
    this._attached = true;

    this._browseBtn.setAction(() => {
      this._ctx?.showMessage("Browse HF coming soon");
    });

    this._removeBtn.setAction(() => {
      this.removeSelected();
    });

    this.refreshModels();
  }

  onDetach(): void {
    this._attached = false;
    this._ctx = null;
  }

  onFocus(): void {
    super.onFocus();
    if (this._modelList.items.length > 0) {
      focusManager.setFocus(this._modelList);
    } else {
      focusManager.setFocus(this._browseBtn);
    }
  }

  refreshModels(): void {
    const config = this._ctx?.getConfig();
    if (!config) return;

    (async () => {
      const [models, totalSize] = await Promise.all([
        listLocalModels(config),
        getTotalModelsSize(config),
      ]);

      const items: ListItem<string>[] = models.map(m => ({
        id: m.path,
        label: `${m.repoId}/${m.filename}`,
        data: m,
      }));

      this._modelList.updateItems(items);
      this._headerLabel.text = `Models: ${models.length}  Size: ${formatSize(totalSize)}`;
      if (models.length > 0) {
        focusManager.setFocus(this._modelList);
      }
      this.markDirty();
    })();
  }

  selectModel(model: LocalModel): void {
    const config = this._ctx?.getConfig();
    if (!config) return;

    (async () => {
      const updated = await setActiveModel(config, model.repoId, model.filename);
      const profile = updated.server.profiles[updated.server.activeProfile];
      if (profile && profile.presets.model) {
        profile.presets.model.model = model.path;
      }
      await saveConfig(updated);
      this._ctx?.showMessage(`Selected ${model.filename}`);
      this.refreshModels();
    })();
  }

  removeSelected(): void {
    const selected = this._modelList.getSelectedItem();
    if (!selected) return;

    const config = this._ctx?.getConfig();
    if (!config) return;

    (async () => {
      const model = (selected as any).data as LocalModel;
      const updated = await deleteModel(config, model.path);
      await saveConfig(updated);
      this._ctx?.showMessage(`Removed ${model.filename}`);
      this.refreshModels();
    })();
  }

  override markDirty(): void {
    super.markDirty();
    this._ctx?.scheduleRender();
  }
}

export function createModelsTab(ctx: TabContext): Control {
  return new ModelsControl(ctx);
}
