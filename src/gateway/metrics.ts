/**
 * In-memory metrics collector for the gateway.
 *
 * Tracks request counts, latency, token usage, task stats, and errors.
 * No external dependencies — everything lives in memory and resets on restart.
 * Exposed via the metrics.get RPC method and GET /metrics HTTP endpoint.
 */

/** Rolling window size for latency samples */
const MAX_LATENCY_SAMPLES = 100;

/** Max recent errors to keep */
const MAX_RECENT_ERRORS = 20;

/** Max recent requests to keep for per-hour counting */
const MAX_RECENT_REQUESTS = 1000;

export interface MetricsSnapshot {
  requests: {
    total: number;
    lastHour: number;
    byAgent: Record<string, number>;
  };
  latency: {
    samples: number;
    p50: number;
    p95: number;
    avg: number;
  };
  tokens: {
    promptTotal: number;
    outputTotal: number;
  };
  tasks: {
    spawned: number;
    completed: number;
    failed: number;
    timedOut: number;
    active: number;
  };
  errors: {
    total: number;
    recent: Array<{ time: number; message: string }>;
  };
  uptime: number;
  connectedClients: number;
}

export class MetricsCollector {
  private startTime = Date.now();

  // Request tracking
  private requestTotal = 0;
  private requestTimestamps: number[] = [];
  private requestsByAgent: Record<string, number> = {};

  // Latency tracking (rolling window of last N request durations in ms)
  private latencySamples: number[] = [];

  // Token tracking
  private promptTokensTotal = 0;
  private outputTokensTotal = 0;

  // Task tracking
  private tasksSpawned = 0;
  private tasksCompleted = 0;
  private tasksFailed = 0;
  private tasksTimedOut = 0;
  private tasksActive = 0;

  // Error tracking
  private errorTotal = 0;
  private recentErrors: Array<{ time: number; message: string }> = [];

  // Connected clients
  private clientCount = 0;

  /** Record a completed request */
  recordRequest(agentId: string, durationMs: number): void {
    this.requestTotal++;
    this.requestTimestamps.push(Date.now());

    // Trim old timestamps (keep last N for hourly counting)
    if (this.requestTimestamps.length > MAX_RECENT_REQUESTS) {
      this.requestTimestamps = this.requestTimestamps.slice(-MAX_RECENT_REQUESTS);
    }

    this.requestsByAgent[agentId] = (this.requestsByAgent[agentId] || 0) + 1;

    // Record latency
    this.latencySamples.push(durationMs);
    if (this.latencySamples.length > MAX_LATENCY_SAMPLES) {
      this.latencySamples.shift();
    }
  }

  /** Record token usage from a provider response */
  recordTokens(promptTokens: number, outputTokens: number): void {
    this.promptTokensTotal += promptTokens;
    this.outputTokensTotal += outputTokens;
  }

  /** Record a task lifecycle event */
  recordTaskSpawned(): void { this.tasksSpawned++; this.tasksActive++; }
  recordTaskCompleted(): void { this.tasksCompleted++; this.tasksActive = Math.max(0, this.tasksActive - 1); }
  recordTaskFailed(): void { this.tasksFailed++; this.tasksActive = Math.max(0, this.tasksActive - 1); }
  recordTaskTimedOut(): void { this.tasksTimedOut++; this.tasksActive = Math.max(0, this.tasksActive - 1); }

  /** Record an error */
  recordError(message: string): void {
    this.errorTotal++;
    this.recentErrors.push({ time: Date.now(), message });
    if (this.recentErrors.length > MAX_RECENT_ERRORS) {
      this.recentErrors.shift();
    }
  }

  /** Update connected client count */
  setClientCount(count: number): void { this.clientCount = count; }

  /** Get a snapshot of all metrics */
  snapshot(): MetricsSnapshot {
    const now = Date.now();
    const oneHourAgo = now - 3600_000;
    const lastHour = this.requestTimestamps.filter((t) => t > oneHourAgo).length;

    // Calculate latency percentiles
    const sorted = [...this.latencySamples].sort((a, b) => a - b);
    const len = sorted.length;

    return {
      requests: {
        total: this.requestTotal,
        lastHour,
        byAgent: { ...this.requestsByAgent },
      },
      latency: {
        samples: len,
        p50: len > 0 ? sorted[Math.floor(len * 0.5)] : 0,
        p95: len > 0 ? sorted[Math.floor(len * 0.95)] : 0,
        avg: len > 0 ? Math.round(sorted.reduce((a, b) => a + b, 0) / len) : 0,
      },
      tokens: {
        promptTotal: this.promptTokensTotal,
        outputTotal: this.outputTokensTotal,
      },
      tasks: {
        spawned: this.tasksSpawned,
        completed: this.tasksCompleted,
        failed: this.tasksFailed,
        timedOut: this.tasksTimedOut,
        active: this.tasksActive,
      },
      errors: {
        total: this.errorTotal,
        recent: [...this.recentErrors].reverse().slice(0, 5),
      },
      uptime: Math.round((now - this.startTime) / 1000),
      connectedClients: this.clientCount,
    };
  }

  /** Check for active alerts based on current metrics */
  alerts(): Array<{ level: "warning" | "critical"; message: string }> {
    const snap = this.snapshot();
    const alerts: Array<{ level: "warning" | "critical"; message: string }> = [];

    // High latency
    if (snap.latency.avg > 30_000) {
      alerts.push({ level: "warning", message: `High average latency: ${Math.round(snap.latency.avg / 1000)}s` });
    }
    if (snap.latency.p95 > 60_000) {
      alerts.push({ level: "critical", message: `P95 latency over 60s: ${Math.round(snap.latency.p95 / 1000)}s` });
    }

    // Task failure rate
    const totalTasks = snap.tasks.completed + snap.tasks.failed + snap.tasks.timedOut;
    if (totalTasks >= 5) {
      const failRate = (snap.tasks.failed + snap.tasks.timedOut) / totalTasks;
      if (failRate > 0.5) {
        alerts.push({ level: "critical", message: `Task failure rate: ${Math.round(failRate * 100)}%` });
      }
    }

    // Memory usage
    const mem = process.memoryUsage();
    const heapPercent = mem.heapUsed / mem.heapTotal;
    if (heapPercent > 0.8) {
      alerts.push({ level: "warning", message: `Heap usage: ${Math.round(heapPercent * 100)}%` });
    }

    // Error rate (more than 10 errors in last 5 minutes)
    const fiveMinAgo = Date.now() - 300_000;
    const recentCount = this.recentErrors.filter((e) => e.time > fiveMinAgo).length;
    if (recentCount > 10) {
      alerts.push({ level: "warning", message: `${recentCount} errors in last 5 minutes` });
    }

    return alerts;
  }
}
