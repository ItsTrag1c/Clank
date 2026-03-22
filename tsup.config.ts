import { defineConfig } from "tsup";
import { cpSync, mkdirSync } from "node:fs";

export default defineConfig({
  entry: ["src/cli/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  shims: true,
  async onSuccess() {
    // Copy web UI and workspace templates to dist/
    mkdirSync("dist/web", { recursive: true });
    cpSync("src/web/index.html", "dist/web/index.html");
    mkdirSync("dist/workspace/templates", { recursive: true });
    cpSync("src/workspace/templates", "dist/workspace/templates", { recursive: true });
  },
});
