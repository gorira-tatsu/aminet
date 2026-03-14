import { Semaphore } from "../../utils/concurrency.js";
import { logger } from "../../utils/logger.js";
import { extractLicense } from "../license/checker.js";
import { getPackument } from "../registry/npm-client.js";
import { cachePackage, getCachedPackage } from "../store/package-store.js";
import { resolveVersion } from "./semver-resolver.js";
import type { DependencyEdge, DependencyGraph, PackageNode } from "./types.js";

export interface ResolverOptions {
  maxDepth?: number;
  concurrency?: number;
  includeDev?: boolean;
}

interface QueueItem {
  name: string;
  versionRange: string;
  depth: number;
  parentId: string | null;
}

export async function resolveDependencyGraph(
  rootName: string,
  rootVersionRange: string,
  options: ResolverOptions = {},
  onProgress?: (resolved: number, pending: number) => void,
): Promise<DependencyGraph> {
  const { maxDepth = Infinity, concurrency = 5, includeDev = false } = options;

  const nodes = new Map<string, PackageNode>();
  const edges: DependencyEdge[] = [];
  const semaphore = new Semaphore(concurrency);

  // Resolve root version first
  const rootPackument = await getPackument(rootName);
  const rootVersion = resolveVersion(rootPackument, rootVersionRange);
  if (!rootVersion) {
    throw new Error(`Could not resolve version for ${rootName}@${rootVersionRange}`);
  }

  const rootVersionInfo = rootPackument.versions[rootVersion];
  if (!rootVersionInfo) {
    throw new Error(`Version info not found for ${rootName}@${rootVersion}`);
  }

  const rootId = `${rootName}@${rootVersion}`;
  const rootLicense = extractLicense(rootVersionInfo);

  const rootDeps = new Map<string, string>();
  if (rootVersionInfo.dependencies) {
    for (const [name, range] of Object.entries(rootVersionInfo.dependencies)) {
      rootDeps.set(name, range);
    }
  }
  if (includeDev && rootVersionInfo.devDependencies) {
    for (const [name, range] of Object.entries(rootVersionInfo.devDependencies)) {
      rootDeps.set(name, range);
    }
  }

  const rootNode: PackageNode = {
    id: rootId,
    name: rootName,
    version: rootVersion,
    license: rootLicense.spdxId,
    licenseCategory: rootLicense.category,
    depth: 0,
    parents: new Set(),
    dependencies: rootDeps,
  };
  nodes.set(rootId, rootNode);

  // Cache root package
  cachePackage({
    name: rootName,
    version: rootVersion,
    license: rootLicense.spdxId,
    licenseCategory: rootLicense.category,
    dependencies: Object.fromEntries(rootDeps),
    tarballUrl: rootVersionInfo.dist?.tarball,
    integrity: rootVersionInfo.dist?.integrity,
  });

  // BFS queue
  const queue: QueueItem[] = [];
  for (const [depName, depRange] of rootDeps) {
    queue.push({
      name: depName,
      versionRange: depRange,
      depth: 1,
      parentId: rootId,
    });
  }

  let resolvedCount = 0;

  // Process queue with concurrency control
  while (queue.length > 0) {
    const batch = queue.splice(0, Math.min(queue.length, concurrency * 2));

    const newItems = await Promise.all(
      batch.map((item) =>
        semaphore.run(async () => {
          try {
            return await processQueueItem(item, nodes, edges, maxDepth, includeDev);
          } catch (error) {
            logger.warn(`Failed to resolve ${item.name}@${item.versionRange}: ${error}`);
            return [];
          }
        }),
      ),
    );

    for (const items of newItems) {
      queue.push(...items);
    }

    resolvedCount += batch.length;
    onProgress?.(resolvedCount, queue.length);
  }

  return { root: rootId, nodes, edges };
}

async function processQueueItem(
  item: QueueItem,
  nodes: Map<string, PackageNode>,
  edges: DependencyEdge[],
  maxDepth: number,
  _includeDev: boolean,
): Promise<QueueItem[]> {
  const { name, versionRange, depth, parentId } = item;

  // Skip URL/git dependencies
  if (
    versionRange.startsWith("http") ||
    versionRange.startsWith("git") ||
    versionRange.includes("://")
  ) {
    return [];
  }

  // Try SQLite cache first (avoids packument fetch entirely)
  let resolvedVersion: string | null = null;
  let cachedPkg = null;

  // We still need to resolve the version from packument to know the exact version
  let packument: Awaited<ReturnType<typeof getPackument>>;
  try {
    packument = await getPackument(name);
  } catch {
    logger.warn(`Could not fetch packument for ${name}`);
    return [];
  }

  resolvedVersion = resolveVersion(packument, versionRange);
  if (!resolvedVersion) {
    logger.warn(`Could not resolve ${name}@${versionRange}`);
    return [];
  }

  const nodeId = `${name}@${resolvedVersion}`;

  // Add edge
  if (parentId) {
    edges.push({ from: parentId, to: nodeId, versionRange });
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

  // Check package cache (immutable - no TTL)
  cachedPkg = getCachedPackage(name, resolvedVersion);
  if (cachedPkg) {
    const deps = new Map(Object.entries(cachedPkg.dependencies));
    const node: PackageNode = {
      id: nodeId,
      name,
      version: resolvedVersion,
      license: cachedPkg.license,
      licenseCategory: cachedPkg.licenseCategory,
      depth,
      parents: new Set(parentId ? [parentId] : []),
      dependencies: deps,
    };
    nodes.set(nodeId, node);

    if (depth >= maxDepth) return [];

    return Array.from(deps.entries()).map(([depName, depRange]) => ({
      name: depName,
      versionRange: depRange,
      depth: depth + 1,
      parentId: nodeId,
    }));
  }

  const versionInfo = packument.versions[resolvedVersion];
  if (!versionInfo) {
    return [];
  }

  const license = extractLicense(versionInfo);

  const deps = new Map<string, string>();
  if (versionInfo.dependencies) {
    for (const [depName, range] of Object.entries(versionInfo.dependencies)) {
      deps.set(depName, range);
    }
  }

  const node: PackageNode = {
    id: nodeId,
    name,
    version: resolvedVersion,
    license: license.spdxId,
    licenseCategory: license.category,
    depth,
    parents: new Set(parentId ? [parentId] : []),
    dependencies: deps,
  };
  nodes.set(nodeId, node);

  // Cache the resolved package (immutable)
  cachePackage({
    name,
    version: resolvedVersion,
    license: license.spdxId,
    licenseCategory: license.category,
    dependencies: Object.fromEntries(deps),
    tarballUrl: versionInfo.dist?.tarball,
    integrity: versionInfo.dist?.integrity,
  });

  if (depth >= maxDepth) {
    return [];
  }

  return Array.from(deps.entries()).map(([depName, depRange]) => ({
    name: depName,
    versionRange: depRange,
    depth: depth + 1,
    parentId: nodeId,
  }));
}
