import chalk from "chalk";
import { getDatabase } from "../../core/store/database.js";
import {
  clearAllStores,
  getPersistentCacheFailureReason,
  getStoreStats,
  isPersistentCacheAvailable,
  pruneExpiredStores,
} from "../../core/store/index.js";

export async function cacheStatsCommand(): Promise<void> {
  if (!ensurePersistentCache()) return;
  const stats = getStoreStats();

  console.log(chalk.bold("Cache Statistics:"));
  console.log(`  Packuments:      ${stats.packuments}`);
  console.log(`  Packages:        ${stats.packages}`);
  console.log(`  Vulnerabilities: ${stats.vulnerabilities}`);
  console.log(`  Security signals:${stats.securitySignals}`);
  console.log(`  License intel:   ${stats.licenseIntelligence}`);
  console.log(`  Trust scores:    ${stats.trustScores}`);
  console.log(`  npm downloads:   ${stats.npmDownloads}`);
  console.log(`  deps.dev vers:   ${stats.depsdevVersions}`);
  console.log(`  deps.dev proj:   ${stats.depsdevProjects}`);
  console.log("");
  console.log(chalk.bold("Expired Entries:"));
  console.log(`  Packuments:      ${stats.expiredPackuments}`);
  console.log(`  Vulnerabilities: ${stats.expiredVulnerabilities}`);
  console.log(`  Security signals:${stats.expiredSecuritySignals}`);
  console.log(`  License intel:   ${stats.expiredLicenseIntelligence}`);
  console.log(`  Trust scores:    ${stats.expiredTrustScores}`);
  console.log(`  npm downloads:   ${stats.expiredNpmDownloads}`);
  console.log(`  deps.dev vers:   ${stats.expiredDepsdevVersions}`);
  console.log(`  deps.dev proj:   ${stats.expiredDepsdevProjects}`);
  console.log(`  Database size:   ${formatBytes(stats.dbSizeBytes)}`);
}

export async function cacheClearCommand(): Promise<void> {
  if (!ensurePersistentCache()) return;
  clearAllStores();
  console.log(chalk.green("Cache cleared."));
}

export async function cachePruneCommand(): Promise<void> {
  if (!ensurePersistentCache()) return;
  const result = pruneExpiredStores();
  console.log(
    chalk.green(
      `Pruned ${result.totalDeleted} expired cache entr${result.totalDeleted === 1 ? "y" : "ies"}.`,
    ),
  );
  console.log(`  Packuments:      ${result.packuments}`);
  console.log(`  Vulnerabilities: ${result.vulnerabilities}`);
  console.log(`  Security signals:${result.securitySignals}`);
  console.log(`  License intel:   ${result.licenseIntelligence}`);
  console.log(`  Trust scores:    ${result.trustScores}`);
  console.log(`  npm downloads:   ${result.npmDownloads}`);
  console.log(`  deps.dev vers:   ${result.depsdevVersions}`);
  console.log(`  deps.dev proj:   ${result.depsdevProjects}`);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / 1024 ** i;
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function ensurePersistentCache(): boolean {
  getDatabase();

  if (isPersistentCacheAvailable()) {
    return true;
  }

  const reason = getPersistentCacheFailureReason() ?? "unknown error";
  console.error(
    chalk.yellow(
      `Persistent cache unavailable: ${reason}. This cache command needs the on-disk database, but analyze/review still work without persistent cache.`,
    ),
  );
  process.exitCode = 1;
  return false;
}
