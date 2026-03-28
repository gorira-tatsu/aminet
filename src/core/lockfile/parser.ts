import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parse } from "yaml";
import { logger } from "../../utils/logger.js";

export interface LockfileEntry {
  name: string;
  version: string; // exact pinned version
}

export interface LockfileResult {
  format:
    | "bun.lock"
    | "package-lock.json"
    | "pnpm-lock.yaml"
    | "poetry.lock"
    | "pdm.lock"
    | "uv.lock";
  packages: Map<string, string>; // name → exact version
}

/**
 * Try to find and parse a lockfile adjacent to the given manifest path.
 * Returns null if no lockfile found.
 */
export async function tryParseLockfile(
  manifestPath: string,
  ecosystem: "npm" | "pypi" = "npm",
): Promise<LockfileResult | null> {
  const dir = manifestPath.replace(/[/\\][^/\\]+$/, "");
  const prefix = dir ? `${dir}/` : "";

  for (const lockfileName of getLockfileNames(ecosystem)) {
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
 * For pnpm workspaces, pass workspacePath (e.g., "packages/frontend") to read
 * the correct importer section instead of the root.
 */
export function parseLockfile(
  filename: string,
  content: string,
  workspacePath?: string,
): LockfileResult | null {
  const name = basename(filename);
  if (name === "bun.lock") {
    return parseBunLock(content);
  }
  if (name === "package-lock.json") {
    return parsePackageLock(content);
  }
  if (name === "pnpm-lock.yaml") {
    return parsePnpmLock(content, workspacePath);
  }
  if (name === "poetry.lock" || name === "pdm.lock" || name === "uv.lock") {
    return parsePythonPackageLock(name, content);
  }
  return null;
}

function getLockfileNames(ecosystem: "npm" | "pypi"): string[] {
  if (ecosystem === "pypi") {
    return ["uv.lock", "poetry.lock", "pdm.lock"];
  }
  return ["pnpm-lock.yaml", "package-lock.json", "bun.lock"];
}

function parsePnpmLock(content: string, workspacePath?: string): LockfileResult | null {
  try {
    const lock = parse(content) as {
      importers?: Record<
        string,
        {
          dependencies?: Record<string, { version?: string } | string>;
          devDependencies?: Record<string, { version?: string } | string>;
          optionalDependencies?: Record<string, { version?: string } | string>;
        }
      >;
    };
    const importerKey = workspacePath ?? ".";
    const importer = lock.importers?.[importerKey] ?? lock.importers?.["."] ?? lock.importers?.[""];
    const packages = new Map<string, string>();

    for (const section of [
      importer?.dependencies,
      importer?.devDependencies,
      importer?.optionalDependencies,
    ]) {
      if (!section) continue;
      for (const [name, value] of Object.entries(section)) {
        const rawVersion = typeof value === "string" ? value : value.version;
        const version = normalizePnpmVersion(rawVersion);
        if (version) {
          packages.set(name, version);
        }
      }
    }

    return { format: "pnpm-lock.yaml", packages };
  } catch {
    logger.warn("Failed to parse pnpm-lock.yaml");
    return null;
  }
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

function normalizePnpmVersion(version: string | undefined): string | null {
  if (!version) return null;
  return version.split("(")[0] ?? null;
}

function parsePythonPackageLock(
  format: "poetry.lock" | "pdm.lock" | "uv.lock",
  content: string,
): LockfileResult | null {
  try {
    const packages = new Map<string, string>();
    const blocks = content.split(/\r?\n(?=\[\[package\]\])/g);

    for (const block of blocks) {
      if (!block.includes("[[package]]")) continue;
      const nameMatch = block.match(/^\s*name\s*=\s*["']([^"']+)["']/m);
      const versionMatch = block.match(/^\s*version\s*=\s*["']([^"']+)["']/m);
      if (!nameMatch || !versionMatch) continue;
      packages.set(nameMatch[1], versionMatch[1]);
    }

    return { format, packages };
  } catch {
    logger.warn(`Failed to parse ${format}`);
    return null;
  }
}
