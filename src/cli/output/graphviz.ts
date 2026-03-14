import type { DependencyGraph } from "../../core/graph/types.js";
import type { VulnerabilityResult } from "../../core/vulnerability/types.js";

export function renderGraphviz(
  graph: DependencyGraph,
  vulnerabilities: VulnerabilityResult[],
): void {
  const vulnMap = new Map<string, number>();
  for (const v of vulnerabilities) {
    vulnMap.set(v.packageId, v.vulnerabilities.length);
  }

  const lines: string[] = [];
  lines.push("digraph dependencies {");
  lines.push("  rankdir=LR;");
  lines.push('  node [shape=box, style=filled, fontname="Helvetica"];');
  lines.push("");

  // Nodes
  for (const node of graph.nodes.values()) {
    const vulnCount = vulnMap.get(node.id) ?? 0;
    const fillColor = getNodeColor(node.licenseCategory, vulnCount);
    const licenseLabel = formatLicenseLabel(node.license);
    const vulnLabel = vulnCount > 0 ? `\\n⚠ ${vulnCount} vuln${vulnCount > 1 ? "s" : ""}` : "";

    const escapedId = escapeLabel(node.id);
    lines.push(
      `  "${escapedId}" [fillcolor="${fillColor}", label="${escapedId}\\n${escapeLabel(licenseLabel)}${vulnLabel}"];`,
    );
  }

  lines.push("");

  // Layered grouping by depth (rank=same)
  const depthGroups = new Map<number, string[]>();
  for (const node of graph.nodes.values()) {
    const group = depthGroups.get(node.depth) ?? [];
    group.push(node.id);
    depthGroups.set(node.depth, group);
  }

  const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => a - b);
  for (const depth of sortedDepths) {
    const nodeIds = depthGroups.get(depth)!;
    const quoted = nodeIds.map((id) => `"${escapeLabel(id)}"`).join("; ");
    lines.push(`  // Layer ${depth}`);
    lines.push(`  { rank=same; ${quoted}; }`);
  }

  lines.push("");

  // Edges
  for (const edge of graph.edges) {
    lines.push(`  "${escapeLabel(edge.from)}" -> "${escapeLabel(edge.to)}";`);
  }

  lines.push("}");

  console.log(lines.join("\n"));
}

function formatLicenseLabel(license: string | null): string {
  if (!license) return "UNKNOWN";

  // For compound expressions, annotate with resolved category
  if (license.includes(" OR ") || license.includes(" AND ")) {
    return license;
  }
  return license;
}

function getNodeColor(category: string, vulnCount: number): string {
  if (vulnCount > 0) return "#FF6B6B";
  if (category === "copyleft") return "#FF6B6B";
  if (category === "weak-copyleft" || category === "unknown") return "#FFD93D";
  return "#90EE90";
}

function escapeLabel(s: string): string {
  return s.replace(/"/g, '\\"');
}
