import { mapConcurrent } from "../../utils/concurrency.js";
import { logger } from "../../utils/logger.js";
import type { FreshnessReport } from "../freshness/analyzer.js";
import { analyzeFreshness } from "../freshness/analyzer.js";
import type { DependencyGraph, PackageNode } from "../graph/types.js";
import { checkTreeCompatibility } from "../license/compatibility.js";
import { traceContaminationPaths } from "../license/contamination.js";
import { checkEnhancedLicenses } from "../license/enhanced-checker.js";
import { extractLicenseFiles } from "../license/tarball-checker.js";
import type { PhantomDependency } from "../phantom/scanner.js";
import type { PinningReport } from "../pinning/analyzer.js";
import type { ProvenanceResult } from "../provenance/checker.js";
import { checkProvenance, provenanceToSignal } from "../provenance/checker.js";
import { getPackument } from "../registry/npm-client.js";
import type { NpmPackument } from "../registry/types.js";
import type { BuildReportOptions } from "../report/builder.js";
import type { DeepLicenseMismatch } from "../report/types.js";
import { scanSecuritySignals } from "../security/scanner.js";
import { cacheTrustScore, getCachedTrustScore } from "../store/trust-store.js";
import { buildTrustInput } from "../trust/collector.js";
import { fetchDepsdevBatch } from "../trust/depsdev-client.js";
import { fetchWeeklyDownloadsBatch } from "../trust/npm-downloads-client.js";
import { computeTrustScore } from "../trust/scorer.js";
import type { TrustScore } from "../trust/types.js";

export interface PhaseRunnerOptions {
  concurrency?: number;
  noCache?: boolean;
  security?: boolean;
  licenseReport?: boolean;
  enhancedLicense?: boolean;
  trustScore?: boolean;
  freshness?: boolean;
  provenance?: boolean;
  minTrustScore?: number;
  deepLicenseCheck?: boolean;
}

export interface PhaseRunnerResult {
  reportOptions: BuildReportOptions;
  sharedPackuments: Map<string, NpmPackument>;
  lowTrustCount: number;
}

interface ExtraPhaseData {
  phantomDeps?: PhantomDependency[];
  pinningReport?: PinningReport;
}

export async function runAnalysisPhases(
  graph: DependencyGraph,
  options: PhaseRunnerOptions,
  extra?: ExtraPhaseData,
): Promise<PhaseRunnerResult> {
  const reportOptions: BuildReportOptions = {};
  const sharedPackuments = await collectSharedPackuments(graph, options);
  let lowTrustCount = 0;

  if (options.security) {
    const securityResult = await scanSecuritySignals(graph, sharedPackuments);
    reportOptions.securitySignals = securityResult.signals;
    reportOptions.securitySummary = securityResult.summary;
  }

  if (options.licenseReport) {
    const contamination = traceContaminationPaths(graph);
    if (contamination.paths.length > 0) {
      reportOptions.contaminationPaths = contamination.paths;
    }

    const incompatible = checkTreeCompatibility(graph);
    if (incompatible.length > 0) {
      reportOptions.licenseIncompatibilities = incompatible;
    }
  }

  if (options.enhancedLicense) {
    const result = await checkEnhancedLicenses(graph, !options.noCache);
    if (result.results.size > 0) {
      reportOptions.enhancedLicenses = result.results;
    }
  }

  if (options.trustScore) {
    const trustResult = await runTrustPhase(graph, options, sharedPackuments);
    reportOptions.trustScores = trustResult.trustScores;
    lowTrustCount = trustResult.lowTrustCount;
  }

  if (options.freshness) {
    reportOptions.freshnessReports = runFreshnessPhase(graph, sharedPackuments);
  }

  if (options.provenance) {
    const provenanceResults = runProvenancePhase(
      graph,
      sharedPackuments,
      reportOptions.securitySignals,
    );
    reportOptions.provenanceResults = provenanceResults;
  }

  if (options.deepLicenseCheck) {
    const deepLicenseMismatches = await runDeepLicenseCheckPhase(graph);
    if (deepLicenseMismatches.length > 0) {
      reportOptions.deepLicenseMismatches = deepLicenseMismatches;
    }
  }

  if (extra?.phantomDeps && extra.phantomDeps.length > 0) {
    reportOptions.phantomDeps = extra.phantomDeps;
  }
  if (extra?.pinningReport) {
    reportOptions.pinningReport = extra.pinningReport;
  }

  return { reportOptions, sharedPackuments, lowTrustCount };
}

