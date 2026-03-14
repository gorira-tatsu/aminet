import type { NpmPackument } from "../registry/types.js";
import type { SecuritySignal } from "./types.js";

const INTERNAL_PATTERNS = [
  /^internal[-_]/i,
  /[-_]internal$/i,
  /^private[-_]/i,
  /[-_]private$/i,
  /^corp[-_]/i,
  /[-_]corp$/i,
  /^company[-_]/i,
  /[-_]company$/i,
  /^org[-_]/i,
  /^enterprise[-_]/i,
  /^infra[-_]/i,
];

export function detectDependencyConfusion(
  name: string,
  version: string,
  packument: NpmPackument,
  weeklyDownloads?: number | null,
): SecuritySignal[] {
  const signals: SecuritySignal[] = [];

  // Only check unscoped packages (scoped packages have namespace protection)
  if (name.startsWith("@")) return signals;

  const hasInternalName = INTERNAL_PATTERNS.some((pattern) => pattern.test(name));
  if (!hasInternalName) return signals;

  const versionCount = Object.keys(packument.versions).length;
  const isRecentlyCreated = isNewPackage(packument, 30);
  const isLowDownloads =
    weeklyDownloads !== null && weeklyDownloads !== undefined && weeklyDownloads < 100;

  // Score risk factors
  let riskFactors = 0;
  const details: string[] = [];

  if (hasInternalName) {
    riskFactors++;
    details.push("Package name matches internal/private naming patterns");
  }

  if (isRecentlyCreated) {
    riskFactors++;
    details.push("Package was recently published (within 30 days)");
  }

  if (versionCount <= 1) {
    riskFactors++;
    details.push("Only one version published");
  }

  if (isLowDownloads) {
    riskFactors++;
    details.push("Very low download count");
  }

  if (riskFactors >= 2) {
    signals.push({
      category: "dependency-confusion",
      severity: riskFactors >= 3 ? "high" : "medium",
      packageId: `${name}@${version}`,
      name,
      version,
      title: "Potential dependency confusion attack",
      description: `Package "${name}" has characteristics of a dependency confusion attack: ${details.join("; ")}.`,
      details: { riskFactors, indicators: details },
    });
  }

  return signals;
}

function isNewPackage(packument: NpmPackument, days: number): boolean {
  if (!packument.time?.created) return false;
  const created = new Date(packument.time.created).getTime();
  const ageMs = Date.now() - created;
  return ageMs < days * 24 * 60 * 60 * 1000;
}
