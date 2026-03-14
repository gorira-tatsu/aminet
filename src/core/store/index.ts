export { TTL } from "./config.js";
export { closeDatabase, getDatabase, setDatabase } from "./database.js";
export { packageHash, packumentHash } from "./hash.js";
export {
  type CachedPackage,
  cachePackage,
  cachePackageBatch,
  getCachedPackage,
} from "./package-store.js";
export { cachePackument, getCachedPackument } from "./packument-store.js";
export {
  cacheVulnerabilities,
  cacheVulnerabilityBatch,
  getCachedVulnerabilities,
} from "./vulnerability-store.js";

import { getDatabase } from "./database.js";

export interface StoreStats {
  packuments: number;
  packages: number;
  vulnerabilities: number;
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

  // Get DB file size
  let dbSizeBytes = 0;
  try {
    const pageCount = (db.query("PRAGMA page_count").get() as { page_count: number }).page_count;
    const pageSize = (db.query("PRAGMA page_size").get() as { page_size: number }).page_size;
    dbSizeBytes = pageCount * pageSize;
  } catch {
    // in-memory DB
  }

  return { packuments, packages, vulnerabilities, dbSizeBytes };
}

export function clearAllStores(): void {
  const db = getDatabase();
  db.exec("DELETE FROM packuments");
  db.exec("DELETE FROM packages");
  db.exec("DELETE FROM vulnerabilities");
}
