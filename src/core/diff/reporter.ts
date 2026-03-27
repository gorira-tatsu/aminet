import type { Report, ReportEntry } from "../report/types.js";
import type { SecuritySignal } from "../security/types.js";
import type { NormalizedAdvisory } from "../vulnerability/advisory-types.js";
import type {
  DependencyDiff,
  DiffEntry,
  DiffSummary,
  LicenseChange,
  ReviewVulnerability,
  VulnChange,
} from "./types.js";

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
  const newSecuritySignals = computeSecuritySignalChanges(
    baseReport.securitySignals ?? [],
    headReport.securitySignals ?? [],
  );
  const resolvedSecuritySignals = computeSecuritySignalChanges(
    headReport.securitySignals ?? [],
    baseReport.securitySignals ?? [],
  );

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
        licenseDetails: headEntry.licenseDetails,
        depth: headEntry.depth,
      });

      const headVulns = toReviewVulnerabilities(headEntry);
      if (headVulns.length > 0) {
        newVulnerabilities.push({
          packageId: headEntry.id,
          name: headEntry.name,
          version: headEntry.version,
          vulnerabilities: headVulns,
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
        licenseDetails: headEntry.licenseDetails,
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
        previousLicenseDetails: baseEntry.licenseDetails,
        newLicense: headEntry.license,
        newCategory: headEntry.licenseCategory,
        newLicenseDetails: headEntry.licenseDetails,
      });
    }

    const baseVulns = toReviewVulnerabilities(baseEntry);
    const headVulns = toReviewVulnerabilities(headEntry);
    const baseVulnIds = new Set(baseVulns.map((v) => v.id));
    const headVulnIds = new Set(headVulns.map((v) => v.id));

    const newVulns = headVulns.filter((v) => !baseVulnIds.has(v.id));
    if (newVulns.length > 0) {
      newVulnerabilities.push({
        packageId: headEntry.id,
        name: headEntry.name,
        version: headEntry.version,
        vulnerabilities: newVulns,
      });
    }

    const resolvedVulns = baseVulns.filter((v) => !headVulnIds.has(v.id));
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
        licenseDetails: baseEntry.licenseDetails,
        depth: baseEntry.depth,
      });

      const baseVulns = toReviewVulnerabilities(baseEntry);
      if (baseVulns.length > 0) {
        resolvedVulnerabilities.push({
          packageId: baseEntry.id,
          name: baseEntry.name,
          version: baseEntry.version,
          vulnerabilities: baseVulns,
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
    newSecuritySignals,
    resolvedSecuritySignals,
  );

  return {
    added,
    removed,
    updated,
    licenseChanged,
    newVulnerabilities,
    resolvedVulnerabilities,
    newSecuritySignals,
    resolvedSecuritySignals,
    summary,
  };
}

function toReviewVulnerabilities(entry: ReportEntry): ReviewVulnerability[] {
  if (entry.advisories && entry.advisories.length > 0) {
    return entry.advisories.map(normalizedAdvisoryToReviewVulnerability);
  }

  return entry.vulnerabilities.map((vulnerability) => ({
    ...vulnerability,
    fixedVersion: null,
    sources: ["osv"],
    references: [],
  }));
}

function normalizedAdvisoryToReviewVulnerability(
  advisory: NormalizedAdvisory,
): ReviewVulnerability {
  return {
    id: advisory.id,
    summary: advisory.title,
    severity: advisory.severity.toUpperCase(),
    aliases: advisory.aliases,
    fixedVersion: advisory.fixedVersion,
    sources: advisory.sources,
    references: advisory.references,
  };
}

function computeSummary(
  added: DiffEntry[],
  removed: DiffEntry[],
  updated: DiffEntry[],
  licenseChanged: LicenseChange[],
  newVulnerabilities: VulnChange[],
  resolvedVulnerabilities: VulnChange[],
  newSecuritySignals: DependencyDiff["newSecuritySignals"],
  resolvedSecuritySignals: DependencyDiff["resolvedSecuritySignals"],
  skippedCount = 0,
): DiffSummary {
  const newVulnCount = newVulnerabilities.reduce((sum, v) => sum + v.vulnerabilities.length, 0);
  const resolvedVulnCount = resolvedVulnerabilities.reduce(
    (sum, v) => sum + v.vulnerabilities.length,
    0,
  );
  const newSecuritySignalCount = newSecuritySignals.reduce((sum, s) => sum + s.signals.length, 0);
  const resolvedSecuritySignalCount = resolvedSecuritySignals.reduce(
    (sum, s) => sum + s.signals.length,
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
  const hasCriticalSecuritySignal = newSecuritySignals.some((sc) =>
    sc.signals.some((signal) => signal.severity === "critical"),
  );
  const hasHighSecuritySignal = newSecuritySignals.some((sc) =>
    sc.signals.some((signal) => signal.severity === "high"),
  );

  if (hasCriticalVuln || hasCriticalSecuritySignal || hasCopyleftAdded || hasNewCopyleft) {
    riskLevel = "critical";
  } else if (hasHighVuln || hasHighSecuritySignal) {
    riskLevel = "high";
  } else if (newVulnCount > 0 || newSecuritySignalCount > 0 || licenseChanged.length > 0) {
    riskLevel = "medium";
  } else if (skippedCount > 0 || added.length > 0 || updated.length > 0) {
    riskLevel = "low";
  }

  return {
    addedCount: added.length,
    removedCount: removed.length,
    updatedCount: updated.length,
    skippedCount,
    newVulnCount,
    resolvedVulnCount,
    licenseChangeCount: licenseChanged.length,
    newSecuritySignalCount,
    resolvedSecuritySignalCount,
    riskLevel,
  };
}

function computeSecuritySignalChanges(
  baseSignals: SecuritySignal[],
  headSignals: SecuritySignal[],
): DependencyDiff["newSecuritySignals"] {
  const baseKeys = new Set(baseSignals.map(securitySignalKey));
  const addedSignals = headSignals.filter((signal) => !baseKeys.has(securitySignalKey(signal)));
  const grouped = new Map<string, DependencyDiff["newSecuritySignals"][number]>();

  for (const signal of addedSignals) {
    const existing = grouped.get(signal.packageId);
    if (existing) {
      existing.signals.push(signal);
      continue;
    }
    grouped.set(signal.packageId, {
      packageId: signal.packageId,
      name: signal.name,
      version: signal.version,
      signals: [signal],
    });
  }

  return [...grouped.values()];
}

function securitySignalKey(signal: SecuritySignal): string {
  return `${signal.packageId}:${signal.category}:${signal.severity}:${signal.title}`;
}
