import semver from "semver";
import type { NpmPackument } from "../registry/types.js";

export function resolveVersion(packument: NpmPackument, range: string): string | null {
  // Handle "latest" or dist-tag references
  if (packument["dist-tags"][range]) {
    return packument["dist-tags"][range];
  }

  // Handle exact version
  if (packument.versions[range]) {
    return range;
  }

  // Handle URL/git dependencies - skip
  if (range.startsWith("http") || range.startsWith("git") || range.includes("/")) {
    return null;
  }

  const versions = Object.keys(packument.versions);
  const resolved = semver.maxSatisfying(versions, range);
  return resolved;
}
