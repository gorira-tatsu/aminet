import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { logger } from "../../utils/logger.js";

export interface LockfileEntry {
  name: string;
  version: string; // exact pinned version
}

export interface LockfileResult {
  format: "bun.lock" | "package-lock.json";
  packages: Map<string, string>; // name → exact version
}

/**
 * Try to find and parse a lockfile adjacent to the given package.json path.
 * Returns null if no lockfile found.
 */
export async function tryParseLockfile(packageJsonPath: string): Promise<LockfileResult | null> {
  const dir = packageJsonPath.replace(/[/\\][^/\\]+$/, "");
  const prefix = dir ? `${dir}/` : "";

  // Try bun.lock first, then package-lock.json
  for (const lockfileName of ["bun.lock", "package-lock.json"]) {
    const lockfilePath = `${prefix}${lockfileName}`;
    try {
      const content = await readFile(lockfilePath, "utf-8");
      const result = parseLockfile(lockfileName, content);
      if (result && result.packages.size > 0) {
        logger.info(`Using lockfile: ${lockfilePath} (${result.packages.size} packages)`);
        return result;
      }
    } catch {
      // File doesn't exist, try next
    }
  }

  return null;
}

/**
 * Parse a lockfile given its filename and content.
 */
export function parseLockfile(filename: string, content: string): LockfileResult | null {
  const name = basename(filename);
  if (name === "bun.lock") {
    return parseBunLock(content);
  }
  if (name === "package-lock.json") {
    return parsePackageLock(content);
  }
  return null;
}

/**
 * Parse bun.lock (JSON format with "packages" map).
 * Format: { packages: { "pkg-name": ["pkg-name@version", ...] } }
 */
function parseBunLock(content: string): LockfileResult | null {
  try {
    const lock = JSON.parse(content);
    const packages = new Map<string, string>();

    if (lock.packages && typeof lock.packages === "object") {
      for (const [key, value] of Object.entries(lock.packages)) {
        if (!Array.isArray(value) || value.length === 0) continue;
        const resolved = value[0] as string;
        // resolved is like "express@4.21.2" or "@types/node@20.0.0"
        const version = extractVersionFromResolved(resolved);
        if (version) {
          packages.set(key, version);
        }
      }
    }

    return { format: "bun.lock", packages };
  } catch {
    logger.warn("Failed to parse bun.lock");
    return null;
  }
}

/**
 * Parse package-lock.json (v2/v3 format with "packages" map).
 */
function parsePackageLock(content: string): LockfileResult | null {
  try {
    const lock = JSON.parse(content);
    const packages = new Map<string, string>();

    // v2/v3: "packages" with path keys like "node_modules/express"
    if (lock.packages && typeof lock.packages === "object") {
      for (const [path, info] of Object.entries(lock.packages)) {
        if (!path || path === "") continue; // root entry
        const pkg = info as { version?: string; name?: string };
        if (!pkg.version) continue;

        // Extract package name from path: "node_modules/@scope/pkg" → "@scope/pkg"
        const name = pkg.name ?? extractNameFromNodeModulesPath(path);
        if (name) {
          packages.set(name, pkg.version);
        }
      }
    }

    // v1 fallback: "dependencies" with nested objects
    if (packages.size === 0 && lock.dependencies && typeof lock.dependencies === "object") {
      parseV1Dependencies(lock.dependencies, packages);
    }

    return { format: "package-lock.json", packages };
  } catch {
    logger.warn("Failed to parse package-lock.json");
    return null;
  }
}

function parseV1Dependencies(
  deps: Record<string, { version?: string; dependencies?: Record<string, unknown> }>,
  packages: Map<string, string>,
): void {
  for (const [name, info] of Object.entries(deps)) {
    if (info.version) {
      packages.set(name, info.version);
    }
    if (info.dependencies) {
      parseV1Dependencies(
        info.dependencies as Record<
          string,
          { version?: string; dependencies?: Record<string, unknown> }
        >,
        packages,
      );
    }
  }
}

/**
 * Extract version from resolved string like "express@4.21.2"
 */
function extractVersionFromResolved(resolved: string): string | null {
  if (resolved.startsWith("@")) {
    // Scoped package: "@scope/name@version"
    const slashIdx = resolved.indexOf("/");
    if (slashIdx === -1) return null;
    const atIdx = resolved.lastIndexOf("@");
    if (atIdx <= slashIdx) return null;
    return resolved.slice(atIdx + 1);
  }
  const atIdx = resolved.lastIndexOf("@");
  if (atIdx <= 0) return null;
  return resolved.slice(atIdx + 1);
}

/**
 * Extract package name from node_modules path.
 * "node_modules/express" → "express"
 * "node_modules/@types/node" → "@types/node"
 */
function extractNameFromNodeModulesPath(path: string): string | null {
  const prefix = "node_modules/";
  const lastIdx = path.lastIndexOf(prefix);
  if (lastIdx === -1) return null;
  return path.slice(lastIdx + prefix.length);
}
