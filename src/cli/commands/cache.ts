import chalk from "chalk";
import { clearAllStores, getStoreStats } from "../../core/store/index.js";

export async function cacheStatsCommand(): Promise<void> {
  const stats = getStoreStats();

  console.log(chalk.bold("Cache Statistics:"));
  console.log(`  Packuments:      ${stats.packuments}`);
  console.log(`  Packages:        ${stats.packages}`);
  console.log(`  Vulnerabilities: ${stats.vulnerabilities}`);
  console.log(`  Database size:   ${formatBytes(stats.dbSizeBytes)}`);
}

export async function cacheClearCommand(): Promise<void> {
  clearAllStores();
  console.log(chalk.green("Cache cleared."));
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / 1024 ** i;
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
