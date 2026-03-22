/**
 * Path containment guard.
 *
 * Prevents file tools from accessing paths outside the workspace.
 * All resolved paths must be within the projectRoot or explicitly
 * allowed external paths (with user confirmation).
 */

import { resolve, isAbsolute, normalize, relative } from "node:path";

/**
 * Resolve a path and verify it's within the allowed root.
 * Returns the resolved path, or an error string if blocked.
 */
export function guardPath(
  inputPath: string,
  projectRoot: string,
  opts?: { allowExternal?: boolean },
): { ok: true; path: string } | { ok: false; error: string } {
  // Resolve the full path
  const resolved = isAbsolute(inputPath)
    ? normalize(inputPath)
    : normalize(resolve(projectRoot, inputPath));

  // Check containment — resolved path must start with projectRoot
  const rel = relative(projectRoot, resolved);
  const isOutside = rel.startsWith("..") || isAbsolute(rel);

  if (isOutside && !opts?.allowExternal) {
    return {
      ok: false,
      error: `Path "${inputPath}" resolves outside workspace. Resolved to: ${resolved}`,
    };
  }

  return { ok: true, path: resolved };
}
