/**
 * Plugin system types.
 *
 * Plugins extend Clank with custom tools, channels, providers, and hooks.
 * No marketplace — plugins are local directories or npm packages.
 * The trust boundary is the user's machine.
 */

import type { Tool } from "../tools/types.js";

/** Plugin manifest (clank-plugin.json) */
export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  type: "tool" | "channel" | "provider" | "hook" | "multi";
  /** Tool definitions (if type includes tools) */
  tools?: PluginToolEntry[];
  /** Hook definitions */
  hooks?: PluginHookEntry[];
  /** Main entry point for the plugin */
  main?: string;
}

export interface PluginToolEntry {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  safetyLevel: "low" | "medium" | "high";
  entrypoint: string;
}

export interface PluginHookEntry {
  type: HookType;
  handler: string;
  priority?: number;
}

/** All supported hook types */
export type HookType =
  | "before_agent_start"
  | "after_agent_end"
  | "before_tool_call"
  | "after_tool_call"
  | "before_prompt_build"
  | "llm_input"
  | "llm_output"
  | "message_received"
  | "message_sending"
  | "message_sent"
  | "session_start"
  | "session_end"
  | "before_compaction"
  | "after_compaction"
  | "gateway_start"
  | "gateway_stop"
  | "subagent_spawning"
  | "subagent_spawned"
  | "subagent_ended"
  | "inbound_claim"
  | "tool_result_persist"
  | "cron_job_start"
  | "cron_job_end"
  | "pipeline_step_start"
  | "pipeline_step_end";

/** Hook handler function signature */
export type HookHandler = (context: HookContext) => Promise<void> | void;

/** Context passed to hook handlers */
export interface HookContext {
  hookType: HookType;
  agentId?: string;
  sessionKey?: string;
  data?: Record<string, unknown>;
  /** Set to true in the handler to prevent the default action */
  prevented?: boolean;
}

/** Loaded plugin instance */
export interface LoadedPlugin {
  manifest: PluginManifest;
  path: string;
  tools: Tool[];
  hooks: Map<HookType, HookHandler[]>;
}
