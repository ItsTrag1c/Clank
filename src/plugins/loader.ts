/**
 * Plugin loader — discovers and loads plugins at runtime.
 *
 * Discovery locations:
 * 1. ~/.clank/plugins/ — user-installed plugins
 * 2. node_modules/clank-plugin-* — npm-installed plugins
 *
 * Plugins are loaded in-process via dynamic import().
 * No sandboxing for v1 — trust boundary is the user's machine.
 */

import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type {
  PluginManifest,
  LoadedPlugin,
  HookType,
  HookHandler,
} from "./types.js";
import type { Tool } from "../tools/types.js";

export class PluginLoader {
  private plugins: LoadedPlugin[] = [];
  private hookRegistry = new Map<HookType, HookHandler[]>();

  /** Discover and load all plugins */
  async loadAll(): Promise<LoadedPlugin[]> {
    const pluginDirs = await this.discoverPlugins();

    for (const dir of pluginDirs) {
      try {
        const plugin = await this.loadPlugin(dir);
        if (plugin) {
          this.plugins.push(plugin);
          // Register hooks
          for (const [hookType, handlers] of plugin.hooks) {
            const existing = this.hookRegistry.get(hookType) || [];
            existing.push(...handlers);
            this.hookRegistry.set(hookType, existing);
          }
        }
      } catch (err) {
        console.error(`  Plugin error in ${dir}: ${err instanceof Error ? err.message : err}`);
      }
    }

    return this.plugins;
  }

  /** Discover plugin directories */
  private async discoverPlugins(): Promise<string[]> {
    const dirs: string[] = [];

    // 1. User plugins directory
    const userPluginDir = join(homedir(), ".clank", "plugins");
    if (existsSync(userPluginDir)) {
      try {
        const entries = await readdir(userPluginDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            dirs.push(join(userPluginDir, entry.name));
          }
        }
      } catch {
        // Skip if can't read
      }
    }

    // 2. npm clank-plugin-* packages
    const nodeModulesDir = join(process.cwd(), "node_modules");
    if (existsSync(nodeModulesDir)) {
      try {
        const entries = await readdir(nodeModulesDir);
        for (const entry of entries) {
          if (entry.startsWith("clank-plugin-")) {
            dirs.push(join(nodeModulesDir, entry));
          }
        }
      } catch {
        // Skip
      }
    }

    return dirs;
  }

  /** Load a single plugin from a directory */
  private async loadPlugin(dir: string): Promise<LoadedPlugin | null> {
    const manifestPath = join(dir, "clank-plugin.json");
    if (!existsSync(manifestPath)) return null;

    const raw = await readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(raw) as PluginManifest;

    if (!manifest.name) return null;

    const plugin: LoadedPlugin = {
      manifest,
      path: dir,
      tools: [],
      hooks: new Map(),
    };

    // Load tools
    if (manifest.tools) {
      for (const toolEntry of manifest.tools) {
        try {
          const entrypoint = join(dir, toolEntry.entrypoint);
          const mod = await import(entrypoint);
          const tool = mod.default || mod.tool;
          if (tool) {
            plugin.tools.push(tool as Tool);
          }
        } catch (err) {
          console.error(`  Failed to load tool ${toolEntry.name}: ${err instanceof Error ? err.message : err}`);
        }
      }
    }

    // Load hooks
    if (manifest.hooks) {
      for (const hookEntry of manifest.hooks) {
        try {
          const handlerPath = join(dir, hookEntry.handler);
          const mod = await import(handlerPath);
          const handler = mod.default || mod.handler;
          if (handler) {
            const existing = plugin.hooks.get(hookEntry.type) || [];
            existing.push(handler as HookHandler);
            plugin.hooks.set(hookEntry.type, existing);
          }
        } catch (err) {
          console.error(`  Failed to load hook ${hookEntry.type}: ${err instanceof Error ? err.message : err}`);
        }
      }
    }

    return plugin;
  }

  /** Get all loaded plugins */
  getPlugins(): LoadedPlugin[] {
    return [...this.plugins];
  }

  /** Get all tools from loaded plugins */
  getTools(): Tool[] {
    return this.plugins.flatMap((p) => p.tools);
  }

  /** Execute hooks of a given type */
  async executeHooks(hookType: HookType, context: Record<string, unknown> = {}): Promise<void> {
    const handlers = this.hookRegistry.get(hookType) || [];
    const hookCtx = { hookType, ...context, prevented: false };

    for (const handler of handlers) {
      if (hookCtx.prevented) break;
      await handler(hookCtx);
    }
  }

  /** Check if any hook has prevented the default action */
  async executeHooksWithResult(hookType: HookType, context: Record<string, unknown> = {}): Promise<boolean> {
    const hookCtx = { hookType, ...context, prevented: false };
    const handlers = this.hookRegistry.get(hookType) || [];

    for (const handler of handlers) {
      await handler(hookCtx);
      if (hookCtx.prevented) return true;
    }
    return false;
  }
}
