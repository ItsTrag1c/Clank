import { writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname, isAbsolute } from "node:path";
import type { Tool, ToolContext, ValidationResult } from "./types.js";

export const writeFileTool: Tool = {
  definition: {
    name: "write_file",
    description:
      "Write content to a file. Creates the file if it doesn't exist, " +
      "overwrites if it does. Automatically creates parent directories.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path (absolute or relative to workspace)" },
        content: { type: "string", description: "Content to write to the file" },
      },
      required: ["path", "content"],
    },
  },

  safetyLevel(args: Record<string, unknown>) {
    const p = String(args.path || "");
    // External paths or overwriting existing files are higher risk
    if (isAbsolute(p) && !p.startsWith(process.cwd())) return "high";
    return "medium";
  },

  readOnly: false,

  validate(args: Record<string, unknown>, _ctx: ToolContext): ValidationResult {
    if (!args.path || typeof args.path !== "string") {
      return { ok: false, error: "path is required" };
    }
    if (typeof args.content !== "string") {
      return { ok: false, error: "content is required" };
    }
    return { ok: true };
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    const filePath = isAbsolute(args.path as string)
      ? (args.path as string)
      : resolve(ctx.projectRoot, args.path as string);

    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, args.content as string, "utf-8");

      const lines = (args.content as string).split("\n").length;
      return `Wrote ${lines} lines to ${filePath}`;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Error writing file: ${msg}`;
    }
  },

  formatConfirmation(args: Record<string, unknown>): string {
    return `Write to ${args.path}`;
  },
};
