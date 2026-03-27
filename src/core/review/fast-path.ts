import type {
  DependencyDiff,
  DiffEntry,
  ReviewVulnerability,
  SecuritySignalChange,
} from "../diff/types.js";
import type { Report, ReportEntry } from "../report/types.js";
import type { SecuritySignal } from "../security/types.js";

export interface DirectDependencyChange {
  name: string;
  changeType: "added" | "removed" | "updated";
  baseDeclared?: string;
  headDeclared?: string;
  baseResolved?: string;
  headResolved?: string;
}

export interface ReviewPackageAnalysis {
  name: string;
  declaredVersion: string | null;
  resolvedVersion: string | null;
  report: Report;
}

export function collectDirectDependencies(
  pkg: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  },
  includeDev = false,
): Map<string, string> {
  return new Map(
    Object.entries({
      ...(pkg.dependencies ?? {}),
      ...(includeDev ? (pkg.devDependencies ?? {}) : {}),
    }),
  );
}

export function resolveDirectDependencyVersions(
  declared: Map<string, string>,
  lockfile: { packages: Map<string, string> } | null,
): Map<string, string | undefined> {
  const resolved = new Map<string, string | undefined>();
  for (const name of declared.keys()) {
    resolved.set(name, lockfile?.packages.get(name));
  }
  return resolved;
}

export function diffDirectDependencies(
  baseDeclared: Map<string, string>,
  headDeclared: Map<string, string>,
  baseResolved: Map<string, string | undefined>,
  headResolved: Map<string, string | undefined>,
): DirectDependencyChange[] {
  const names = [...new Set([...baseDeclared.keys(), ...headDeclared.keys()])].sort();
  const changes: DirectDependencyChange[] = [];

  for (const name of names) {
    const baseDecl = baseDeclared.get(name);
    const headDecl = headDeclared.get(name);
    const baseRes = baseResolved.get(name);
    const headRes = headResolved.get(name);

    if (baseDecl === undefined && headDecl !== undefined) {
      changes.push({
        name,
        changeType: "added",
        headDeclared: headDecl,
        headResolved: headRes,
      });
      continue;
    }

    if (baseDecl !== undefined && headDecl === undefined) {
      changes.push({
        name,
        changeType: "removed",
        baseDeclared: baseDecl,
        baseResolved: baseRes,
      });
      continue;
    }

    if (baseDecl !== headDecl || baseRes !== headRes) {
      changes.push({
        name,
        changeType: "updated",
        baseDeclared: baseDecl,
        headDeclared: headDecl,
        baseResolved: baseRes,
        headResolved: headRes,
      });
    }
  }

  return changes;
}

