/**
 * Web search tool — uses Brave Search API.
 *
 * Brave Search has a free tier which makes it the default choice
 * for a local-first tool. API key configured during onboarding.
 */

import type { Tool, ToolContext, ValidationResult } from "./types.js";

export const webSearchTool: Tool = {
  definition: {
    name: "web_search",
    description:
      "Search the web using Brave Search. Returns relevant results with titles, URLs, and snippets. " +
      "Requires a Brave Search API key configured in settings.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        count: { type: "number", description: "Number of results (default: 5, max: 20)" },
      },
      required: ["query"],
    },
  },

  safetyLevel: "low",
  readOnly: true,

  validate(args: Record<string, unknown>): ValidationResult {
    if (!args.query || typeof args.query !== "string") {
      return { ok: false, error: "query is required" };
    }
    return { ok: true };
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    const query = args.query as string;
    const count = Math.min(Number(args.count) || 5, 20);

    // Load API key from config
    const { loadConfig } = await import("../config/index.js");
    const config = await loadConfig();
    const apiKey = config.tools.webSearch?.apiKey;

    if (!apiKey) {
      return "Error: Brave Search API key not configured. Run `clank setup --section search` or tell me to set it up.";
    }

    try {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
      const res = await fetch(url, {
        headers: {
          "Accept": "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
        },
        signal: ctx.signal,
      });

      if (!res.ok) {
        return `Search error: ${res.status} ${res.statusText}`;
      }

      const data = await res.json() as {
        web?: { results?: Array<{ title: string; url: string; description: string }> };
      };

      const results = data.web?.results || [];
      if (results.length === 0) return `No results found for: ${query}`;

      return results.map((r, i) =>
        `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description}`
      ).join("\n\n");
    } catch (err) {
      return `Search error: ${err instanceof Error ? err.message : err}`;
    }
  },
};
