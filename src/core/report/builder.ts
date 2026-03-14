import type { FreshnessReport } from "../freshness/analyzer.js";
import type { DependencyGraph } from "../graph/types.js";
import type { IncompatiblePair } from "../license/compatibility-types.js";
import type { ContaminationPath } from "../license/contamination.js";
import { getContextNotes } from "../license/context-notes.js";
import type { EnhancedLicense } from "../license/enhanced-checker.js";
import type { PhantomDependency } from "../phantom/scanner.js";
import type { PinningReport } from "../pinning/analyzer.js";
import type { ProvenanceResult } from "../provenance/checker.js";
import type { SecuritySignal } from "../security/types.js";
import type { TrustScore } from "../trust/types.js";
import type { NormalizedAdvisory } from "../vulnerability/advisory-types.js";
import type { VulnerabilityResult } from "../vulnerability/types.js";
import type { Report, ReportEntry, ReportSummary } from "./types.js";

export interface BuildReportOptions {
  securitySignals?: SecuritySignal[];
  securitySummary?: {
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    infoCount: number;
  };
  contaminationPaths?: ContaminationPath[];
  licenseIncompatibilities?: IncompatiblePair[];
  advisories?: Map<string, NormalizedAdvisory[]>;
  trustScores?: Map<string, TrustScore>;
  freshnessReports?: Map<string, FreshnessReport>;
  enhancedLicenses?: Map<string, EnhancedLicense>;
  phantomDeps?: PhantomDependency[];
  provenanceResults?: ProvenanceResult[];
  pinningReport?: PinningReport;
  deepLicenseMismatches?: Report["deepLicenseMismatches"];
}

export function buildReport(
  graph: DependencyGraph,
  vulnerabilities: VulnerabilityResult[],
  options?: BuildReportOptions,
): Report {
  const vulnMap = new Map<string, VulnerabilityResult>();
  for (const v of vulnerabilities) {
    vulnMap.set(v.packageId, v);
  }

  const entries: ReportEntry[] = [];

  for (const node of graph.nodes.values()) {
    const vulnResult = vulnMap.get(node.id);
    const entry: ReportEntry = {
      name: node.name,
      version: node.version,
      id: node.id,
      depth: node.depth,
      license: node.license,
      licenseCategory: node.licenseCategory,
      vulnerabilities: (vulnResult?.vulnerabilities ?? []).map((v) => ({
        id: v.id,
        summary: v.summary ?? "No description",
        severity: extractSeverity(v),
        aliases: v.aliases ?? [],
      })),
    };

    // Attach optional per-entry data
    const advisories = options?.advisories?.get(node.id) ?? vulnResult?.advisories;
    if (advisories && advisories.length > 0) {
      entry.advisories = advisories;
    }
    if (options?.trustScores?.has(node.id)) {
      entry.trustScore = options.trustScores.get(node.id);
    }
    if (options?.freshnessReports?.has(node.id)) {
      entry.freshness = options.freshnessReports.get(node.id);
    }
    if (options?.enhancedLicenses?.has(node.id)) {
      entry.enhancedLicense = options.enhancedLicenses.get(node.id);
    }
    const provenance = options?.provenanceResults?.find((result) => result.packageId === node.id);
    if (provenance) {
      entry.provenance = provenance;
    }

    entries.push(entry);
  }

  // Sort by depth, then name
  entries.sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));

  const summary = buildSummary(entries);
  const rootNode = graph.nodes.get(graph.root);

  // Build context notes for copyleft/weak-copyleft licenses
  const allLicenses = entries.map((e) => e.license).filter((l): l is string => l !== null);
  const contextNotes = getContextNotes(allLicenses);

  const report: Report = {
    root: graph.root,
    totalPackages: entries.length,
    directDependencies: rootNode?.dependencies.size ?? 0,
    maxDepth: Math.max(...entries.map((e) => e.depth)),
    entries,
    summary,
    contextNotes:
      contextNotes.length > 0
        ? contextNotes.map((cn) => ({ license: cn.license, note: cn.note }))
        : undefined,
  };

  // Add optional security and license data
  if (options?.securitySignals) {
    report.securitySignals = options.securitySignals;
  }
  if (options?.securitySummary) {
    report.securitySummary = options.securitySummary;
  }
  if (options?.contaminationPaths) {
    report.contaminationPaths = options.contaminationPaths;
  }
  if (options?.licenseIncompatibilities) {
    report.licenseIncompatibilities = options.licenseIncompatibilities;
  }
  if (options?.phantomDeps && options.phantomDeps.length > 0) {
    report.phantomDeps = options.phantomDeps;
  }
  if (options?.provenanceResults && options.provenanceResults.length > 0) {
    report.provenanceResults = options.provenanceResults;
  }
  if (options?.pinningReport) {
    report.pinningReport = options.pinningReport;
  }
  if (options?.deepLicenseMismatches && options.deepLicenseMismatches.length > 0) {
    report.deepLicenseMismatches = options.deepLicenseMismatches;
  }

  return report;
}

function buildSummary(entries: ReportEntry[]): ReportSummary {
  const licenseCounts = {
    permissive: 0,
    copyleft: 0,
    "weak-copyleft": 0,
    unknown: 0,
  };

  let vulnerabilityCount = 0;
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  for (const entry of entries) {
    licenseCounts[entry.licenseCategory]++;
    for (const vuln of entry.vulnerabilities) {
      vulnerabilityCount++;
      const sev = vuln.severity?.toUpperCase() ?? "";
      if (sev === "CRITICAL") criticalCount++;
      else if (sev === "HIGH") highCount++;
      else if (sev === "MEDIUM") mediumCount++;
      else if (sev === "LOW") lowCount++;
    }
  }

  return {
    licenseCounts,
    vulnerabilityCount,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
  };
}

function extractSeverity(vuln: VulnerabilityResult["vulnerabilities"][0]): string | null {
  // Try CVSS score from severity array
  if (vuln.severity && vuln.severity.length > 0) {
    for (const s of vuln.severity) {
      if (s.type === "CVSS_V3" || s.type === "CVSS_V4") {
        const score = parseCvssScore(s.score);
        if (score !== null) return cvssToSeverity(score);
      }
    }
  }

  // Try database_specific severity
  if (vuln.database_specific) {
    const sev = vuln.database_specific.severity;
    if (typeof sev === "string") return sev.toUpperCase();
  }

  return null;
}

function parseCvssScore(vector: string): number | null {
  const num = parseFloat(vector);
  if (!Number.isNaN(num)) return num;
  return null;
}

function cvssToSeverity(score: number): string {
  if (score >= 9.0) return "CRITICAL";
  if (score >= 7.0) return "HIGH";
  if (score >= 4.0) return "MEDIUM";
  return "LOW";
}
