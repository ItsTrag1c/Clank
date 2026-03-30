/**
 * search_docs — RAG tool for searching local documentation.
 *
 * Searches markdown, text, and code files in the workspace and common
 * doc locations for content relevant to a query. Uses TF-IDF scoring
 * to rank results by relevance, returning the most useful snippets.
 *
 * This bridges the knowledge gap between local models and frontier
 * models: instead of needing to memorize everything, the model can
 * look up documentation, READMEs, changelogs, and project notes.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, relative } from "node:path";
import type { Tool, ToolContext, ValidationResult } from "./types.js";

/** File extensions to index for documentation search */
const DOC_EXTENSIONS = new Set([
  ".md", ".txt", ".rst", ".adoc", ".mdx",
  ".ts", ".js", ".py", ".go", ".rs", ".java",
  ".json", ".yaml", ".yml", ".toml",
]);

/** Directories to skip */
const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next",
  "__pycache__", ".venv", "venv", ".cache", "coverage",
  ".turbo", ".nuxt", "target",
]);

/** Max files to scan (prevent runaway on huge repos) */
const MAX_FILES = 500;

/** Max file size to read (skip binaries and huge files) */
const MAX_FILE_SIZE = 100_000; // 100KB

interface ScoredDoc {
  path: string;
  relativePath: string;
  snippet: string;
  score: number;
}

export const searchDocsTool: Tool = {
  definition: {
    name: "search_docs",
    description:
      "Search local documentation, README files, and project files for information relevant to a query. " +
      "Returns ranked snippets from the most relevant files. Use this when you need to look up " +
      "how something works in the project, find API docs, or understand architecture decisions.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "What to search for (e.g., 'authentication middleware', 'database migration', 'API rate limiting')",
        },
        scope: {
          type: "string",
          description: "Search scope: 'project' (workspace only), 'docs' (README/docs/ only), 'all' (default — both)",
        },
        count: {
          type: "number",
          description: "Number of results to return (default: 5, max: 10)",
        },
      },
      required: ["query"],
    },
  },

  safetyLevel: "low",
  readOnly: true,

  validate(args: Record<string, unknown>): ValidationResult {
    if (!args.query || typeof args.query !== "string") {
      return { ok: false, error: "query is required" };
    }
    if (args.query.length < 2) {
      return { ok: false, error: "query must be at least 2 characters" };
    }
    return { ok: true };
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    const query = args.query as string;
    const scope = (args.scope as string) || "all";
    const count = Math.min(Number(args.count) || 5, 10);
    const projectRoot = ctx.projectRoot;

    // Collect files to search
    const files: string[] = [];

    if (scope === "docs" || scope === "all") {
      // Prioritize doc-specific directories
      const docDirs = ["docs", "doc", "documentation", "wiki", ".github"];
      for (const dir of docDirs) {
        const fullPath = join(projectRoot, dir);
        if (existsSync(fullPath)) {
          await collectFiles(fullPath, files);
        }
      }

      // Also grab top-level doc files
      const topLevelDocs = [
        "README.md", "CHANGELOG.md", "CONTRIBUTING.md", "ARCHITECTURE.md",
        "API.md", "SECURITY.md", "PRIVACY.md", ".clank.md",
      ];
      for (const name of topLevelDocs) {
        const fullPath = join(projectRoot, name);
        if (existsSync(fullPath)) files.push(fullPath);
      }
    }

    if (scope === "project" || scope === "all") {
      // Walk the whole project (with limits)
      await collectFiles(projectRoot, files);
    }

    if (files.length === 0) {
      return `No searchable files found in ${projectRoot}`;
    }

    // Deduplicate
    const uniqueFiles = [...new Set(files)].slice(0, MAX_FILES);

    // Tokenize query
    const queryTerms = tokenize(query);
    if (queryTerms.length === 0) {
      return "Query too generic — try more specific terms.";
    }

    // Score each file
    const scored: ScoredDoc[] = [];
    const df = new Map<string, number>();
    const docTokens: Array<{ path: string; content: string; terms: string[] }> = [];

    // First pass: read and tokenize all files, build document frequency
    for (const filePath of uniqueFiles) {
      try {
        const fileStat = await stat(filePath);
        if (fileStat.size > MAX_FILE_SIZE) continue;

        const content = await readFile(filePath, "utf-8");
        const terms = tokenize(content);
        if (terms.length === 0) continue;

        docTokens.push({ path: filePath, content, terms });
        const unique = new Set(terms);
        for (const t of unique) df.set(t, (df.get(t) || 0) + 1);
      } catch {
        continue;
      }
    }

    if (docTokens.length === 0) {
      return "No readable documents found.";
    }

    const N = docTokens.length;

    // Second pass: score each document
    for (const doc of docTokens) {
      const score = cosineTfIdf(queryTerms, doc.terms, df, N);
      if (score < 0.01) continue;

      // Extract the best snippet: find the paragraph with the most query term hits
      const snippet = extractBestSnippet(doc.content, queryTerms);
      const relativePath = relative(projectRoot, doc.path).replace(/\\/g, "/");

      scored.push({ path: doc.path, relativePath, snippet, score });
    }

    // Sort by score
    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, count);

    if (results.length === 0) {
      return `No relevant documentation found for: "${query}"`;
    }

    return results.map((r, i) =>
      `${i + 1}. **${r.relativePath}** (relevance: ${(r.score * 100).toFixed(0)}%)\n${r.snippet}`
    ).join("\n\n");
  },
};

