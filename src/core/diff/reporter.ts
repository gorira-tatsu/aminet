import type { Report, ReportEntry } from "../report/types.js";
import type { DependencyDiff, DiffEntry, DiffSummary, LicenseChange, VulnChange } from "./types.js";

export function computeDiff(baseReport: Report, headReport: Report): DependencyDiff {
  // Index by package name for version-change detection
  const baseByName = new Map<string, ReportEntry>();
  for (const entry of baseReport.entries) {
    baseByName.set(entry.name, entry);
  }

  const headByName = new Map<string, ReportEntry>();
  for (const entry of headReport.entries) {
    headByName.set(entry.name, entry);
  }

  const added: DiffEntry[] = [];
  const removed: DiffEntry[] = [];
  const updated: DiffEntry[] = [];
  const licenseChanged: LicenseChange[] = [];
  const newVulnerabilities: VulnChange[] = [];
  const resolvedVulnerabilities: VulnChange[] = [];

  // Find added and updated packages
  for (const [name, headEntry] of headByName) {
    const baseEntry = baseByName.get(name);

    if (!baseEntry) {
      // New package
      added.push({
        name: headEntry.name,
        version: headEntry.version,
        license: headEntry.license,
        licenseCategory: headEntry.licenseCategory,
        depth: headEntry.depth,
      });

      // All vulns in new package are new
      if (headEntry.vulnerabilities.length > 0) {
        newVulnerabilities.push({
          packageId: headEntry.id,
          name: headEntry.name,
          version: headEntry.version,
          vulnerabilities: headEntry.vulnerabilities,
        });
      }
      continue;
    }

    // Version changed
    if (baseEntry.version !== headEntry.version) {
      updated.push({
        name: headEntry.name,
        version: headEntry.version,
        previousVersion: baseEntry.version,
        license: headEntry.license,
        licenseCategory: headEntry.licenseCategory,
        depth: headEntry.depth,
      });
    }

    // License changed
    if (
      baseEntry.license !== headEntry.license ||
      baseEntry.licenseCategory !== headEntry.licenseCategory
    ) {
      licenseChanged.push({
        name: headEntry.name,
        version: headEntry.version,
        previousLicense: baseEntry.license,
        previousCategory: baseEntry.licenseCategory,
        newLicense: headEntry.license,
        newCategory: headEntry.licenseCategory,
      });
    }

    // Vulnerability diff
    const baseVulnIds = new Set(baseEntry.vulnerabilities.map((v) => v.id));
    const headVulnIds = new Set(headEntry.vulnerabilities.map((v) => v.id));

    const newVulns = headEntry.vulnerabilities.filter((v) => !baseVulnIds.has(v.id));
    if (newVulns.length > 0) {
      newVulnerabilities.push({
        packageId: headEntry.id,
        name: headEntry.name,
        version: headEntry.version,
        vulnerabilities: newVulns,
      });
    }

    const resolvedVulns = baseEntry.vulnerabilities.filter((v) => !headVulnIds.has(v.id));
    if (resolvedVulns.length > 0) {
      resolvedVulnerabilities.push({
        packageId: baseEntry.id,
        name: baseEntry.name,
        version: baseEntry.version,
        vulnerabilities: resolvedVulns,
      });
    }
  }

  // Find removed packages
  for (const [name, baseEntry] of baseByName) {
    if (!headByName.has(name)) {
      removed.push({
        name: baseEntry.name,
        version: baseEntry.version,
        license: baseEntry.license,
        licenseCategory: baseEntry.licenseCategory,
        depth: baseEntry.depth,
      });

      // All vulns in removed package are resolved
      if (baseEntry.vulnerabilities.length > 0) {
        resolvedVulnerabilities.push({
          packageId: baseEntry.id,
          name: baseEntry.name,
          version: baseEntry.version,
          vulnerabilities: baseEntry.vulnerabilities,
        });
      }
    }
  }

  const summary = computeSummary(
    added,
    removed,
    updated,
    licenseChanged,
    newVulnerabilities,
    resolvedVulnerabilities,
  );

  return {
    added,
    removed,
    updated,
    licenseChanged,
    newVulnerabilities,
    resolvedVulnerabilities,
    summary,
  };
}

function computeSummary(
  added: DiffEntry[],
  removed: DiffEntry[],
  updated: DiffEntry[],
  licenseChanged: LicenseChange[],
  newVulnerabilities: VulnChange[],
  resolvedVulnerabilities: VulnChange[],
): DiffSummary {
  const newVulnCount = newVulnerabilities.reduce((sum, v) => sum + v.vulnerabilities.length, 0);
  const resolvedVulnCount = resolvedVulnerabilities.reduce(
    (sum, v) => sum + v.vulnerabilities.length,
    0,
  );

  // Determine risk level
  let riskLevel: DiffSummary["riskLevel"] = "none";

  // Check for critical vulns
  const hasCriticalVuln = newVulnerabilities.some((vc) =>
    vc.vulnerabilities.some((v) => v.severity?.toUpperCase() === "CRITICAL"),
  );
  const hasHighVuln = newVulnerabilities.some((vc) =>
    vc.vulnerabilities.some((v) => v.severity?.toUpperCase() === "HIGH"),
  );
  const hasCopyleftAdded = licenseChanged.some(
    (lc) => lc.newCategory === "copyleft" && lc.previousCategory !== "copyleft",
  );
  const hasNewCopyleft = added.some((a) => a.licenseCategory === "copyleft");

  if (hasCriticalVuln || hasCopyleftAdded || hasNewCopyleft) {
    riskLevel = "critical";
  } else if (hasHighVuln) {
    riskLevel = "high";
  } else if (newVulnCount > 0 || licenseChanged.length > 0) {
    riskLevel = "medium";
  } else if (added.length > 0 || updated.length > 0) {
    riskLevel = "low";
  }

  return {
    addedCount: added.length,
    removedCount: removed.length,
    updatedCount: updated.length,
    newVulnCount,
    resolvedVulnCount,
    licenseChangeCount: licenseChanged.length,
    riskLevel,
  };
}
