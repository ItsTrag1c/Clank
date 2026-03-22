/**
 * Web fetch tool — fetch content from a URL.
 */

import type { Tool, ToolContext, ValidationResult } from "./types.js";

const MAX_BODY = 500 * 1024; // 500KB cap

export const webFetchTool: Tool = {
  definition: {
    name: "web_fetch",
    description: "Fetch content from a URL. Returns the response body as text. Max 500KB.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to fetch" },
      },
      required: ["url"],
    },
  },

  safetyLevel: "low",
  readOnly: true,

  validate(args: Record<string, unknown>): ValidationResult {
    if (!args.url || typeof args.url !== "string") {
      return { ok: false, error: "url is required" };
    }
    try {
      new URL(args.url as string);
    } catch {
      return { ok: false, error: "Invalid URL" };
    }
    return { ok: true };
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    const url = args.url as string;

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Clank/0.1.0" },
        signal: ctx.signal || AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        return `HTTP ${res.status}: ${res.statusText}`;
      }

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const json = await res.json();
        const text = JSON.stringify(json, null, 2);
        return text.length > MAX_BODY ? text.slice(0, MAX_BODY) + "\n... (truncated)" : text;
      }

      const text = await res.text();
      return text.length > MAX_BODY ? text.slice(0, MAX_BODY) + "\n... (truncated)" : text;
    } catch (err) {
      return `Fetch error: ${err instanceof Error ? err.message : err}`;
    }
  },
};
