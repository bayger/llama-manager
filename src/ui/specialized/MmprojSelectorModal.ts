import { SelectorModal, SelectorItem } from "../../framework/widgets/SelectorModal";
import { listLocalModels, isMmprojFile } from "../../lib/models";
import { getModelsDir } from "../../lib/config";
import type { ConfigData } from "../../lib/config";
import path from "path";
import fs from "fs-extra";

export class MmprojSelectorModal extends SelectorModal {
  protected _config: ConfigData;

  constructor(config: ConfigData) {
    super();
    this._config = config;
  }

  async scanMmprojs(): Promise<SelectorItem[]> {
    const models = await listLocalModels(this._config);
    const mmprojs = models.filter(m => m.isMmproj);

    const modelsDir = getModelsDir(this._config);
    if (await fs.pathExists(modelsDir)) {
      await this.scanDirForMmprojs(modelsDir, modelsDir, [], mmprojs);
    }

    const seen = new Set<string>();
    const unique: SelectorItem[] = [];
    for (const m of mmprojs) {
      if (!seen.has(m.path)) {
        seen.add(m.path);
        unique.push({
          id: m.path,
          label: m.filename,
          sublabel: m.repoId || path.dirname(m.path),
        });
      }
    }
    return unique.sort((a, b) => a.label.localeCompare(b.label));
  }

  async scanDirForMmprojs(
    baseDir: string,
    currentDir: string,
    _repoParts: string[],
    results: import("../../lib/models").LocalModel[],
  ): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await this.scanDirForMmprojs(baseDir, fullPath, [..._repoParts, entry.name], results);
      } else if (entry.isFile() && entry.name.endsWith(".gguf") && isMmprojFile(entry.name)) {
        const stat = await fs.stat(fullPath).catch(() => null);
        if (stat) {
          const existing = results.find(m => m.path === fullPath);
          if (!existing) {
            results.push({
              repoId: "",
              filename: entry.name,
              path: fullPath,
              sizeBytes: stat.size,
              downloadedAt: stat.mtime.toISOString(),
              active: false,
              isMmproj: true,
            });
          }
        }
      }
    }
  }
}

export function createMmprojSelectorModal(config: ConfigData): MmprojSelectorModal {
  return new MmprojSelectorModal(config);
}