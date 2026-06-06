import fs from "fs-extra";
import path from "path";
import { ConfigData, getTasksFile, getLogFile } from "./config.js";
import { TaskMetrics, logParser } from "./logparser.js";
export type { TaskMetrics } from "./logparser.js";
import { EventEmitter } from "events";

export interface TaskFilter {
  slotId?: number;
  dateFrom?: Date;
  dateTo?: Date;
  minOutputTokens?: number;
  maxOutputTokens?: number;
  minSpeed?: number;
  maxSpeed?: number;
  taskId?: number;
}

export type TaskSortField = "taskId" | "timestamp" | "outputSpeed" | "totalTimeMs" | "outputTokens";
export type TaskSortDir = "asc" | "desc";

class TaskStore extends EventEmitter {
  private tasks: TaskMetrics[] = [];
  private config: ConfigData | null = null;
  private stopTailer: (() => void) | null = null;

  async init(config: ConfigData) {
    this.config = config;
    const filePath = getTasksFile(config);

    if (await fs.pathExists(filePath)) {
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      this.tasks = lines.map((line) => JSON.parse(line) as TaskMetrics);
    }

    logParser.seedCompleted(this.tasks.map((t) => t.taskId));

    const logFile = getLogFile(config);
    await logParser.parseExistingFile(logFile);

    this.stopTailer = logParser.startFileTailer(logFile);
  }

  async onTask(task: TaskMetrics) {
    this.tasks.unshift(task);
    if (this.config && this.tasks.length > this.config.tasks.maxStored) {
      this.tasks = this.tasks.slice(0, this.config.tasks.maxStored);
    }
    await this.persist();
    this.emit("updated");
  }

  async persist() {
    if (!this.config) return;
    const filePath = getTasksFile(this.config);
    await fs.ensureDir(path.dirname(filePath));
    const content = this.tasks.map((t) => JSON.stringify(t)).join("\n") + "\n";
    await fs.writeFile(filePath, content);
  }

  getTasks(): TaskMetrics[] {
    return [...this.tasks];
  }

  getFiltered(filter?: TaskFilter): TaskMetrics[] {
    let result = [...this.tasks];

    if (filter?.slotId !== undefined) result = result.filter((t) => t.slotId === filter.slotId);
    if (filter?.dateFrom) result = result.filter((t) => new Date(t.timestamp) >= filter.dateFrom!);
    if (filter?.dateTo) result = result.filter((t) => new Date(t.timestamp) <= filter.dateTo!);
    if (filter?.minOutputTokens !== undefined)
      result = result.filter((t) => t.outputTokens >= filter.minOutputTokens!);
    if (filter?.maxOutputTokens !== undefined)
      result = result.filter((t) => t.outputTokens <= filter.maxOutputTokens!);
    if (filter?.minSpeed !== undefined)
      result = result.filter((t) => t.outputSpeed >= filter.minSpeed!);
    if (filter?.maxSpeed !== undefined)
      result = result.filter((t) => t.outputSpeed <= filter.maxSpeed!);
    if (filter?.taskId !== undefined) result = result.filter((t) => t.taskId === filter.taskId);

    return result;
  }

  getSorted(
    tasks: TaskMetrics[],
    field: TaskSortField = "taskId",
    dir: TaskSortDir = "desc",
  ): TaskMetrics[] {
    const multiplier = dir === "asc" ? 1 : -1;
    return [...tasks].sort((a, b) => {
      const diff = (a[field] as number) - (b[field] as number);
      return diff * multiplier;
    });
  }

  getStats(tasks: TaskMetrics[]) {
    if (tasks.length === 0)
      return { avgPromptSpeed: 0, avgOutputSpeed: 0, totalTokens: 0, avgDraftAcceptance: 0, count: 0 };

    const sum = tasks.reduce(
      (acc, t) => ({
        promptSpeed: acc.promptSpeed + t.promptSpeed,
        outputSpeed: acc.outputSpeed + t.outputSpeed,
        totalTokens: acc.totalTokens + t.totalTokens,
        draftAcceptance: acc.draftAcceptance + (t.draftAcceptance || 0),
      }),
      { promptSpeed: 0, outputSpeed: 0, totalTokens: 0, draftAcceptance: 0 },
    );

    return {
      avgPromptSpeed: sum.promptSpeed / tasks.length,
      avgOutputSpeed: sum.outputSpeed / tasks.length,
      totalTokens: sum.totalTokens,
      avgDraftAcceptance: sum.draftAcceptance / tasks.length,
      count: tasks.length,
    };
  }

  dispose() {
    if (this.stopTailer) this.stopTailer();
    logParser.stop();
  }
}

export const taskStore = new TaskStore();

logParser.on("task", async (task: TaskMetrics) => {
  await taskStore.onTask(task);
});
