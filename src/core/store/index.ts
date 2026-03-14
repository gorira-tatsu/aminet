export { TTL } from "./config.js";
export { closeDatabase, getDatabase, setDatabase } from "./database.js";
export { packageHash, packumentHash } from "./hash.js";
export {
  cacheLicenseIntelligence,
  getCachedLicenseIntelligence,
} from "./license-store.js";
export {
  type CachedPackage,
  cachePackage,
  cachePackageBatch,
  getCachedPackage,
} from "./package-store.js";
export { cachePackument, getCachedPackument } from "./packument-store.js";
export {
  cacheDepsdevProject,
  cacheDepsdevVersion,
  cacheNpmDownloads,
  getCachedDepsdevProject,
  getCachedDepsdevVersion,
  getCachedNpmDownloads,
} from "./trust-api-store.js";
export {
  cacheTrustScore,
  getCachedTrustScore,
} from "./trust-store.js";
export {
  cacheVulnerabilities,
  cacheVulnerabilityBatch,
  getCachedVulnerabilities,
} from "./vulnerability-store.js";

import { TTL } from "./config.js";
import { getDatabase } from "./database.js";

export interface StoreStats {
  packuments: number;
  packages: number;
  vulnerabilities: number;
  securitySignals: number;
  licenseIntelligence: number;
  trustScores: number;
  npmDownloads: number;
  depsdevVersions: number;
  depsdevProjects: number;
  expiredPackuments: number;
  expiredVulnerabilities: number;
  expiredSecuritySignals: number;
  expiredLicenseIntelligence: number;
  expiredTrustScores: number;
  expiredNpmDownloads: number;
  expiredDepsdevVersions: number;
  expiredDepsdevProjects: number;
  dbSizeBytes: number;
}

export function getStoreStats(): StoreStats {
  const db = getDatabase();

  const packuments = (
    db.query("SELECT COUNT(*) as count FROM packuments").get() as { count: number }
  ).count;
  const packages = (db.query("SELECT COUNT(*) as count FROM packages").get() as { count: number })
    .count;
  const vulnerabilities = (
    db.query("SELECT COUNT(*) as count FROM vulnerabilities").get() as { count: number }
  ).count;
  const securitySignals = (
    db.query("SELECT COUNT(*) as count FROM security_signals").get() as { count: number }
  ).count;
  const licenseIntelligence = (
    db.query("SELECT COUNT(*) as count FROM license_intelligence").get() as { count: number }
  ).count;
  const trustScores = (
    db.query("SELECT COUNT(*) as count FROM trust_scores").get() as { count: number }
  ).count;
  const npmDownloads = (
    db.query("SELECT COUNT(*) as count FROM npm_downloads_cache").get() as { count: number }
  ).count;
  const depsdevVersions = (
    db.query("SELECT COUNT(*) as count FROM depsdev_versions_cache").get() as { count: number }
  ).count;
  const depsdevProjects = (
    db.query("SELECT COUNT(*) as count FROM depsdev_projects_cache").get() as { count: number }
  ).count;
  const now = Date.now();
  const expiredPackuments = (
    db
      .query("SELECT COUNT(*) as count FROM packuments WHERE fetched_at <= ?")
      .get(now - TTL.packument) as { count: number }
  ).count;
  const expiredVulnerabilities = (
    db
      .query("SELECT COUNT(*) as count FROM vulnerabilities WHERE scanned_at <= ?")
      .get(now - TTL.vulnerability) as { count: number }
  ).count;
  const expiredSecuritySignals = (
    db
      .query("SELECT COUNT(*) as count FROM security_signals WHERE scanned_at <= ?")
      .get(now - TTL.securitySignals) as { count: number }
  ).count;
  const expiredLicenseIntelligence = (
    db
      .query("SELECT COUNT(*) as count FROM license_intelligence WHERE fetched_at <= ?")
      .get(now - TTL.licenseIntelligence) as { count: number }
  ).count;
  const expiredTrustScores = (
    db
      .query("SELECT COUNT(*) as count FROM trust_scores WHERE computed_at <= ?")
      .get(now - TTL.trustScore) as { count: number }
  ).count;
  const expiredNpmDownloads = (
    db
      .query("SELECT COUNT(*) as count FROM npm_downloads_cache WHERE fetched_at <= ?")
      .get(now - TTL.npmDownloads) as { count: number }
  ).count;
  const expiredDepsdevVersions = (
    db
      .query("SELECT COUNT(*) as count FROM depsdev_versions_cache WHERE fetched_at <= ?")
      .get(now - TTL.depsdevVersion) as { count: number }
  ).count;
  const expiredDepsdevProjects = (
    db
      .query("SELECT COUNT(*) as count FROM depsdev_projects_cache WHERE fetched_at <= ?")
      .get(now - TTL.depsdevProject) as { count: number }
  ).count;

  // Get DB file size
  let dbSizeBytes = 0;
  try {
    const pageCount = (db.query("PRAGMA page_count").get() as { page_count: number }).page_count;
    const pageSize = (db.query("PRAGMA page_size").get() as { page_size: number }).page_size;
    dbSizeBytes = pageCount * pageSize;
  } catch {
    // in-memory DB
  }

  return {
    packuments,
    packages,
    vulnerabilities,
    securitySignals,
    licenseIntelligence,
    trustScores,
    npmDownloads,
    depsdevVersions,
    depsdevProjects,
    expiredPackuments,
    expiredVulnerabilities,
    expiredSecuritySignals,
    expiredLicenseIntelligence,
    expiredTrustScores,
    expiredNpmDownloads,
    expiredDepsdevVersions,
    expiredDepsdevProjects,
    dbSizeBytes,
  };
}

