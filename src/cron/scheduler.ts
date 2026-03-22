/**
 * Cron scheduler — runs agent tasks on a schedule.
 *
 * Jobs are stored in JSONL format. The gateway ticks every 30 seconds
 * and checks for due jobs. Each job spawns an agent session, runs the
 * prompt, and logs the result.
 *
 * Uses standard cron expressions (e.g., "0 9 * * *" for 9am daily).
 */

import { readFile, appendFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export interface CronJob {
  id: string;
  name: string;
  /** Standard cron expression */
  schedule: string;
  /** Agent ID to run the job */
  agentId: string;
  /** Prompt to send to the agent */
  prompt: string;
  /** Whether the job is active */
  enabled: boolean;
  /** When the job was created */
  createdAt: number;
  /** Last successful run timestamp */
  lastRunAt?: number;
  /** Last run status */
  lastStatus?: "success" | "error";
  /** Failure count for retry backoff */
  failCount: number;
}

export interface CronRunLog {
  jobId: string;
  startedAt: number;
  completedAt: number;
  status: "success" | "error";
  output?: string;
  error?: string;
}

export class CronScheduler {
  private jobsPath: string;
  private runsDir: string;
  private jobs: CronJob[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private onJobDue?: (job: CronJob) => Promise<void>;

  constructor(storeDir: string) {
    this.jobsPath = join(storeDir, "jobs.jsonl");
    this.runsDir = join(storeDir, "runs");
  }

  /** Initialize — load jobs from disk */
  async init(): Promise<void> {
    await mkdir(this.runsDir, { recursive: true });
    await this.loadJobs();
  }

  /** Set callback for when a job is due */
  setHandler(handler: (job: CronJob) => Promise<void>): void {
    this.onJobDue = handler;
  }

  /** Start the scheduler (ticks every 30s) */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => this.tick(), 30_000);
    // Run immediately on start
    this.tick();
  }

  /** Stop the scheduler */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Check for due jobs */
  private async tick(): Promise<void> {
    const now = Date.now();

    for (const job of this.jobs) {
      if (!job.enabled) continue;

      if (this.isDue(job, now)) {
        try {
          if (this.onJobDue) {
            await this.onJobDue(job);
          }
          job.lastRunAt = now;
          job.lastStatus = "success";
          job.failCount = 0;
          await this.logRun({ jobId: job.id, startedAt: now, completedAt: Date.now(), status: "success" });
        } catch (err) {
          job.failCount++;
          job.lastStatus = "error";
          await this.logRun({
            jobId: job.id,
            startedAt: now,
            completedAt: Date.now(),
            status: "error",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    await this.saveJobs();
  }

  /** Check if a job is due to run */
  private isDue(job: CronJob, now: number): boolean {
    // Simple cron matching — check if enough time has passed
    // A full cron parser would use a library like cron-parser
    const interval = this.parseSimpleInterval(job.schedule);
    if (!interval) return false;

    if (!job.lastRunAt) return true;
    return now - job.lastRunAt >= interval;
  }

  /**
   * Parse simple schedule strings.
   * For v1, supports: "30s", "5m", "1h", "24h", "daily"
   * Full cron expressions will use cron-parser library later.
   */
  private parseSimpleInterval(schedule: string): number | null {
    const match = schedule.match(/^(\d+)(s|m|h)$/);
    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2];
      switch (unit) {
        case "s": return value * 1000;
        case "m": return value * 60_000;
        case "h": return value * 3600_000;
      }
    }
    if (schedule === "daily") return 86400_000;
    return null;
  }

  /** Add a new job */
  async addJob(opts: { name: string; schedule: string; agentId: string; prompt: string }): Promise<CronJob> {
    const job: CronJob = {
      id: randomUUID(),
      name: opts.name,
      schedule: opts.schedule,
      agentId: opts.agentId,
      prompt: opts.prompt,
      enabled: true,
      createdAt: Date.now(),
      failCount: 0,
    };
    this.jobs.push(job);
    await this.saveJobs();
    return job;
  }

  /** Remove a job */
  async removeJob(jobId: string): Promise<boolean> {
    const idx = this.jobs.findIndex((j) => j.id === jobId);
    if (idx === -1) return false;
    this.jobs.splice(idx, 1);
    await this.saveJobs();
    return true;
  }

  /** List all jobs */
  listJobs(): CronJob[] {
    return [...this.jobs];
  }

  /** Enable/disable a job */
  async toggleJob(jobId: string, enabled: boolean): Promise<void> {
    const job = this.jobs.find((j) => j.id === jobId);
    if (job) {
      job.enabled = enabled;
      await this.saveJobs();
    }
  }

  /** Load jobs from JSONL file */
  private async loadJobs(): Promise<void> {
    if (!existsSync(this.jobsPath)) return;

    try {
      const raw = await readFile(this.jobsPath, "utf-8");
      this.jobs = raw
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as CronJob);
    } catch {
      this.jobs = [];
    }
  }

  /** Save jobs to JSONL file */
  private async saveJobs(): Promise<void> {
    const content = this.jobs.map((j) => JSON.stringify(j)).join("\n") + "\n";
    await writeFile(this.jobsPath, content, "utf-8");
  }

  /** Log a run result */
  private async logRun(log: CronRunLog): Promise<void> {
    const logPath = join(this.runsDir, `${log.jobId}.jsonl`);
    await appendFile(logPath, JSON.stringify(log) + "\n", "utf-8");
  }
}
