import { execFile } from "node:child_process";
import { resolve, isAbsolute } from "node:path";
import type { Tool, ToolContext, ValidationResult } from "./types.js";

/** Git subcommands classified by risk level */
const SAFE_SUBCOMMANDS = new Set([
  "status", "log", "diff", "show", "branch", "tag", "remote",
  "stash", "blame", "shortlog", "describe", "rev-parse",
  "ls-files", "ls-tree", "cat-file",
]);

const DANGEROUS_SUBCOMMANDS = new Set([
  "push", "reset", "rebase", "merge", "cherry-pick",
  "clean", "checkout", "restore",
]);

export const gitTool: Tool = {
  definition: {
    name: "git",
    description:
      "Run a git command. Safe commands (status, log, diff, etc.) are low risk. " +
      "Mutating commands (push, reset, rebase) are high risk and need confirmation.",
    parameters: {
      type: "object",
      properties: {
        args: { type: "string", description: "Git arguments, e.g. 'status' or 'log --oneline -10'" },
        cwd: { type: "string", description: "Repository directory (default: workspace root)" },
      },
      required: ["args"],
    },
  },

  safetyLevel(args: Record<string, unknown>) {
    const gitArgs = String(args.args || "");
    const subcommand = gitArgs.trim().split(/\s+/)[0];
    if (SAFE_SUBCOMMANDS.has(subcommand)) return "low";
    if (DANGEROUS_SUBCOMMANDS.has(subcommand)) return "high";
    return "medium";
  },

  readOnly: false, // depends on subcommand, but conservatively false

  validate(args: Record<string, unknown>, _ctx: ToolContext): ValidationResult {
    if (!args.args || typeof args.args !== "string") {
      return { ok: false, error: "args is required" };
    }
    return { ok: true };
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    const gitArgs = (args.args as string).trim().split(/\s+/);
    const cwd = args.cwd
      ? isAbsolute(args.cwd as string)
        ? (args.cwd as string)
        : resolve(ctx.projectRoot, args.cwd as string)
      : ctx.projectRoot;

    return new Promise<string>((resolvePromise) => {
      execFile(
        "git",
        gitArgs,
        { cwd, timeout: 30_000, maxBuffer: 1024 * 1024 },
        (error, stdout, stderr) => {
          let output = "";
          if (stdout) output += stdout;
          if (stderr) output += (output ? "\n" : "") + stderr;
          if (error && !output) output = `Error: ${error.message}`;

          // Cap output
          if (output.length > 30 * 1024) {
            output = output.slice(0, 30 * 1024) + "\n... (output truncated)";
          }

          resolvePromise(output || "(no output)");
        },
      );
    });
  },

  formatConfirmation(args: Record<string, unknown>): string {
    return `Run: git ${args.args}`;
  },
};
