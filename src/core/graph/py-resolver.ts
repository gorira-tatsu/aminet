import { Semaphore } from "../../utils/concurrency.js";
import { logger } from "../../utils/logger.js";
import { classifyLicense } from "../license/spdx.js";
import { extractLicenseFromPyPI, getPyPIPackage, parsePep508 } from "../registry/pypi-client.js";
import type { DependencyEdge, DependencyGraph, PackageNode } from "./types.js";

interface QueueItem {
  name: string;
  versionSpec: string;
  depth: number;
  parentId: string | null;
}

function isDirectReferenceSpec(versionSpec: string): boolean {
  return /^\s*@\s*\S+/.test(versionSpec);
}

function shouldFetchExactVersion(versionSpec: string): string | null {
  const normalized = versionSpec.trim();
  if (normalized === "" || normalized.toLowerCase() === "latest") {
    return null;
  }

  const pinnedMatch = normalized.match(/^==\s*(.+)$/);
  if (pinnedMatch) {
    return pinnedMatch[1].trim();
  }

  if (isDirectReferenceSpec(normalized) || /[<>=!^~*,]/.test(normalized)) {
    return null;
  }

  return normalized;
}

/**
 * Resolve a Python dependency graph starting from a root package using BFS.
 *
 * Fetches package metadata from PyPI, parses `requires_dist` for transitive
 * dependencies, and builds a full dependency graph. Environment-marker-only
 * dependencies are skipped.
 */
export async function resolvePythonDependencyGraph(
  rootName: string,
  rootVersion: string,
  options?: {
    maxDepth?: number;
    concurrency?: number;
  },
): Promise<DependencyGraph> {
  const maxDepth = options?.maxDepth ?? Infinity;
  const concurrency = options?.concurrency ?? 5;

  const nodes = new Map<string, PackageNode>();
  const edges: DependencyEdge[] = [];
  const semaphore = new Semaphore(concurrency);

  const exactRootVersion = shouldFetchExactVersion(rootVersion);
  const rootPkg = exactRootVersion
    ? await getPyPIPackage(rootName, exactRootVersion)
    : await getPyPIPackage(rootName);
  const rootId = `${rootPkg.info.name}@${rootPkg.info.version}`;

  const rootLicenseRaw = extractLicenseFromPyPI(rootPkg.info);
  const rootLicense = rootLicenseRaw ?? "UNKNOWN";
  const rootLicenseCategory = classifyLicense(rootLicense);

  // Parse root dependencies from requires_dist
  const rootDeps = parseDependencies(rootPkg.info.requires_dist);

  const rootNode: PackageNode = {
    id: rootId,
    name: rootPkg.info.name,
    version: rootPkg.info.version,
    license: rootLicenseRaw,
    licenseCategory: rootLicenseCategory,
    depth: 0,
    parents: new Set(),
    dependencies: rootDeps,
  };
  nodes.set(rootId, rootNode);

  // Seed BFS queue with root dependencies
  const queue: QueueItem[] = [];
  for (const [depName, depSpec] of rootDeps) {
    queue.push({
      name: depName,
      versionSpec: depSpec,
      depth: 1,
      parentId: rootId,
    });
  }

  // BFS with concurrency control
  while (queue.length > 0) {
    const batch = queue.splice(0, Math.min(queue.length, concurrency * 2));

    const newItems = await Promise.all(
      batch.map((item) =>
        semaphore.run(async () => {
          try {
            return await processQueueItem(item, nodes, edges, maxDepth);
          } catch (error) {
            logger.warn(
              `Failed to resolve Python package ${item.name}@${item.versionSpec}: ${error}`,
            );
            return [];
          }
        }),
      ),
    );

    for (const items of newItems) {
      queue.push(...items);
    }
  }

  return { root: rootId, nodes, edges };
}

async function processQueueItem(
  item: QueueItem,
  nodes: Map<string, PackageNode>,
  edges: DependencyEdge[],
  maxDepth: number,
): Promise<QueueItem[]> {
  const { name, versionSpec, depth, parentId } = item;

  // Determine whether to fetch a specific version or latest
  if (isDirectReferenceSpec(versionSpec)) {
    logger.warn(`Skipping direct-reference dependency for ${name}: ${versionSpec}`);
    return [];
  }

  const exactVersion = shouldFetchExactVersion(versionSpec);
  let pkg: Awaited<ReturnType<typeof getPyPIPackage>>;
  if (exactVersion) {
    pkg = await getPyPIPackage(name, exactVersion);
  } else {
    if (versionSpec.trim() !== "") {
      logger.debug(
        `Non-exact specifier "${versionSpec}" for ${name}, fetching latest as best-effort`,
      );
    }
    pkg = await getPyPIPackage(name);
  }

  const nodeId = `${pkg.info.name}@${pkg.info.version}`;

  // Add edge
  if (parentId) {
    edges.push({ from: parentId, to: nodeId, versionRange: versionSpec });
  }

  // Already visited - just update parent and return
  if (nodes.has(nodeId)) {
    const existing = nodes.get(nodeId)!;
    if (parentId) existing.parents.add(parentId);
    if (depth < existing.depth) {
      existing.depth = depth;
    }
    return [];
  }

  const licenseRaw = extractLicenseFromPyPI(pkg.info);
  const license = licenseRaw ?? "UNKNOWN";
  const licenseCategory = classifyLicense(license);

  const deps = parseDependencies(pkg.info.requires_dist);

  const node: PackageNode = {
    id: nodeId,
    name: pkg.info.name,
    version: pkg.info.version,
    license: licenseRaw,
    licenseCategory,
    depth,
    parents: new Set(parentId ? [parentId] : []),
    dependencies: deps,
  };
  nodes.set(nodeId, node);

  if (depth >= maxDepth) {
    return [];
  }

  return Array.from(deps.entries()).map(([depName, depSpec]) => ({
    name: depName,
    versionSpec: depSpec,
    depth: depth + 1,
    parentId: nodeId,
  }));
}

/**
 * Parse requires_dist entries into a dependency map.
 * Skips dependencies that have environment markers.
 */
function parseDependencies(requiresDist: string[] | null): Map<string, string> {
  const deps = new Map<string, string>();
  if (!requiresDist) return deps;

  for (const spec of requiresDist) {
    const parsed = parsePep508(spec);
    if (!parsed) continue;

    if (parsed.hasMarker) {
      logger.debug(`Skipping dependency with environment marker: ${spec}`);
      continue;
    }

    deps.set(parsed.name, parsed.versionSpec);
  }

  return deps;
}
