/**
 * Project context tool — gives the agent awareness of the project it's working in.
 *
 * Actions:
 * - scan: Detect project type, tech stack, and structure from manifest files
 * - important_files: Find files most likely relevant (heuristics + git recency)
 * - summarize: Generate a .clank.md project context file from scan results
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { Tool, ToolContext, ValidationResult, SafetyLevel } from "../types.js";

/** Manifest files that indicate project type and tech stack */
const MANIFEST_FILES: Record<string, string> = {
  "package.json": "Node.js / JavaScript / TypeScript",
  "tsconfig.json": "TypeScript",
  "Cargo.toml": "Rust",
  "go.mod": "Go",
  "pyproject.toml": "Python",
  "requirements.txt": "Python",
  "Pipfile": "Python",
  "pom.xml": "Java (Maven)",
  "build.gradle": "Java / Kotlin (Gradle)",
  "build.gradle.kts": "Kotlin (Gradle)",
  "Gemfile": "Ruby",
  "composer.json": "PHP",
  "CMakeLists.txt": "C / C++",
  "Makefile": "Make-based build",
  "Dockerfile": "Docker",
  "docker-compose.yml": "Docker Compose",
  "docker-compose.yaml": "Docker Compose",
  ".github/workflows": "GitHub Actions CI",
  "Jenkinsfile": "Jenkins CI",
  ".gitlab-ci.yml": "GitLab CI",
  "vercel.json": "Vercel deployment",
  "netlify.toml": "Netlify deployment",
  "next.config.js": "Next.js",
  "next.config.mjs": "Next.js",
  "next.config.ts": "Next.js",
  "vite.config.ts": "Vite",
  "webpack.config.js": "Webpack",
  "tailwind.config.js": "Tailwind CSS",
  "tailwind.config.ts": "Tailwind CSS",
  "electron-builder.yml": "Electron",
};

/** Important file patterns to surface */
const IMPORTANT_PATTERNS = [
  "README.md", "README", "CHANGELOG.md", "CONTRIBUTING.md",
  "LICENSE", "LICENSE.md",
  ".env.example", ".env.template",
  ".clank.md", ".clankbuild.md",
];

export const contextTool: Tool = {
  definition: {
    name: "project_context",
    description:
      "Understand the project you're working in. " +
      "'scan' detects project type, tech stack, and directory structure from manifest files. " +
      "'important_files' finds files most relevant to the current work (uses heuristics + git recency). " +
      "'summarize' generates a .clank.md project context file from scan results.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Action: 'scan', 'important_files', or 'summarize'",
        },
        depth: {
          type: "number",
          description: "Directory tree depth for scan (default: 3, max: 5)",
        },
      },
      required: ["action"],
    },
  },

  safetyLevel: ((args: Record<string, unknown>) => {
    return args.action === "summarize" ? "medium" as const : "low" as const;
  }) as SafetyLevel | ((args: Record<string, unknown>) => SafetyLevel),
  readOnly: false,

  validate(args: Record<string, unknown>): ValidationResult {
    const action = args.action as string;
    if (!["scan", "important_files", "summarize"].includes(action)) {
      return { ok: false, error: "action must be 'scan', 'important_files', or 'summarize'" };
    }
    return { ok: true };
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    const action = args.action as string;
    const root = ctx.projectRoot;
    const depth = Math.min((args.depth as number) || 3, 5);

    switch (action) {
      case "scan":
        return scanProject(root, depth);
      case "important_files":
        return findImportantFiles(root);
      case "summarize":
        return generateSummary(root, depth);
      default:
        return "Unknown action";
    }
  },
};

/** Scan the project for tech stack and structure */
async function scanProject(root: string, maxDepth: number): Promise<string> {
  const lines: string[] = ["## Project Scan", ""];

  // Detect tech stack from manifest files
  const stack: string[] = [];
  for (const [file, tech] of Object.entries(MANIFEST_FILES)) {
    if (existsSync(join(root, file))) {
      stack.push(tech);
    }
  }

  if (stack.length > 0) {
    // Deduplicate
    const unique = [...new Set(stack)];
    lines.push(`**Tech stack:** ${unique.join(", ")}`);
  } else {
    lines.push("**Tech stack:** Unknown (no recognized manifest files)");
  }

  // Read package.json for more detail if it exists
  const pkgPath = join(root, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
      if (pkg.name) lines.push(`**Package:** ${pkg.name}@${pkg.version || "0.0.0"}`);
      if (pkg.description) lines.push(`**Description:** ${pkg.description}`);

      const deps = Object.keys(pkg.dependencies || {});
      const devDeps = Object.keys(pkg.devDependencies || {});
      if (deps.length > 0) lines.push(`**Dependencies:** ${deps.length} (${deps.slice(0, 10).join(", ")}${deps.length > 10 ? "..." : ""})`);
      if (devDeps.length > 0) lines.push(`**Dev dependencies:** ${devDeps.length} (${devDeps.slice(0, 8).join(", ")}${devDeps.length > 8 ? "..." : ""})`);

      if (pkg.scripts) {
        const scripts = Object.keys(pkg.scripts);
        lines.push(`**Scripts:** ${scripts.join(", ")}`);
      }
    } catch { /* skip */ }
  }

  // Read Cargo.toml for Rust projects
  const cargoPath = join(root, "Cargo.toml");
  if (existsSync(cargoPath)) {
    try {
      const cargo = await readFile(cargoPath, "utf-8");
      const nameMatch = cargo.match(/^name\s*=\s*"(.+)"/m);
      const versionMatch = cargo.match(/^version\s*=\s*"(.+)"/m);
      if (nameMatch) lines.push(`**Crate:** ${nameMatch[1]}${versionMatch ? `@${versionMatch[1]}` : ""}`);
    } catch { /* skip */ }
  }

  lines.push("");

  // Directory tree
  lines.push("**Directory structure:**");
  lines.push("```");
  const tree = await buildTree(root, maxDepth, 0);
  lines.push(tree);
  lines.push("```");

  return lines.join("\n");
}

