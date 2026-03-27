import { isExcludedPackage } from "../utils/exclude.js";
import { logger } from "../utils/logger.js";
import { runAnalysisPhases } from "./analysis/phases.js";
import { resolvePythonDependencyGraph } from "./graph/py-resolver.js";
import { resolveDependencyGraph } from "./graph/resolver.js";
import type { DependencyEdge, DependencyGraph, PackageNode } from "./graph/types.js";
import { buildReport } from "./report/builder.js";
import type { Report } from "./report/types.js";
import { scanVulnerabilities } from "./vulnerability/scanner.js";
import type { VulnerabilityResult } from "./vulnerability/types.js";

export interface AnalyzerOptions {
  depth?: number;
  concurrency?: number;
  dev?: boolean;
  noCache?: boolean;
  security?: boolean;
  licenseReport?: boolean;
  enhancedLicense?: boolean;
  trustScore?: boolean;
  freshness?: boolean;
  provenance?: boolean;
  minTrustScore?: number;
  deepLicenseCheck?: boolean;
  excludePackages?: string[];
  ecosystem?: "npm" | "pypi";
}

export interface AnalysisResult {
  graph: DependencyGraph;
  vulnerabilities: VulnerabilityResult[];
  report: Report;
}

export async function buildReportForPackageSpec(
  name: string,
  versionRange: string,
  options: AnalyzerOptions,
): Promise<AnalysisResult> {
  const ecosystem = options.ecosystem ?? "npm";
  const osvEcosystem = ecosystem === "pypi" ? "PyPI" : "npm";

  const graph =
    ecosystem === "pypi"
      ? await resolvePythonDependencyGraph(name, versionRange, {
          maxDepth: options.depth,
          concurrency: options.concurrency ?? 5,
        })
      : await resolveDependencyGraph(name, versionRange, {
          maxDepth: options.depth,
          concurrency: options.concurrency ?? 5,
        });

  const vulnerabilities = await scanVulnerabilities(
    graph,
    options.concurrency ?? 5,
    !options.noCache,
    undefined,
    osvEcosystem,
  ).catch(() => [] as VulnerabilityResult[]);

  const { reportOptions } = await runAnalysisPhases(graph, options).catch(() => ({
    reportOptions: {},
    sharedPackuments: new Map(),
    lowTrustCount: 0,
  }));

  const report = buildReport(graph, vulnerabilities, reportOptions);
  return { graph, vulnerabilities, report };
}

export async function buildReportFromPackageJson(
  pkg: {
    name?: string;
    version?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  },
  options: AnalyzerOptions,
): Promise<AnalysisResult> {
  const allDeps: Record<string, string> = {
    ...(pkg.dependencies ?? {}),
    ...(options.dev ? (pkg.devDependencies ?? {}) : {}),
  };

  const excludeList = options.excludePackages ?? [];
  const depEntries = Object.entries(allDeps).filter(([name]) => {
    if (excludeList.length === 0) return true;
    return !isExcludedPackage(name, excludeList);
  });
  const rootId = pkg.name ? `${pkg.name}@${pkg.version ?? "0.0.0"}` : "root@0.0.0";

  // Create virtual root node
  const allNodes = new Map<string, PackageNode>();
  const allEdges: DependencyEdge[] = [];
  const rootDeps = new Map(depEntries.map(([n, v]) => [n, v]));

  allNodes.set(rootId, {
    id: rootId,
    name: pkg.name ?? "root",
    version: pkg.version ?? "0.0.0",
    license: null,
    licenseCategory: "unknown",
    depth: 0,
    parents: new Set(),
    dependencies: rootDeps,
  });

  let _resolvedCount = 0;
  let _skippedCount = 0;

  const resolveGraph =
    (options.ecosystem ?? "npm") === "pypi" ? resolvePythonDependencyGraph : resolveDependencyGraph;

  for (const [depName, depRange] of depEntries) {
    try {
      const graph = await resolveGraph(depName, depRange, {
        maxDepth: options.depth,
        concurrency: options.concurrency ?? 5,
      });

      for (const [id, node] of graph.nodes) {
        if (!allNodes.has(id)) {
          node.depth += 1;
          allNodes.set(id, node);
        }
      }
      for (const edge of graph.edges) {
        allEdges.push(edge);
      }
      allEdges.push({ from: rootId, to: graph.root, versionRange: depRange });
      _resolvedCount++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("not found")) {
        logger.warn(`Skipping private/unavailable package: ${depName}`);
      } else {
        logger.warn(`Failed to resolve ${depName}: ${msg}`);
      }
      _skippedCount++;
    }
  }

  const graph: DependencyGraph = {
    root: rootId,
    nodes: allNodes,
    edges: allEdges,
  };

  const ecosystem = options.ecosystem ?? "npm";
  const osvEcosystem = ecosystem === "pypi" ? "PyPI" : "npm";

  const vulnerabilities = await scanVulnerabilities(
    graph,
    options.concurrency ?? 5,
    !options.noCache,
    undefined,
    osvEcosystem,
  ).catch(() => [] as VulnerabilityResult[]);

  const { reportOptions } = await runAnalysisPhases(graph, options).catch(() => ({
    reportOptions: {},
    sharedPackuments: new Map(),
    lowTrustCount: 0,
  }));

  const report = buildReport(graph, vulnerabilities, reportOptions);

  return { graph, vulnerabilities, report };
}
