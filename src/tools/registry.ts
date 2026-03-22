/**
 * Tool registry — manages available tools and handles tiering.
 *
 * The registry holds all registered tools and can filter them based on
 * the tool tier setting. This is critical for local model optimization:
 *
 * - "full": All tools available (best for capable models like Claude, GPT-4o)
 * - "core": Only 8 essential tools (best for smaller local models)
 * - "auto": Start with core, dynamically add tools when user message
 *           contains relevant keywords (smart middle ground)
 *
 * Why tiering matters: Smaller models get confused when given too many
 * tools. Reducing the tool count improves their tool selection accuracy.
 */

import type { Tool, ToolTier } from "./types.js";
import { CORE_TOOL_NAMES, AUTO_TIER_TRIGGERS } from "./types.js";
import type { ToolDefinition } from "../providers/types.js";

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  /** Register a tool */
  register(tool: Tool): void {
    this.tools.set(tool.definition.name, tool);
  }

  /** Get a tool by name */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /** Get all registered tools */
  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  /** Get tool names */
  list(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get tool definitions for the LLM, filtered by tier.
   *
   * @param tier - Which tool tier to use
   * @param userMessage - Current user message (for "auto" tier keyword matching)
   * @param allowlist - Optional allowlist of tool names (for per-agent filtering)
   * @param denylist - Optional denylist of tool names
   */
  getDefinitions(opts?: {
    tier?: ToolTier;
    userMessage?: string;
    allowlist?: string[];
    denylist?: string[];
  }): ToolDefinition[] {
    const tier = opts?.tier ?? "full";
    const userMessage = opts?.userMessage?.toLowerCase() ?? "";

    let toolNames: string[];

    switch (tier) {
      case "core":
        toolNames = CORE_TOOL_NAMES.filter((n) => this.tools.has(n));
        break;

      case "auto": {
        // Start with core tools
        const names = new Set(CORE_TOOL_NAMES.filter((n) => this.tools.has(n)));

        // Dynamically add tools based on keywords in the user message
        for (const [toolName, keywords] of Object.entries(AUTO_TIER_TRIGGERS)) {
          if (this.tools.has(toolName) && keywords.some((k) => userMessage.includes(k))) {
            names.add(toolName);
          }
        }

        toolNames = Array.from(names);
        break;
      }

      case "full":
      default:
        toolNames = this.list();
        break;
    }

    // Apply allowlist/denylist
    if (opts?.allowlist) {
      const allowed = new Set(opts.allowlist);
      toolNames = toolNames.filter((n) => allowed.has(n));
    }
    if (opts?.denylist) {
      const denied = new Set(opts.denylist);
      toolNames = toolNames.filter((n) => !denied.has(n));
    }

    return toolNames
      .map((name) => this.tools.get(name)!)
      .map((tool) => tool.definition as ToolDefinition);
  }

  /**
   * Register a tool from a plugin manifest.
   * Used by the plugin system for runtime tool loading.
   */
  registerFromManifest(manifest: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    safetyLevel: string;
    entrypoint: string;
  }): void {
    // Plugin tool loading will be implemented in the plugin sprint
    // For now, just validate the manifest shape
    if (!manifest.name || !manifest.description) {
      throw new Error("Plugin tool manifest must have name and description");
    }
  }
}
