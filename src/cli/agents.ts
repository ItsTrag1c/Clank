/**
 * CLI agent management commands.
 */

import { loadConfig, saveConfig, ensureConfigDir } from "../config/index.js";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

export async function agentsList(): Promise<void> {
  const config = await loadConfig();
  console.log("");
  console.log(dim("  Default model: ") + config.agents.defaults.model.primary);
  console.log(dim("  Default workspace: ") + config.agents.defaults.workspace);
  console.log(dim("  Tool tier: ") + config.agents.defaults.toolTier);
  console.log("");

  if (config.agents.list.length === 0) {
    console.log(dim("  No custom agents configured. Using default agent."));
    console.log(dim("  Add agents with: clank agents add"));
  } else {
    console.log("  Agents:");
    for (const a of config.agents.list) {
      console.log(`    ${a.id}: ${a.name || a.id}`);
      console.log(dim(`      model: ${a.model?.primary || "default"}`));
      if (a.workspace) console.log(dim(`      workspace: ${a.workspace}`));
      if (a.toolTier) console.log(dim(`      tier: ${a.toolTier}`));
    }
  }
  console.log("");
}

export async function agentsAdd(): Promise<void> {
  const { createInterface } = await import("node:readline");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> => new Promise((r) => rl.question(q, r));

  try {
    await ensureConfigDir();
    const config = await loadConfig();

    console.log("");
    const id = await ask(cyan("  Agent ID (lowercase, no spaces): "));
    if (!id.trim()) { console.log(dim("  Cancelled")); return; }

    const name = await ask(cyan(`  Display name [${id.trim()}]: `));
    const model = await ask(cyan("  Model [default]: "));
    const workspace = await ask(cyan("  Workspace [default]: "));

    const entry: Record<string, unknown> = { id: id.trim() };
    if (name.trim()) entry.name = name.trim();
    if (model.trim()) entry.model = { primary: model.trim() };
    if (workspace.trim()) entry.workspace = workspace.trim();

    config.agents.list.push(entry as any);
    await saveConfig(config);
    console.log(green(`  Agent ${id.trim()} added`));
    console.log("");
  } finally {
    rl.close();
  }
}

export async function agentsRouting(): Promise<void> {
  const config = await loadConfig();
  console.log("");
  console.log(dim("  Routing rules are configured in config.json5 or through conversation."));
  console.log(dim("  Default: all messages go to the default agent."));
  console.log("");

  if (config.agents.list.length > 0) {
    console.log("  Configured agents:");
    for (const a of config.agents.list) {
      console.log(`    ${a.id} → model: ${a.model?.primary || "default"}`);
    }
  }

  if (config.channels?.telegram?.enabled) {
    const groups = config.channels.telegram.groups;
    if (groups && Object.keys(groups).length > 0) {
      console.log("");
      console.log("  Telegram group bindings:");
      for (const [groupId, cfg] of Object.entries(groups)) {
        console.log(`    ${groupId}: mention=${cfg.requireMention ?? true}`);
      }
    }
  }
  console.log("");
}
