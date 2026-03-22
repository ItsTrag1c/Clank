#!/usr/bin/env node

/**
 * Clank — Local-first AI agent gateway
 *
 * Entry point for the `clank` CLI command.
 * Routes to subcommands: chat, gateway, setup, fix, models, agents, daemon.
 */

import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from package.json
let version = "0.1.0";
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
  version = pkg.version;
} catch {
  // Use default version
}

const program = new Command();

program
  .name("clank")
  .description("Local-first AI agent gateway")
  .version(version, "-v, --version");

// clank chat — interactive chat (connects to gateway or direct mode)
program
  .command("chat")
  .description("Start an interactive chat session")
  .option("--web", "Open chat in browser")
  .option("--new", "Start a fresh session")
  .option("--continue", "Resume last session")
  .option("--session <id>", "Resume a specific session")
  .option("--direct", "Force direct mode (no gateway)")
  .action(async (opts) => {
    const { runChat } = await import("./chat.js");
    await runChat(opts);
  });

// clank gateway — manage the gateway daemon
const gateway = program
  .command("gateway")
  .description("Manage the gateway daemon");

gateway
  .command("start")
  .description("Start the gateway daemon")
  .option("-p, --port <port>", "Port to listen on", "18789")
  .option("--foreground", "Run in foreground (don't daemonize)")
  .action(async (opts) => {
    console.log("Gateway start — not yet implemented");
  });

gateway
  .command("stop")
  .description("Stop the gateway daemon")
  .action(async () => {
    console.log("Gateway stop — not yet implemented");
  });

gateway
  .command("status")
  .description("Show gateway status")
  .action(async () => {
    console.log("Gateway status — not yet implemented");
  });

gateway
  .command("restart")
  .description("Restart the gateway daemon")
  .action(async () => {
    console.log("Gateway restart — not yet implemented");
  });

// clank setup — onboarding wizard
program
  .command("setup")
  .description("Run the onboarding wizard")
  .option("--quick", "Quick Start with sensible defaults")
  .option("--advanced", "Advanced setup with full control")
  .option("--section <name>", "Reconfigure a specific section")
  .option("--non-interactive", "Non-interactive mode for scripting")
  .option("--accept-risk", "Accept security disclaimer")
  .action(async (opts) => {
    console.log("Setup wizard — not yet implemented");
  });

// clank fix — diagnostics & repair
program
  .command("fix")
  .description("Run diagnostics and repair")
  .option("--auto", "Attempt automatic repairs")
  .option("--check <system>", "Check a specific system")
  .action(async (opts) => {
    console.log("Fix utility — not yet implemented");
  });

// clank models — model management
const models = program
  .command("models")
  .description("Manage models and providers");

models
  .command("list")
  .description("List available models")
  .action(async () => {
    console.log("Models list — not yet implemented");
  });

models
  .command("add")
  .description("Add a model provider")
  .action(async () => {
    console.log("Models add — not yet implemented");
  });

models
  .command("test")
  .description("Test model connectivity")
  .action(async () => {
    console.log("Models test — not yet implemented");
  });

// clank agents — agent management
const agents = program
  .command("agents")
  .description("Manage agents and routing");

agents
  .command("list")
  .description("List configured agents")
  .action(async () => {
    console.log("Agents list — not yet implemented");
  });

agents
  .command("add")
  .description("Add a new agent")
  .action(async () => {
    console.log("Agents add — not yet implemented");
  });

agents
  .command("routing")
  .description("Show routing rules")
  .action(async () => {
    console.log("Agents routing — not yet implemented");
  });

// clank daemon — system service management
const daemon = program
  .command("daemon")
  .description("Manage the system service");

daemon
  .command("install")
  .description("Install Clank as a system service")
  .action(async () => {
    console.log("Daemon install — not yet implemented");
  });

daemon
  .command("uninstall")
  .description("Remove the system service")
  .action(async () => {
    console.log("Daemon uninstall — not yet implemented");
  });

daemon
  .command("status")
  .description("Show system service status")
  .action(async () => {
    console.log("Daemon status — not yet implemented");
  });

// Default: if no subcommand, launch chat
program.action(async () => {
  const { runChat } = await import("./chat.js");
  await runChat({});
});

program.parse();
