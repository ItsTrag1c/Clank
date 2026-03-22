/**
 * Config hot-reload — watches config.json5 for changes.
 *
 * When the config file changes, it reloads and emits an event
 * so the gateway can apply changes without restarting.
 */

import { watch, type FSWatcher } from "node:fs";
import { EventEmitter } from "node:events";
import { loadConfig, getConfigPath, type ClankConfig } from "./config.js";

export class ConfigWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private currentConfig: ClankConfig | null = null;

  /** Start watching the config file */
  async start(): Promise<ClankConfig> {
    this.currentConfig = await loadConfig();
    const configPath = getConfigPath();

    try {
      this.watcher = watch(configPath, { persistent: false }, () => {
        // Debounce — config editors may write multiple times
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.reload(), 500);
      });
    } catch {
      // Config file might not exist yet — that's fine
    }

    return this.currentConfig;
  }

  /** Stop watching */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /** Reload config and emit change event */
  private async reload(): Promise<void> {
    try {
      const newConfig = await loadConfig();
      const oldConfig = this.currentConfig;
      this.currentConfig = newConfig;
      this.emit("change", { oldConfig, newConfig });
    } catch (err) {
      this.emit("error", err);
    }
  }

  /** Get the current config */
  getConfig(): ClankConfig | null {
    return this.currentConfig;
  }
}
