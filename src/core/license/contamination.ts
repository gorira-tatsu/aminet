import type { DependencyGraph, LicenseCategory } from "../graph/types.js";

export interface ContaminationPath {
  targetId: string;
  targetLicense: string;
  path: string[];
  depth: number;
}

export interface ContaminationReport {
  paths: ContaminationPath[];
  affectedPackageCount: number;
}

const MAX_PATHS_PER_NODE = 3;

export function traceContaminationPaths(
  graph: DependencyGraph,
  categories: LicenseCategory[] = ["copyleft"],
): ContaminationReport {
  const paths: ContaminationPath[] = [];
  const affectedNodes = new Set<string>();

  // Build adjacency list from edges
  const children = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!children.has(edge.from)) {
      children.set(edge.from, []);
    }
    children.get(edge.from)!.push(edge.to);
  }

  // DFS from root
  const pathCounts = new Map<string, number>();

  function dfs(nodeId: string, currentPath: string[]): void {
    const node = graph.nodes.get(nodeId);
    if (!node) return;

    const pathWithCurrent = [...currentPath, node.id];

    // Check if this node has a copyleft license
    if (categories.includes(node.licenseCategory) && node.depth > 0) {
      const count = pathCounts.get(nodeId) ?? 0;
      if (count < MAX_PATHS_PER_NODE) {
        paths.push({
          targetId: node.id,
          targetLicense: node.license ?? "UNKNOWN",
          path: pathWithCurrent,
          depth: node.depth,
        });
        pathCounts.set(nodeId, count + 1);
        affectedNodes.add(nodeId);
      }
    }

    // Continue DFS to find deeper copyleft nodes
    const nodeChildren = children.get(nodeId) ?? [];
    for (const childId of nodeChildren) {
      // Avoid cycles
      if (currentPath.includes(childId)) continue;
      dfs(childId, pathWithCurrent);
    }
  }

  dfs(graph.root, []);

  return {
    paths,
    affectedPackageCount: affectedNodes.size,
  };
}
