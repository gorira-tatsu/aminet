import chalk from "chalk";
import type { DependencyGraph } from "../../core/graph/types.js";
import type { VulnerabilityResult } from "../../core/vulnerability/types.js";

export function renderTree(graph: DependencyGraph, vulnerabilities: VulnerabilityResult[]): void {
  const vulnMap = new Map<string, VulnerabilityResult>();
  for (const v of vulnerabilities) {
    vulnMap.set(v.packageId, v);
  }

  const rootNode = graph.nodes.get(graph.root);
  if (!rootNode) {
    console.log("No root node found.");
    return;
  }

  console.log(formatNodeLabel(graph.root, rootNode.license, vulnMap));
  printChildren(graph, graph.root, "", vulnMap);
}

function printChildren(
  graph: DependencyGraph,
  parentId: string,
  prefix: string,
  vulnMap: Map<string, VulnerabilityResult>,
): void {
  const parentNode = graph.nodes.get(parentId);
  if (!parentNode) return;

  const deps = Array.from(parentNode.dependencies.keys());
  const visited = new Set<string>();

  for (let i = 0; i < deps.length; i++) {
    const depName = deps[i];
    const isLast = i === deps.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";

    // Find the resolved node for this dependency
    const childNode = findChildNode(graph, parentId, depName);
    if (!childNode) continue;

    const isCircular = visited.has(childNode.id);
    visited.add(childNode.id);

    const label = formatNodeLabel(childNode.id, childNode.license, vulnMap);
    const circularMarker = isCircular ? chalk.yellow(" [circular]") : "";

    console.log(`${prefix}${connector}${label}${circularMarker}`);

    if (!isCircular && childNode.dependencies.size > 0) {
      printChildren(graph, childNode.id, prefix + childPrefix, vulnMap);
    }
  }
}

function findChildNode(graph: DependencyGraph, parentId: string, depName: string) {
  // Find the edge from parent to a child with this name
  for (const edge of graph.edges) {
    if (edge.from === parentId && edge.to.startsWith(`${depName}@`)) {
      return graph.nodes.get(edge.to);
    }
  }
  // Fallback: look in nodes
  for (const [_id, node] of graph.nodes) {
    if (node.name === depName && node.parents.has(parentId)) {
      return node;
    }
  }
  return null;
}

function formatNodeLabel(
  id: string,
  license: string | null,
  vulnMap: Map<string, VulnerabilityResult>,
): string {
  const vuln = vulnMap.get(id);
  let label = chalk.white(id);

  if (license) {
    label += chalk.gray(` [${license}]`);
  }

  if (vuln && vuln.vulnerabilities.length > 0) {
    const count = vuln.vulnerabilities.length;
    label += chalk.red(` (${count} vuln${count > 1 ? "s" : ""})`);
  }

  return label;
}
