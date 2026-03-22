/**
 * Daemon installer — installs Clank as a system service.
 *
 * Cross-platform:
 * - macOS: LaunchAgent plist
 * - Windows: Task Scheduler
 * - Linux: systemd --user unit
 */

import { writeFile, mkdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import { execSync } from "node:child_process";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

export async function installDaemon(): Promise<void> {
  const os = platform();
  switch (os) {
    case "darwin":
      await installLaunchd();
      break;
    case "win32":
      await installTaskScheduler();
      break;
    case "linux":
      await installSystemd();
      break;
    default:
      console.log(red(`Unsupported platform: ${os}`));
  }
}

export async function uninstallDaemon(): Promise<void> {
  const os = platform();
  switch (os) {
    case "darwin":
      await uninstallLaunchd();
      break;
    case "win32":
      await uninstallTaskScheduler();
      break;
    case "linux":
      await uninstallSystemd();
      break;
    default:
      console.log(red(`Unsupported platform: ${os}`));
  }
}

export async function daemonStatus(): Promise<void> {
  const os = platform();
  switch (os) {
    case "darwin":
      try {
        const out = execSync("launchctl list | grep com.clank.gateway", { encoding: "utf-8" });
        console.log(green("Daemon: running (launchd)"));
        console.log(dim(out.trim()));
      } catch {
        console.log(dim("Daemon: not installed"));
      }
      break;
    case "win32":
      try {
        const out = execSync('schtasks /query /tn "ClankGateway" /fo LIST', { encoding: "utf-8" });
        console.log(green("Daemon: installed (Task Scheduler)"));
        console.log(dim(out.trim()));
      } catch {
        console.log(dim("Daemon: not installed"));
      }
      break;
    case "linux":
      try {
        const out = execSync("systemctl --user status clank-gateway", { encoding: "utf-8" });
        console.log(green("Daemon: running (systemd)"));
        console.log(dim(out.trim()));
      } catch {
        console.log(dim("Daemon: not installed or not running"));
      }
      break;
  }
}

// --- macOS: LaunchAgent ---
async function installLaunchd(): Promise<void> {
  const plistDir = join(homedir(), "Library", "LaunchAgents");
  const plistPath = join(plistDir, "com.clank.gateway.plist");
  const clankPath = execSync("which clank || echo clank", { encoding: "utf-8" }).trim();

  await mkdir(plistDir, { recursive: true });

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.clank.gateway</string>
  <key>ProgramArguments</key>
  <array>
    <string>${clankPath}</string>
    <string>gateway</string>
    <string>start</string>
    <string>--foreground</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${join(homedir(), ".clank", "logs", "gateway.log")}</string>
  <key>StandardErrorPath</key>
  <string>${join(homedir(), ".clank", "logs", "gateway-error.log")}</string>
</dict>
</plist>`;

  await writeFile(plistPath, plist, "utf-8");
  execSync(`launchctl load "${plistPath}"`);
  console.log(green("Daemon installed (launchd)"));
  console.log(dim(`  Plist: ${plistPath}`));
}

async function uninstallLaunchd(): Promise<void> {
  const plistPath = join(homedir(), "Library", "LaunchAgents", "com.clank.gateway.plist");
  try {
    execSync(`launchctl unload "${plistPath}"`);
    await unlink(plistPath);
    console.log(green("Daemon uninstalled"));
  } catch {
    console.log(dim("Daemon was not installed"));
  }
}

// --- Windows: Task Scheduler ---
async function installTaskScheduler(): Promise<void> {
  const clankPath = process.argv[0]; // Node path — we'll use the full command
  try {
    execSync(
      `schtasks /create /tn "ClankGateway" /tr "node \\"${clankPath}\\" gateway start --foreground" /sc onlogon /rl highest /f`,
      { encoding: "utf-8" },
    );
    // Also start it now
    execSync(`schtasks /run /tn "ClankGateway"`, { encoding: "utf-8" });
    console.log(green("Daemon installed (Task Scheduler)"));
    console.log(dim("  Task: ClankGateway"));
    console.log(dim("  Trigger: at login"));
  } catch (err) {
    console.error(red(`Failed to install: ${err instanceof Error ? err.message : err}`));
  }
}

async function uninstallTaskScheduler(): Promise<void> {
  try {
    execSync('schtasks /delete /tn "ClankGateway" /f', { encoding: "utf-8" });
    console.log(green("Daemon uninstalled"));
  } catch {
    console.log(dim("Daemon was not installed"));
  }
}

// --- Linux: systemd ---
async function installSystemd(): Promise<void> {
  const unitDir = join(homedir(), ".config", "systemd", "user");
  const unitPath = join(unitDir, "clank-gateway.service");
  const clankPath = execSync("which clank || echo clank", { encoding: "utf-8" }).trim();

  await mkdir(unitDir, { recursive: true });

  const unit = `[Unit]
Description=Clank Gateway
After=network.target

[Service]
ExecStart=${clankPath} gateway start --foreground
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`;

  await writeFile(unitPath, unit, "utf-8");
  execSync("systemctl --user daemon-reload");
  execSync("systemctl --user enable clank-gateway");
  execSync("systemctl --user start clank-gateway");
  console.log(green("Daemon installed (systemd --user)"));
  console.log(dim(`  Unit: ${unitPath}`));
}

async function uninstallSystemd(): Promise<void> {
  try {
    execSync("systemctl --user stop clank-gateway");
    execSync("systemctl --user disable clank-gateway");
    const unitPath = join(homedir(), ".config", "systemd", "user", "clank-gateway.service");
    await unlink(unitPath);
    execSync("systemctl --user daemon-reload");
    console.log(green("Daemon uninstalled"));
  } catch {
    console.log(dim("Daemon was not installed"));
  }
}
