import { readdir, stat } from "node:fs/promises";
import { resolve, isAbsolute, join } from "node:path";
import type { Tool, ToolContext, ValidationResult } from "./types.js";

export const listDirectoryTool: Tool = {
  definition: {
    name: "list_directory",
    description: "List files and directories in a path. Shows names, sizes, and types.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path (default: workspace root)" },
      },
    },
  },

  safetyLevel: "low",
  readOnly: true,

  validate(_args: Record<string, unknown>, _ctx: ToolContext): ValidationResult {
    return { ok: true };
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    const dirPath = args.path
      ? isAbsolute(args.path as string)
        ? (args.path as string)
        : resolve(ctx.projectRoot, args.path as string)
      : ctx.projectRoot;

    try {
      const entries = await readdir(dirPath);
      if (entries.length === 0) return `(empty directory: ${dirPath})`;

      const lines: string[] = [];
      for (const entry of entries.slice(0, 100)) {
        try {
          const full = join(dirPath, entry);
          const s = await stat(full);
          const type = s.isDirectory() ? "dir" : "file";
          const size = s.isDirectory() ? "" : ` (${formatSize(s.size)})`;
          lines.push(`${type}\t${entry}${size}`);
        } catch {
          lines.push(`?\t${entry}`);
        }
      }

      if (entries.length > 100) {
        lines.push(`... and ${entries.length - 100} more entries`);
      }

      return lines.join("\n");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Error listing directory: ${msg}`;
    }
  },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