async function runTrustPhase(
  graph: DependencyGraph,
  options: PhaseRunnerOptions,
  sharedPackuments: Map<string, NpmPackument>,
): Promise<{ trustScores: Map<string, TrustScore>; lowTrustCount: number }> {
  const trustScores = new Map<string, TrustScore>();
  let lowTrustCount = 0;
  const uncachedNodes: PackageNode[] = [];

  for (const node of graph.nodes.values()) {
    if (node.depth === 0) continue;

    const cached = getCachedTrustScore(node.name, node.version);
    if (cached) {
      trustScores.set(node.id, cached);
      if (cached.overall < (options.minTrustScore ?? 0)) lowTrustCount++;
      continue;
    }

    uncachedNodes.push(node);
  }

  if (uncachedNodes.length === 0) {
    return { trustScores, lowTrustCount };
  }

  const downloadsMap = await fetchWeeklyDownloadsBatch(uncachedNodes.map((node) => node.name));
  const depsdevMap = await fetchDepsdevBatch(
    uncachedNodes.map((node) => ({ name: node.name, version: node.version })),
  );

  for (const node of uncachedNodes) {
    const packument = sharedPackuments.get(node.name);
    if (!packument) {
      logger.debug(`Trust score skipped for ${node.id}: packument unavailable`);
      continue;
    }

    const score = computeTrustScore(
      buildTrustInput(node.name, node.version, packument, {
        weeklyDownloads: downloadsMap.get(node.name) ?? null,
        depsdev: depsdevMap.get(node.id) ?? null,
      }),
    );
    trustScores.set(node.id, score);
    cacheTrustScore(node.name, node.version, score);
    if (score.overall < (options.minTrustScore ?? 0)) lowTrustCount++;
  }

  return { trustScores, lowTrustCount };
}

function runFreshnessPhase(
  graph: DependencyGraph,
  sharedPackuments: Map<string, NpmPackument>,
): Map<string, FreshnessReport> {
  const freshnessReports = new Map<string, FreshnessReport>();

  for (const node of graph.nodes.values()) {
    if (node.depth === 0) continue;

    const packument = sharedPackuments.get(node.name);
    if (!packument) {
      logger.debug(`Freshness check skipped for ${node.id}: packument unavailable`);
      continue;
    }

    freshnessReports.set(node.id, analyzeFreshness(node.name, node.version, packument));
  }

  return freshnessReports;
}

function runProvenancePhase(
  graph: DependencyGraph,
  sharedPackuments: Map<string, NpmPackument>,
  securitySignals?: BuildReportOptions["securitySignals"],
): ProvenanceResult[] {
  const provenanceResults: ProvenanceResult[] = [];

  for (const node of graph.nodes.values()) {
    if (node.depth === 0) continue;

    const packument = sharedPackuments.get(node.name);
    if (!packument) {
      logger.debug(`Provenance check skipped for ${node.id}: packument unavailable`);
      continue;
    }

    const result = checkProvenance(node.name, node.version, packument);
    provenanceResults.push(result);
    const signal = provenanceToSignal(result);
    if (signal && securitySignals) {
      securitySignals.push(signal);
    }
  }

  return provenanceResults;
}

async function runDeepLicenseCheckPhase(graph: DependencyGraph): Promise<DeepLicenseMismatch[]> {
  const mismatches: DeepLicenseMismatch[] = [];

  for (const node of graph.nodes.values()) {
    if (node.depth === 0) continue;

    try {
      const packument = await getPackument(node.name);
      const versionInfo = packument.versions?.[node.version];
      if (!versionInfo?.dist?.tarball) continue;

      const result = await extractLicenseFiles(versionInfo.dist.tarball);
      if (!result.detectedLicense || !node.license) continue;
      if (result.detectedLicense === node.license) continue;
      if (isLicenseVariant(node.license, result.detectedLicense)) continue;

      mismatches.push({
        packageId: node.id,
        declared: node.license,
        detected: result.detectedLicense,
      });
    } catch {
      logger.debug(`Deep license check failed for ${node.id}`);
    }
  }

  return mismatches;
}

function isLicenseVariant(declared: string, detected: string): boolean {
  const normalize = (value: string) => value.replace(/-only$/, "").replace(/-or-later$/, "");
  return normalize(declared) === normalize(detected);
}

function needsSharedPackuments(options: PhaseRunnerOptions): boolean {
  return Boolean(options.security || options.trustScore || options.freshness || options.provenance);
}

async function collectSharedPackuments(
  graph: DependencyGraph,
  options: PhaseRunnerOptions,
): Promise<Map<string, NpmPackument>> {
  if (!needsSharedPackuments(options)) {
    return new Map();
  }

  const uniqueNames = [
    ...new Set([...graph.nodes.values()].filter((node) => node.depth > 0).map((node) => node.name)),
  ];
  if (uniqueNames.length === 0) {
    return new Map();
  }

  const packumentConcurrency = Math.max(1, options.concurrency ?? 10);
  const packumentEntries = await mapConcurrent(uniqueNames, packumentConcurrency, async (name) => {
    try {
      return [name, await getPackument(name)] as const;
    } catch (error) {
      logger.debug(
        `Packument fetch failed for ${name}: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  });

  return new Map(
    packumentEntries.filter(
      (entry): entry is readonly [string, Awaited<ReturnType<typeof getPackument>>] =>
        entry !== null,
    ),
  );
}
