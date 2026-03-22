import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { guardPath } from "./path-guard.js";
import type { Tool, ToolContext, ValidationResult } from "./types.js";

const IGNORE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "__pycache__",
  ".cache", "coverage", ".venv", "venv", "target",
]);

export const globFilesTool: Tool = {
  definition: {
    name: "glob_files",
    description:
      "Find files matching a glob pattern. Supports **, *, and ? wildcards. " +
      "Returns matching file paths sorted by modification time (newest first). Max 200 results.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern, e.g. '**/*.ts' or 'src/**/*.js'" },
        path: { type: "string", description: "Base directory (default: workspace root)" },
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
    return { ok: true };
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    let basePath = ctx.projectRoot;
    if (args.path) {
      const guard = guardPath(args.path as string, ctx.projectRoot, { allowExternal: ctx.allowExternal });
      if (!guard.ok) return guard.error;
      basePath = guard.path;
    }

    const pattern = args.pattern as string;
    const regex = globToRegex(pattern);
    const matches: Array<{ path: string; mtime: number }> = [];

    async function scanDir(dir: string, relDir: string): Promise<void> {
      if (matches.length >= 200) return;

      let entries: string[];
      try {
        entries = await readdir(dir);
      } catch {
        return;
      }

      for (const entry of entries) {
        if (matches.length >= 200) return;
        if (IGNORE_DIRS.has(entry)) continue;

        const full = join(dir, entry);
        const rel = relDir ? `${relDir}/${entry}` : entry;

        let s;
        try {
          s = await stat(full);
        } catch {
          continue;
        }

        if (s.isDirectory()) {
          await scanDir(full, rel);
        } else if (s.isFile() && regex.test(rel)) {
          matches.push({ path: rel, mtime: s.mtimeMs });
        }
      }
    }

    await scanDir(basePath, "");

    if (matches.length === 0) return `No files matching: ${pattern}`;

    // Sort by mtime descending (newest first)
    matches.sort((a, b) => b.mtime - a.mtime);

    return matches.map((m) => m.path).join("\n");
  },
};

/** Convert a simple glob pattern to a regex */
function globToRegex(pattern: string): RegExp {
  let regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special regex chars
    .replace(/\*\*/g, "{{GLOBSTAR}}")       // Temp placeholder
    .replace(/\*/g, "[^/]*")               // * matches within directory
    .replace(/\?/g, "[^/]")               // ? matches single char
    .replace(/\{\{GLOBSTAR\}\}/g, ".*");   // ** matches across directories

  return new RegExp(`^${regex}$`, "i");
}
