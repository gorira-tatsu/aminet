import { logger } from "../../utils/logger.js";
import type { LicenseCategory } from "../graph/types.js";
import { getDatabase } from "./database.js";
import { packageHash } from "./hash.js";

export interface CachedPackage {
  name: string;
  version: string;
  license: string | null;
  licenseCategory: LicenseCategory;
  dependencies: Record<string, string>;
  tarballUrl?: string;
  integrity?: string;
}

interface PackageRow {
  name: string;
  version: string;
  hash: string;
  license: string | null;
  license_category: string;
  dependencies: string;
  resolved_at: number;
  tarball_url?: string | null;
  integrity?: string | null;
}

/** Package data is immutable (name@version never changes) - no TTL */
export function getCachedPackage(
  name: string,
  version: string,
  ecosystem = "npm",
): CachedPackage | null {
  const db = getDatabase();
  const row = db
    .query<PackageRow, [string, string, string]>(
      "SELECT license, license_category, dependencies, tarball_url, integrity FROM packages WHERE ecosystem = ? AND name = ? AND version = ?",
    )
    .get(ecosystem, name, version);

  if (!row) return null;

  logger.debug(`Package cache hit: ${name}@${version}`);
  return {
    name,
    version,
    license: row.license,
    licenseCategory: row.license_category as LicenseCategory,
    dependencies: JSON.parse(row.dependencies),
    tarballUrl: row.tarball_url ?? undefined,
    integrity: row.integrity ?? undefined,
  };
}

export function cachePackage(pkg: CachedPackage, ecosystem = "npm"): void {
  const db = getDatabase();
  const hash = packageHash(ecosystem, pkg.name, pkg.version);

  db.run(
    `INSERT OR IGNORE INTO packages (ecosystem, name, version, hash, license, license_category, dependencies, resolved_at, tarball_url, integrity)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ecosystem,
      pkg.name,
      pkg.version,
      hash,
      pkg.license,
      pkg.licenseCategory,
      JSON.stringify(pkg.dependencies),
      Date.now(),
      pkg.tarballUrl ?? null,
      pkg.integrity ?? null,
    ],
  );
}

export function cachePackageBatch(packages: CachedPackage[], ecosystem = "npm"): void {
  const db = getDatabase();
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO packages (ecosystem, name, version, hash, license, license_category, dependencies, resolved_at, tarball_url, integrity)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const now = Date.now();
  const insertAll = db.transaction(() => {
    for (const pkg of packages) {
      const hash = packageHash(ecosystem, pkg.name, pkg.version);
      stmt.run(
        ecosystem,
        pkg.name,
        pkg.version,
        hash,
        pkg.license,
        pkg.licenseCategory,
        JSON.stringify(pkg.dependencies),
        now,
        pkg.tarballUrl ?? null,
        pkg.integrity ?? null,
      );
    }
  });

  insertAll();
}
