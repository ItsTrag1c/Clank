import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { guardPath } from "./path-guard.js";
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
    let dirPath = ctx.projectRoot;
    if (args.path) {
      const guard = guardPath(args.path as string, ctx.projectRoot, { allowExternal: ctx.allowExternal });
      if (!guard.ok) return guard.error;
      dirPath = guard.path;
    }

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
