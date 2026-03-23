import { execSync } from "child_process";
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import { buildSync } from "esbuild";

const { version } = JSON.parse(readFileSync("./package.json", "utf8"));
const out = `dist/Clank_${version}_macos`;

console.log(`Building Clank v${version} for macOS...\n`);

// Step 1: Build with tsup (for web/ and workspace/ assets)
console.log("  [1/4] Building with tsup...");
execSync("npx tsup", { stdio: "inherit" });

// Step 2: Collect static assets
console.log("  [2/4] Collecting static assets...");
const webHtml = readFileSync("dist/web/index.html", "utf8");
const templates = {};
for (const f of readdirSync("dist/workspace/templates")) {
  templates[f] = readFileSync(join("dist/workspace/templates", f), "utf8");
}

// Step 3: Bundle to CJS with esbuild + import.meta.url polyfill
console.log("  [3/4] Bundling to CJS...");
buildSync({
  entryPoints: ["src/cli/index.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  outfile: "dist/pkg-bundle.cjs",
  define: { "import.meta.url": "__import_meta_url" },
  banner: {
    js: [
      'var __import_meta_url = require("url").pathToFileURL(__filename).href;',
      `globalThis.__CLANK_INLINE_WEB_HTML = ${JSON.stringify(webHtml)};`,
      `globalThis.__CLANK_INLINE_TEMPLATES = ${JSON.stringify(templates)};`,
    ].join("\n"),
  },
  logLevel: "warning",
});

// Step 4: Package with pkg
console.log("  [4/4] Packaging with pkg...");
execSync(`npx pkg dist/pkg-bundle.cjs --target node18-macos-arm64 --output "${out}" --compress GZip`, {
  stdio: "inherit",
});

const size = (readFileSync(out).length / 1024 / 1024).toFixed(1);
console.log(`\n  Built: ${out} (${size} MB)`);