/** Recursively collect searchable files */
async function collectFiles(dir: string, files: string[], depth = 0): Promise<void> {
  if (depth > 6 || files.length >= MAX_FILES) return;

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (files.length >= MAX_FILES) return;

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          await collectFiles(join(dir, entry.name), files, depth + 1);
        }
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (DOC_EXTENSIONS.has(ext)) {
          files.push(join(dir, entry.name));
        }
      }
    }
  } catch {
    // Permission denied or other errors — skip
  }
}

/** Stopwords for TF-IDF */
const STOPWORDS = new Set([
  "the", "be", "to", "of", "and", "a", "in", "that", "have", "i",
  "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
  "this", "but", "his", "by", "from", "they", "we", "say", "her",
  "she", "or", "an", "will", "my", "one", "all", "would", "there",
  "their", "what", "so", "up", "out", "if", "about", "who", "get",
  "which", "go", "me", "when", "make", "can", "like", "time", "no",
  "just", "him", "know", "take", "people", "into", "year", "your",
  "good", "some", "could", "them", "see", "other", "than", "then",
  "now", "look", "only", "come", "its", "over", "think", "also",
  "back", "after", "use", "two", "how", "our", "work", "first",
  "well", "way", "even", "new", "want", "because", "any", "these",
  "give", "day", "most", "us", "is", "are", "was", "were", "been",
  "has", "had", "did", "does", "am", "import", "export", "const",
  "let", "var", "function", "return", "class", "type", "interface",
]);

/** Tokenize text */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-_]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/** TF-IDF cosine similarity */
function cosineTfIdf(
  queryTerms: string[],
  docTerms: string[],
  df: Map<string, number>,
  N: number,
): number {
  const queryTf = new Map<string, number>();
  for (const t of queryTerms) queryTf.set(t, (queryTf.get(t) || 0) + 1);

  const docTf = new Map<string, number>();
  for (const t of docTerms) docTf.set(t, (docTf.get(t) || 0) + 1);

  let dot = 0, qMag = 0, dMag = 0;
  const allTerms = new Set([...queryTf.keys(), ...docTf.keys()]);

  for (const term of allTerms) {
    const idf = Math.log(N / (df.get(term) || 1));
    const q = (queryTf.get(term) || 0) * idf;
    const d = (docTf.get(term) || 0) * idf;
    dot += q * d;
    qMag += q * q;
    dMag += d * d;
  }

  const mag = Math.sqrt(qMag) * Math.sqrt(dMag);
  return mag > 0 ? dot / mag : 0;
}

/** Extract the most relevant snippet from a document */
function extractBestSnippet(content: string, queryTerms: string[]): string {
  const lines = content.split("\n");
  const querySet = new Set(queryTerms);

  // Score each line by how many query terms it contains
  const lineScores = lines.map((line, i) => {
    const words = tokenize(line);
    const hits = words.filter((w) => querySet.has(w)).length;
    return { index: i, score: hits };
  });

  // Find the best scoring line
  lineScores.sort((a, b) => b.score - a.score);
  const bestIdx = lineScores[0]?.index ?? 0;

  // Extract a window around the best line (3 lines before, 5 after)
  const start = Math.max(0, bestIdx - 3);
  const end = Math.min(lines.length, bestIdx + 6);
  const snippet = lines.slice(start, end).join("\n").trim();

  // Truncate long snippets
  return snippet.length > 500 ? snippet.slice(0, 497) + "..." : snippet;
}
