/**
 * Background task tool — spawn tasks on sub-agents.
 *
 * Only the main agent can spawn tasks. Sub-agents spawned by tasks
 * don't get the spawnTask function, so calling this tool from a
 * sub-agent returns an error.
 */

import type { Tool, ToolContext, ValidationResult, SafetyLevel } from "../types.js";

export const taskTool: Tool = {
  definition: {
    name: "spawn_task",
    description:
      "Spawn a background task on a sub-agent, check task status, or list tasks. " +
      "Use 'spawn' to start a task that runs independently while you continue chatting. " +
      "Use 'status' to check a specific task. Use 'list' to see all tasks.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Action: 'spawn' to start a task, 'status' to check one, 'list' to see all",
        },
        agentId: {
          type: "string",
          description: "Agent ID to run the task (required for spawn). Use 'default' for the default agent.",
        },
        prompt: {
          type: "string",
          description: "The instruction for the sub-agent (required for spawn)",
        },
        label: {
          type: "string",
          description: "Human-readable task name (optional for spawn)",
        },
        taskId: {
          type: "string",
          description: "Task ID to check (required for status)",
        },
        timeoutMs: {
          type: "number",
          description: "Timeout in ms (optional, default 300000 = 5 minutes)",
        },
      },
      required: ["action"],
    },
  },

  safetyLevel: ((args: Record<string, unknown>): SafetyLevel => {
    return args.action === "spawn" ? "medium" : "low";
  }) as SafetyLevel | ((args: Record<string, unknown>) => SafetyLevel),

  readOnly: false,

  validate(args: Record<string, unknown>, _ctx: ToolContext): ValidationResult {
    const action = args.action as string;
    if (!["spawn", "status", "list"].includes(action)) {
      return { ok: false, error: "action must be 'spawn', 'status', or 'list'" };
    }
    if (action === "spawn") {
      if (!args.agentId || typeof args.agentId !== "string") {
        return { ok: false, error: "agentId is required for spawn" };
      }
      if (!args.prompt || typeof args.prompt !== "string") {
        return { ok: false, error: "prompt is required for spawn" };
      }
    }
    if (action === "status" && (!args.taskId || typeof args.taskId !== "string")) {
      return { ok: false, error: "taskId is required for status" };
    }
    return { ok: true };
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    const action = args.action as string;

    switch (action) {
      case "spawn": {
        if (!ctx.spawnTask) {
          return "Error: spawn_task is only available to the main agent. Sub-agents cannot spawn tasks.";
        }

        const agentId = args.agentId as string;
        const prompt = args.prompt as string;
        const label = (args.label as string) || prompt.slice(0, 60);
        const timeoutMs = (args.timeoutMs as number) || 300_000;

        try {
          const taskId = await ctx.spawnTask({ agentId, prompt, label, timeoutMs });
          return `Task spawned successfully.\nTask ID: ${taskId}\nAgent: ${agentId}\nLabel: ${label}\nTimeout: ${Math.round(timeoutMs / 1000)}s\n\nThe task is running in the background. Results will be delivered when the task completes.`;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Error spawning task: ${msg}`;
        }
      }

      case "status": {
        if (!ctx.taskRegistry) return "Error: Task registry not available.";
        const task = ctx.taskRegistry.get(args.taskId as string);
        if (!task) return `No task found with ID: ${args.taskId}`;

        const elapsed = Math.round((Date.now() - task.startedAt) / 1000);
        const lines = [
          `Task: ${task.label}`,
          `ID: ${task.id}`,
          `Agent: ${task.agentId}`,
          `Model: ${task.model}`,
          `Status: ${task.status}`,
          `Elapsed: ${elapsed}s`,
        ];
        if (task.result) lines.push(`Result: ${task.result.slice(0, 500)}`);
        if (task.error) lines.push(`Error: ${task.error}`);
        return lines.join("\n");
      }

      case "list": {
        if (!ctx.taskRegistry) return "Error: Task registry not available.";
        const tasks = ctx.taskRegistry.list();
        if (tasks.length === 0) return "No background tasks.";

        return tasks.map((t) => {
          const elapsed = Math.round(((t.completedAt || Date.now()) - t.startedAt) / 1000);
          return `• [${t.status}] ${t.label} (agent: ${t.agentId}, ${elapsed}s)`;
        }).join("\n");
      }

      default:
        return `Unknown action: ${action}`;
    }
  },

  formatConfirmation(args: Record<string, unknown>): string {
    return `Spawn background task on agent "${args.agentId}": ${(args.prompt as string)?.slice(0, 80)}`;
  },
};
