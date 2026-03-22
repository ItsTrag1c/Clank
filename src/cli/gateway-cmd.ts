/**
 * Gateway CLI commands — start/stop/status/restart.
 */

import { GatewayServer } from "../gateway/index.js";
import { loadConfig, ensureConfigDir } from "../config/index.js";
import { DEFAULT_PORT } from "../gateway/protocol.js";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

export async function gatewayStart(opts: { port?: string; foreground?: boolean }): Promise<void> {
  await ensureConfigDir();
  const config = await loadConfig();

  if (opts.port) {
    config.gateway.port = parseInt(opts.port, 10);
  }

  const server = new GatewayServer(config);

  // Handle shutdown signals
  const shutdown = async () => {
    console.log(dim("\nShutting down..."));
    await server.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    await server.start();
    console.log(green(`Gateway started on port ${config.gateway.port}`));
    console.log(dim("Press Ctrl+C to stop"));
  } catch (err) {
    console.error(red(`Failed to start gateway: ${err instanceof Error ? err.message : err}`));
    process.exit(1);
  }
}

export async function gatewayStop(): Promise<void> {
  // Send shutdown signal to running gateway via health endpoint
  const config = await loadConfig();
  const port = config.gateway.port || DEFAULT_PORT;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      console.log(dim("Gateway is running. Use Ctrl+C in the gateway terminal to stop it."));
      console.log(dim("(Daemon stop will be implemented with the daemon system)"));
    }
  } catch {
    console.log(dim("No gateway running."));
  }
}

export async function gatewayStatus(): Promise<void> {
  const config = await loadConfig();
  const port = config.gateway.port || DEFAULT_PORT;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/status`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json() as Record<string, unknown>;
      console.log(green("Gateway is running"));
      console.log(dim(`  Port: ${port}`));
      console.log(dim(`  Clients: ${(data.clients as unknown[])?.length || 0}`));
      console.log(dim(`  Sessions: ${(data.sessions as unknown[])?.length || 0}`));
    } else {
      console.log(red("Gateway returned error"));
    }
  } catch {
    console.log(red("Gateway is not running"));
    console.log(dim(`  Expected at http://127.0.0.1:${port}`));
    console.log(dim("  Start with: clank gateway start"));
  }
}