export function clearAllStores(): void {
  const db = getDatabase();
  db.exec("DELETE FROM packuments");
  db.exec("DELETE FROM packages");
  db.exec("DELETE FROM vulnerabilities");
  db.exec("DELETE FROM security_signals");
  db.exec("DELETE FROM license_intelligence");
  db.exec("DELETE FROM trust_scores");
  db.exec("DELETE FROM npm_downloads_cache");
  db.exec("DELETE FROM depsdev_versions_cache");
  db.exec("DELETE FROM depsdev_projects_cache");
}

export interface PruneResult {
  packuments: number;
  vulnerabilities: number;
  securitySignals: number;
  licenseIntelligence: number;
  trustScores: number;
  npmDownloads: number;
  depsdevVersions: number;
  depsdevProjects: number;
  totalDeleted: number;
}

export function pruneExpiredStores(now = Date.now()): PruneResult {
  const db = getDatabase();
  const statements = [
    {
      key: "packuments",
      sql: "DELETE FROM packuments WHERE fetched_at <= ?",
      cutoff: now - TTL.packument,
    },
    {
      key: "vulnerabilities",
      sql: "DELETE FROM vulnerabilities WHERE scanned_at <= ?",
      cutoff: now - TTL.vulnerability,
    },
    {
      key: "securitySignals",
      sql: "DELETE FROM security_signals WHERE scanned_at <= ?",
      cutoff: now - TTL.securitySignals,
    },
    {
      key: "licenseIntelligence",
      sql: "DELETE FROM license_intelligence WHERE fetched_at <= ?",
      cutoff: now - TTL.licenseIntelligence,
    },
    {
      key: "trustScores",
      sql: "DELETE FROM trust_scores WHERE computed_at <= ?",
      cutoff: now - TTL.trustScore,
    },
    {
      key: "npmDownloads",
      sql: "DELETE FROM npm_downloads_cache WHERE fetched_at <= ?",
      cutoff: now - TTL.npmDownloads,
    },
    {
      key: "depsdevVersions",
      sql: "DELETE FROM depsdev_versions_cache WHERE fetched_at <= ?",
      cutoff: now - TTL.depsdevVersion,
    },
    {
      key: "depsdevProjects",
      sql: "DELETE FROM depsdev_projects_cache WHERE fetched_at <= ?",
      cutoff: now - TTL.depsdevProject,
    },
  ] as const;

  const result: PruneResult = {
    packuments: 0,
    vulnerabilities: 0,
    securitySignals: 0,
    licenseIntelligence: 0,
    trustScores: 0,
    npmDownloads: 0,
    depsdevVersions: 0,
    depsdevProjects: 0,
    totalDeleted: 0,
  };

  const prune = db.transaction(() => {
    for (const statement of statements) {
      db.run(statement.sql, [statement.cutoff]);
      const deleted = db.query("SELECT changes() as count").get() as { count: number };
      result[statement.key] = deleted.count;
      result.totalDeleted += deleted.count;
    }
  });

  prune();
  return result;
}
