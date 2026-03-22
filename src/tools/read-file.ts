import { readFile, stat } from "node:fs/promises";
import type { Tool, ToolContext, ValidationResult } from "./types.js";
import { guardPath } from "./path-guard.js";

export const readFileTool: Tool = {
  definition: {
    name: "read_file",
    description:
      "Read the contents of a file. Returns the file content with line numbers. " +
      "Supports text files, detects binary files. Use offset and limit for large files.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path (absolute or relative to workspace)" },
        offset: { type: "number", description: "Start reading from this line number (1-based)" },
        limit: { type: "number", description: "Maximum number of lines to read" },
      },
      required: ["path"],
    },
  },

  safetyLevel: "low",
  readOnly: true,

  validate(args: Record<string, unknown>, _ctx: ToolContext): ValidationResult {
    if (!args.path || typeof args.path !== "string") {
      return { ok: false, error: "path is required and must be a string" };
    }
    return { ok: true };
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    const guard = guardPath(args.path as string, ctx.projectRoot, { allowExternal: ctx.allowExternal });
    if (!guard.ok) return guard.error;
    const filePath = guard.path;

    try {
      const fileStats = await stat(filePath);
      if (fileStats.isDirectory()) {
        return `Error: ${filePath} is a directory, not a file. Use list_directory instead.`;
      }

      // Binary detection: check first 8KB for null bytes
      const probe = Buffer.alloc(8192);
      const { createReadStream } = await import("node:fs");
      const stream = createReadStream(filePath, { start: 0, end: 8191 });
      let probeLen = 0;
      for await (const chunk of stream) {
        (chunk as Buffer).copy(probe, probeLen);
        probeLen += (chunk as Buffer).length;
      }
      if (probe.subarray(0, probeLen).includes(0)) {
        return `Binary file detected: ${filePath} (${fileStats.size} bytes)`;
      }

      const content = await readFile(filePath, "utf-8");
      const lines = content.split("\n");

      const offset = Math.max(1, Number(args.offset) || 1);
      const limit = Number(args.limit) || lines.length;

      const sliced = lines.slice(offset - 1, offset - 1 + limit);
      const numbered = sliced.map((line, i) => `${offset + i}\t${line}`).join("\n");

      return numbered || "(empty file)";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Error reading file: ${msg}`;
    }
  },
};
