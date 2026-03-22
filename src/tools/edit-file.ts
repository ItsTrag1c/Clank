import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { guardPath } from "./path-guard.js";
import type { Tool, ToolContext, ValidationResult } from "./types.js";

export const editFileTool: Tool = {
  definition: {
    name: "edit_file",
    description:
      "Edit a file by replacing an exact string match with new content. " +
      "The old_string must match exactly (including whitespace). " +
      "Use replace_all to replace every occurrence.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path" },
        old_string: { type: "string", description: "Exact string to find and replace" },
        new_string: { type: "string", description: "Replacement string" },
        replace_all: { type: "boolean", description: "Replace all occurrences (default: false)" },
      },
      required: ["path", "old_string", "new_string"],
    },
  },

  safetyLevel(args: Record<string, unknown>) {
    const p = String(args.path || "");
    if (isAbsolute(p) && !p.startsWith(process.cwd())) return "high";
    return "medium";
  },

  readOnly: false,

  validate(args: Record<string, unknown>, _ctx: ToolContext): ValidationResult {
    if (!args.path || typeof args.path !== "string") return { ok: false, error: "path is required" };
    if (typeof args.old_string !== "string") return { ok: false, error: "old_string is required" };
    if (typeof args.new_string !== "string") return { ok: false, error: "new_string is required" };
    if (args.old_string === args.new_string) return { ok: false, error: "old_string and new_string are the same" };
    return { ok: true };
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    const guard = guardPath(args.path as string, ctx.projectRoot, { allowExternal: ctx.allowExternal });
    if (!guard.ok) return guard.error;
    const filePath = guard.path;

    try {
      const content = await readFile(filePath, "utf-8");
      const oldStr = args.old_string as string;
      const newStr = args.new_string as string;
      const replaceAll = Boolean(args.replace_all);

      if (!content.includes(oldStr)) {
        return `Error: old_string not found in ${filePath}. Make sure it matches exactly including whitespace.`;
      }

      if (!replaceAll) {
        // Check uniqueness — if old_string appears more than once, reject
        const count = content.split(oldStr).length - 1;
        if (count > 1) {
          return `Error: old_string appears ${count} times in ${filePath}. Use replace_all: true or provide more context to make it unique.`;
        }
      }

      const updated = replaceAll
        ? content.split(oldStr).join(newStr)
        : content.replace(oldStr, newStr);

      await writeFile(filePath, updated, "utf-8");

      const replacements = replaceAll ? content.split(oldStr).length - 1 : 1;
      return `Edited ${filePath} (${replacements} replacement${replacements > 1 ? "s" : ""})`;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Error editing file: ${msg}`;
    }
  },

  formatConfirmation(args: Record<string, unknown>): string {
    return `Edit ${args.path}`;
  },
};
