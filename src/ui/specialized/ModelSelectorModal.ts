import { SelectorModal, SelectorItem } from "../../framework/widgets/SelectorModal";
import { listLocalModels } from "../../lib/models";
import type { ConfigData } from "../../lib/config";

export class ModelSelectorModal extends SelectorModal {
  protected _config: ConfigData;

  constructor(config: ConfigData) {
    super();
    this._config = config;
  }

  async scanModels(): Promise<SelectorItem[]> {
    const models = await listLocalModels(this._config);
    return models
      .filter(m => !m.isMmproj)
      .map(m => ({ id: m.path, label: m.path }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  onLayout(): void {
    super.onLayout();
    this._list.truncate = "head";
  }
}

export function createModelSelectorModal(config: ConfigData): ModelSelectorModal {
  return new ModelSelectorModal(config);
}