export function buildReviewDiff(
  changes: DirectDependencyChange[],
  baseAnalyses: Map<string, ReviewPackageAnalysis>,
  headAnalyses: Map<string, ReviewPackageAnalysis>,
): DependencyDiff {
  const added: DiffEntry[] = [];
  const removed: DiffEntry[] = [];
  const updated: DiffEntry[] = [];
  const licenseChanged: DependencyDiff["licenseChanged"] = [];
  const newVulnerabilities: DependencyDiff["newVulnerabilities"] = [];
  const resolvedVulnerabilities: DependencyDiff["resolvedVulnerabilities"] = [];
  const newSecuritySignals: SecuritySignalChange[] = [];
  const resolvedSecuritySignals: SecuritySignalChange[] = [];

  let skippedCount = 0;

  for (const change of changes) {
    const base = baseAnalyses.get(change.name);
    const head = headAnalyses.get(change.name);

    // Count packages that were detected as changed but couldn't be analyzed
    if (
      (change.changeType === "added" && !head) ||
      (change.changeType === "removed" && !base) ||
      (change.changeType === "updated" && (!base || !head))
    ) {
      skippedCount++;
    }

    if (change.changeType === "added" && head) {
      added.push(toDiffEntry(head, change));
      const headVulns = aggregateVulnerabilities(head.report);
      if (headVulns.length > 0) {
        newVulnerabilities.push({
          packageId: `${head.name}@${head.resolvedVersion ?? head.declaredVersion ?? "unknown"}`,
          name: head.name,
          version: head.resolvedVersion ?? head.declaredVersion ?? "unknown",
          vulnerabilities: headVulns,
        });
      }
      const headSignals = visibleSignals(head.report);
      if (headSignals.length > 0) {
        newSecuritySignals.push({
          packageId: `${head.name}@${head.resolvedVersion ?? head.declaredVersion ?? "unknown"}`,
          name: head.name,
          version: head.resolvedVersion ?? head.declaredVersion ?? "unknown",
          signals: headSignals,
        });
      }
      continue;
    }

    if (change.changeType === "removed" && base) {
      removed.push(toDiffEntry(base, change));
      const baseVulns = aggregateVulnerabilities(base.report);
      if (baseVulns.length > 0) {
        resolvedVulnerabilities.push({
          packageId: `${base.name}@${base.resolvedVersion ?? base.declaredVersion ?? "unknown"}`,
          name: base.name,
          version: base.resolvedVersion ?? base.declaredVersion ?? "unknown",
          vulnerabilities: baseVulns,
        });
      }
      const baseSignals = visibleSignals(base.report);
      if (baseSignals.length > 0) {
        resolvedSecuritySignals.push({
          packageId: `${base.name}@${base.resolvedVersion ?? base.declaredVersion ?? "unknown"}`,
          name: base.name,
          version: base.resolvedVersion ?? base.declaredVersion ?? "unknown",
          signals: baseSignals,
        });
      }
      continue;
    }

    if (change.changeType === "updated" && head) {
      updated.push(toDiffEntry(head, change));
    }

    if (base && head) {
      const baseRoot = getRootEntry(base.report);
      const headRoot = getRootEntry(head.report);
      if (
        baseRoot &&
        headRoot &&
        (baseRoot.license !== headRoot.license ||
          baseRoot.licenseCategory !== headRoot.licenseCategory)
      ) {
        licenseChanged.push({
          name: head.name,
          version: head.resolvedVersion ?? head.declaredVersion ?? "unknown",
          previousLicense: baseRoot.license,
          previousCategory: baseRoot.licenseCategory,
          previousLicenseDetails: baseRoot.licenseDetails,
          newLicense: headRoot.license,
          newCategory: headRoot.licenseCategory,
          newLicenseDetails: headRoot.licenseDetails,
        });
      }

      const baseVulns = aggregateVulnerabilities(base.report);
      const headVulns = aggregateVulnerabilities(head.report);
      const newVulns = headVulns.filter(
        (vuln) => !baseVulns.some((existing) => existing.id === vuln.id),
      );
      const resolvedVulns = baseVulns.filter(
        (vuln) => !headVulns.some((existing) => existing.id === vuln.id),
      );
      if (newVulns.length > 0) {
        newVulnerabilities.push({
          packageId: `${head.name}@${head.resolvedVersion ?? head.declaredVersion ?? "unknown"}`,
          name: head.name,
          version: head.resolvedVersion ?? head.declaredVersion ?? "unknown",
          vulnerabilities: newVulns,
        });
      }
      if (resolvedVulns.length > 0) {
        resolvedVulnerabilities.push({
          packageId: `${base.name}@${base.resolvedVersion ?? base.declaredVersion ?? "unknown"}`,
          name: base.name,
          version: base.resolvedVersion ?? base.declaredVersion ?? "unknown",
          vulnerabilities: resolvedVulns,
        });
      }

      const baseSignals = visibleSignals(base.report);
      const headSignals = visibleSignals(head.report);
      const addedSignals = headSignals.filter(
        (signal) =>
          !baseSignals.some(
            (existing) => securitySignalKey(existing) === securitySignalKey(signal),
          ),
      );
      const goneSignals = baseSignals.filter(
        (signal) =>
          !headSignals.some(
            (existing) => securitySignalKey(existing) === securitySignalKey(signal),
          ),
      );
      if (addedSignals.length > 0) {
        newSecuritySignals.push({
          packageId: `${head.name}@${head.resolvedVersion ?? head.declaredVersion ?? "unknown"}`,
          name: head.name,
          version: head.resolvedVersion ?? head.declaredVersion ?? "unknown",
          signals: addedSignals,
        });
      }
      if (goneSignals.length > 0) {
        resolvedSecuritySignals.push({
          packageId: `${base.name}@${base.resolvedVersion ?? base.declaredVersion ?? "unknown"}`,
          name: base.name,
          version: base.resolvedVersion ?? base.declaredVersion ?? "unknown",
          signals: goneSignals,
        });
      }
    }
  }

  const summary = computeSummary(
    added,
    removed,
    updated,
    skippedCount,
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

function toDiffEntry(analysis: ReviewPackageAnalysis, change: DirectDependencyChange): DiffEntry {
  const root = getRootEntry(analysis.report);
  return {
    name: analysis.name,
    version: analysis.resolvedVersion ?? analysis.declaredVersion ?? "unknown",
    previousVersion: change.baseResolved ?? change.baseDeclared,
    declaredVersion: change.headDeclared ?? change.baseDeclared ?? null,
    previousDeclaredVersion: change.baseDeclared ?? null,
    resolvedVersion: change.headResolved ?? analysis.resolvedVersion ?? null,
    previousResolvedVersion: change.baseResolved ?? null,
    license: root?.license ?? null,
    licenseCategory: root?.licenseCategory ?? "unknown",
    licenseDetails: root?.licenseDetails,
    depth: 1,
  };
}

function getRootEntry(report: Report): ReportEntry | undefined {
  return report.entries.find((entry) => entry.id === report.root);
}

function aggregateVulnerabilities(report: Report): ReviewVulnerability[] {
  const advisories = new Map<string, ReviewVulnerability>();

  for (const entry of report.entries) {
    if (entry.advisories && entry.advisories.length > 0) {
      for (const advisory of entry.advisories) {
        advisories.set(advisory.id, {
          id: advisory.id,
          summary: advisory.title,
          severity: advisory.severity.toUpperCase(),
          aliases: advisory.aliases,
          fixedVersion: advisory.fixedVersion,
          sources: advisory.sources,
          references: advisory.references,
        });
      }
      continue;
    }

    for (const vulnerability of entry.vulnerabilities) {
      advisories.set(vulnerability.id, {
        ...vulnerability,
        fixedVersion: null,
        sources: ["osv"],
        references: [],
      });
    }
  }

  return [...advisories.values()];
}

function visibleSignals(report: Report): SecuritySignal[] {
  const grouped = new Map<string, SecuritySignal>();
  for (const signal of report.securitySignals ?? []) {
    if (signal.severity === "info") continue;
    grouped.set(securitySignalKey(signal), signal);
  }
  return [...grouped.values()];
}

function securitySignalKey(signal: SecuritySignal): string {
  return `${signal.packageId}:${signal.category}:${signal.severity}:${signal.title}`;
}

function computeSummary(
  added: DiffEntry[],
  removed: DiffEntry[],
  updated: DiffEntry[],
  skippedCount: number,
  licenseChanged: DependencyDiff["licenseChanged"],
  newVulnerabilities: DependencyDiff["newVulnerabilities"],
  resolvedVulnerabilities: DependencyDiff["resolvedVulnerabilities"],
  newSecuritySignals: DependencyDiff["newSecuritySignals"],
  resolvedSecuritySignals: DependencyDiff["resolvedSecuritySignals"],
): DependencyDiff["summary"] {
  const newVulnCount = newVulnerabilities.reduce(
    (sum, change) => sum + change.vulnerabilities.length,
    0,
  );
  const resolvedVulnCount = resolvedVulnerabilities.reduce(
    (sum, change) => sum + change.vulnerabilities.length,
    0,
  );
  const newSecuritySignalCount = newSecuritySignals.reduce(
    (sum, change) => sum + change.signals.length,
    0,
  );
  const resolvedSecuritySignalCount = resolvedSecuritySignals.reduce(
    (sum, change) => sum + change.signals.length,
    0,
  );

  let riskLevel: DependencyDiff["summary"]["riskLevel"] = "none";
  const hasCriticalVuln = newVulnerabilities.some((change) =>
    change.vulnerabilities.some(
      (vulnerability) => vulnerability.severity?.toUpperCase() === "CRITICAL",
    ),
  );
  const hasHighVuln = newVulnerabilities.some((change) =>
    change.vulnerabilities.some(
      (vulnerability) => vulnerability.severity?.toUpperCase() === "HIGH",
    ),
  );
  const hasCriticalSecuritySignal = newSecuritySignals.some((change) =>
    change.signals.some((signal) => signal.severity === "critical"),
  );
  const hasHighSecuritySignal = newSecuritySignals.some((change) =>
    change.signals.some((signal) => signal.severity === "high"),
  );
  const hasCopyleftAdded = licenseChanged.some(
    (change) => change.newCategory === "copyleft" && change.previousCategory !== "copyleft",
  );
  const hasNewCopyleft = added.some((entry) => entry.licenseCategory === "copyleft");

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
