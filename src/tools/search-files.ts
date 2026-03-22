import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, isAbsolute, join, relative } from "node:path";
import type { Tool, ToolContext, ValidationResult } from "./types.js";

/** Directories to skip during search */
const IGNORE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "__pycache__",
  ".cache", "coverage", ".venv", "venv", "target",
]);

export const searchFilesTool: Tool = {
  definition: {
    name: "search_files",
    description:
      "Search for a regex pattern across files in the workspace. " +
      "Returns matching lines with file paths and line numbers. " +
      "Ignores node_modules, .git, dist, etc.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex pattern to search for" },
        path: { type: "string", description: "Directory to search in (default: workspace root)" },
        glob: { type: "string", description: "File glob filter, e.g. '*.ts' or '*.py'" },
        max_results: { type: "number", description: "Maximum results to return (default: 50)" },
      },
      required: ["pattern"],
    },
  },

  safetyLevel: "low",
  readOnly: true,

  validate(args: Record<string, unknown>, _ctx: ToolContext): ValidationResult {
    if (!args.pattern || typeof args.pattern !== "string") {
      return { ok: false, error: "pattern is required" };
    }
    // Validate regex
    try {
      new RegExp(args.pattern as string);
    } catch {
      return { ok: false, error: "Invalid regex pattern" };
    }
    return { ok: true };
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    const searchPath = args.path
      ? isAbsolute(args.path as string)
        ? (args.path as string)
        : resolve(ctx.projectRoot, args.path as string)
      : ctx.projectRoot;

    const maxResults = Number(args.max_results) || 50;
    const globFilter = args.glob as string | undefined;
    let regex: RegExp;
    try {
      regex = new RegExp(args.pattern as string, "gi");
    } catch {
      return `Error: Invalid regex pattern`;
    }

    const results: string[] = [];

    async function searchDir(dir: string): Promise<void> {
      if (results.length >= maxResults) return;

      let entries: string[];
      try {
        entries = await readdir(dir);
      } catch {
        return;
      }

      for (const entry of entries) {
        if (results.length >= maxResults) return;
        if (IGNORE_DIRS.has(entry)) continue;

        const full = join(dir, entry);
        let s;
        try {
          s = await stat(full);
        } catch {
          continue;
        }

        if (s.isDirectory()) {
          await searchDir(full);
        } else if (s.isFile() && s.size < 1024 * 1024) {
          // Skip files >1MB
          if (globFilter) {
            const ext = globFilter.replace("*", "");
            if (!entry.endsWith(ext)) continue;
          }

          try {
            const content = await readFile(full, "utf-8");
            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
              regex.lastIndex = 0;
              if (regex.test(lines[i])) {
                const rel = relative(ctx.projectRoot, full);
                results.push(`${rel}:${i + 1}\t${lines[i].trim()}`);
                if (results.length >= maxResults) return;
              }
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    }

    await searchDir(searchPath);

    if (results.length === 0) return `No matches found for pattern: ${args.pattern}`;
    return results.join("\n");
  },
};
