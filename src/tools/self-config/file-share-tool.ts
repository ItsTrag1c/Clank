/**
 * File share tool — send files to channels.
 *
 * "Send me that config file on Telegram" → agent reads the file
 * and queues it for delivery through the channel adapter.
 *
 * Security: only files within the workspace can be shared.
 */

import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { guardPath } from "../path-guard.js";
import type { Tool, ToolContext, ValidationResult } from "../types.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const fileShareTool: Tool = {
  definition: {
    name: "share_file",
    description:
      "Share a file from the workspace with the user via the current channel (Telegram, Discord, etc.). " +
      "The file must be within the workspace. Max 10MB.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file to share" },
        caption: { type: "string", description: "Optional message to send with the file" },
      },
      required: ["path"],
    },
  },

  safetyLevel: "medium",
  readOnly: true,

  validate(args: Record<string, unknown>, ctx: ToolContext): ValidationResult {
    if (!args.path || typeof args.path !== "string") return { ok: false, error: "path is required" };
    const guard = guardPath(args.path as string, ctx.projectRoot);
    if (!guard.ok) return { ok: false, error: guard.error };
    return { ok: true };
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    const guard = guardPath(args.path as string, ctx.projectRoot, { allowExternal: ctx.allowExternal });
    if (!guard.ok) return guard.error;

    if (!existsSync(guard.path)) return `Error: File not found: ${guard.path}`;

    const fileStats = await stat(guard.path);
    if (fileStats.size > MAX_FILE_SIZE) return `Error: File too large (${Math.round(fileStats.size / 1024 / 1024)}MB, max 10MB)`;

    // Return the file path — the channel adapter will handle delivery
    const caption = args.caption ? ` with caption: "${args.caption}"` : "";
    return `File ready to share: ${guard.path} (${Math.round(fileStats.size / 1024)}KB)${caption}. The file will be sent through the current channel.`;
  },

  formatConfirmation(args: Record<string, unknown>): string {
    return `Share file: ${args.path}`;
  },
};