/** Find important/relevant files */
async function findImportantFiles(root: string): Promise<string> {
  const lines: string[] = ["## Important Files", ""];

  // Check for known important files
  const found: string[] = [];
  for (const pattern of IMPORTANT_PATTERNS) {
    if (existsSync(join(root, pattern))) {
      found.push(pattern);
    }
  }

  if (found.length > 0) {
    lines.push("**Project files:**");
    found.forEach((f) => lines.push(`- ${f}`));
    lines.push("");
  }

  // Git recently modified files (last 20 commits)
  try {
    const recent = execSync(
      "git log --oneline --name-only -20 --diff-filter=AM --no-merges",
      { cwd: root, encoding: "utf-8", timeout: 5000 },
    );

    // Count file occurrences to find most-touched files
    const fileCounts = new Map<string, number>();
    for (const line of recent.split("\n")) {
      const trimmed = line.trim();
      // Skip commit message lines (they start with a hash) and empty lines
      if (!trimmed || /^[0-9a-f]{7,}/.test(trimmed)) continue;
      if (existsSync(join(root, trimmed))) {
        fileCounts.set(trimmed, (fileCounts.get(trimmed) || 0) + 1);
      }
    }

    if (fileCounts.size > 0) {
      const sorted = [...fileCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);

      lines.push("**Recently active files** (by commit frequency):");
      sorted.forEach(([file, count]) => lines.push(`- ${file} (${count} commits)`));
      lines.push("");
    }
  } catch {
    lines.push("_(git history not available)_");
    lines.push("");
  }

  // Entry points
  const entryPoints: string[] = [];
  const candidates = ["src/index.ts", "src/index.js", "src/main.ts", "src/main.js", "src/app.ts", "src/app.js",
    "index.ts", "index.js", "main.ts", "main.js", "app.ts", "app.js", "main.py", "app.py",
    "src/main.rs", "src/lib.rs", "cmd/main.go", "main.go"];
  for (const entry of candidates) {
    if (existsSync(join(root, entry))) {
      entryPoints.push(entry);
    }
  }
  if (entryPoints.length > 0) {
    lines.push("**Entry points:**");
    entryPoints.forEach((f) => lines.push(`- ${f}`));
  }

  return lines.join("\n");
}

/** Generate a .clank.md summary and write it */
async function generateSummary(root: string, maxDepth: number): Promise<string> {
  const scan = await scanProject(root, maxDepth);
  const important = await findImportantFiles(root);

  const content = [
    "# Project Context",
    "",
    "_Auto-generated by Clank. Edit this file to add project-specific context._",
    "",
    scan,
    "",
    important,
  ].join("\n");

  const outPath = join(root, ".clank.md");
  try {
    await writeFile(outPath, content, "utf-8");
    return `Project context written to .clank.md\n\n${content}`;
  } catch (err) {
    return `Failed to write .clank.md: ${err instanceof Error ? err.message : err}\n\n${content}`;
  }
}

/** Build a directory tree string (respecting .gitignore-style exclusions) */
async function buildTree(dir: string, maxDepth: number, currentDepth: number): Promise<string> {
  if (currentDepth >= maxDepth) return "";

  const SKIP = new Set([
    "node_modules", ".git", ".next", ".nuxt", "__pycache__", ".cache",
    "dist", "build", "target", ".venv", "venv", ".tox", "coverage",
    ".idea", ".vscode", ".DS_Store", "Thumbs.db",
  ]);

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return "";
  }

  // Sort: directories first, then files
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  const lines: string[] = [];
  const indent = "  ".repeat(currentDepth);

  for (const entry of entries) {
    if (SKIP.has(entry.name) || entry.name.startsWith(".")) continue;

    if (entry.isDirectory()) {
      lines.push(`${indent}${entry.name}/`);
      const sub = await buildTree(join(dir, entry.name), maxDepth, currentDepth + 1);
      if (sub) lines.push(sub);
    } else {
      lines.push(`${indent}${entry.name}`);
    }
  }

  return lines.join("\n");
}
