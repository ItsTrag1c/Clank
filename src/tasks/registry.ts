/**
 * Task registry — tracks background tasks spawned by the main agent.
 *
 * In-memory only (no persistence). Tasks are ephemeral — they exist
 * within a gateway session lifetime. A cleanup interval purges
 * completed tasks older than 30 minutes to prevent memory leaks.
 */

import { randomUUID } from "node:crypto";

export interface TaskEntry {
  id: string;
  label: string;
  agentId: string;
  model: string;
  status: "running" | "completed" | "failed" | "timeout";
  prompt: string;
  result?: string;
  error?: string;
  startedAt: number;
  completedAt?: number;
  timeoutMs: number;
  /** Session key of the agent that spawned this task */
  spawnedBy: string;
  /** Whether results have been delivered to the spawning agent */
  delivered: boolean;
}

export interface CreateTaskOpts {
  agentId: string;
  model: string;
  prompt: string;
  label: string;
  timeoutMs: number;
  spawnedBy: string;
}

export class TaskRegistry {
  private tasks = new Map<string, TaskEntry>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  /** Start the cleanup interval */
  start(): void {
    // Purge completed tasks older than 30 minutes every 10 minutes
    this.cleanupTimer = setInterval(() => this.cleanup(30 * 60_000), 10 * 60_000);
  }

  /** Stop the cleanup interval */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /** Create a new running task */
  create(opts: CreateTaskOpts): TaskEntry {
    const entry: TaskEntry = {
      id: randomUUID(),
      label: opts.label,
      agentId: opts.agentId,
      model: opts.model,
      status: "running",
      prompt: opts.prompt,
      startedAt: Date.now(),
      timeoutMs: opts.timeoutMs,
      spawnedBy: opts.spawnedBy,
      delivered: false,
    };
    this.tasks.set(entry.id, entry);
    return entry;
  }

  /** Update a task's fields */
  update(id: string, patch: Partial<Pick<TaskEntry, "status" | "result" | "error" | "completedAt">>): void {
    const task = this.tasks.get(id);
    if (task) {
      Object.assign(task, patch);
    }
  }

  /** Get a specific task */
  get(id: string): TaskEntry | undefined {
    return this.tasks.get(id);
  }

  /** List all tasks, optionally filtered by status */
  list(filter?: { status?: TaskEntry["status"]; spawnedBy?: string }): TaskEntry[] {
    let results = Array.from(this.tasks.values());
    if (filter?.status) {
      results = results.filter((t) => t.status === filter.status);
    }
    if (filter?.spawnedBy) {
      results = results.filter((t) => t.spawnedBy === filter.spawnedBy);
    }
    return results.sort((a, b) => b.startedAt - a.startedAt);
  }

  /**
   * Get completed tasks for a session that haven't been delivered yet.
   * Marks them as delivered so they aren't injected twice.
   */
  consumeCompleted(spawnedBy: string): TaskEntry[] {
    const ready: TaskEntry[] = [];
    for (const task of this.tasks.values()) {
      if (task.spawnedBy === spawnedBy && task.status !== "running" && !task.delivered) {
        task.delivered = true;
        ready.push(task);
      }
    }
    return ready;
  }

  /** Remove completed tasks older than maxAgeMs */
  cleanup(maxAgeMs: number): void {
    const now = Date.now();
    for (const [id, task] of this.tasks) {
      if (task.status !== "running" && task.completedAt && now - task.completedAt > maxAgeMs) {
        this.tasks.delete(id);
      }
    }
  }

  /** Cancel all running tasks */
  cancelAll(): void {
    for (const task of this.tasks.values()) {
      if (task.status === "running") {
        task.status = "timeout";
        task.completedAt = Date.now();
        task.error = "Gateway shutting down";
      }
    }
  }
}
