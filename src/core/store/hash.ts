import { createHash } from "node:crypto";

/**
 * Nix-inspired content-addressable hash for package identification.
 * Format mirrors /nix/store/{hash}-{name}-{version}
 */
export function packageHash(ecosystem: string, name: string, version: string): string {
  return createHash("sha256").update(`${ecosystem}:${name}@${version}`).digest("hex").slice(0, 32);
}

/** Hash for packument (no version - keyed by ecosystem+name only) */
export function packumentHash(ecosystem: string, name: string): string {
  return createHash("sha256").update(`${ecosystem}:${name}`).digest("hex").slice(0, 32);
}
