/**
 * `clank update` — pull latest, rebuild, restart gateway.
 *
 * Updates the npm package to the latest version while preserving
 * all user config, sessions, memory, and workspace files.
 */

import { execSync } from "node:child_process";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

export async function runUpdate(): Promise<void> {
  console.log("");
  console.log(dim("  Updating Clank..."));

  // Step 1: Stop the gateway if running
  console.log(dim("  Stopping gateway..."));
  try {
    const { gatewayStop } = await import("./gateway-cmd.js");
    await gatewayStop();
  } catch {
    // May not be running
  }

  // Step 2: Update the npm package
  console.log(dim("  Pulling latest version..."));
  try {
    // --force: on Windows, npm can't overwrite its own shim files (clank.ps1,
    // clank.cmd) while this process is running — force lets it replace them
    // --prefer-online: skip npm cache to ensure we get the actual latest version
    const output = execSync("npm install -g @tractorscorch/clank@latest --force --prefer-online", {
      encoding: "utf-8",
      timeout: 120_000,
    });
    console.log(dim(`  ${output.trim()}`));
  } catch (err) {
    console.error(red(`  Update failed: ${err instanceof Error ? err.message : err}`));
    console.error(dim("  Try manually: npm install -g @tractorscorch/clank@latest --force --prefer-online"));
    return;
  }

  // Step 3: Verify new version
  try {
    const newVersion = execSync("clank --version", { encoding: "utf-8" }).trim();
    console.log(green(`  Updated to v${newVersion}`));
  } catch {
    console.log(green("  Package updated"));
  }

  // Step 4: Restart gateway
  console.log(dim("  Restarting gateway..."));
  try {
    const { gatewayStartBackground } = await import("./gateway-cmd.js");
    await gatewayStartBackground();
    console.log(green("  Gateway restarted"));
  } catch (err) {
    console.log(dim("  Gateway not restarted. Start manually: clank gateway start"));
  }

  console.log("");
  console.log(green("  Clank updated successfully."));
  console.log(dim("  Config, sessions, and memory preserved."));
  console.log("");
}
