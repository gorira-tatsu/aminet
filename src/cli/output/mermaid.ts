import type { DependencyGraph } from "../../core/graph/types.js";
import type { VulnerabilityResult } from "../../core/vulnerability/types.js";

export function renderMermaid(
  graph: DependencyGraph,
  vulnerabilities: VulnerabilityResult[],
): void {
  const vulnMap = new Map<string, number>();
  for (const v of vulnerabilities) {
    vulnMap.set(v.packageId, v.vulnerabilities.length);
  }

  // Map node IDs to short aliases (Mermaid needs simple IDs)
  const nodeIds = Array.from(graph.nodes.keys());
  const aliasMap = new Map<string, string>();
  for (let i = 0; i < nodeIds.length; i++) {
    aliasMap.set(nodeIds[i], `N${i}`);
  }

  const lines: string[] = [];
  lines.push("graph LR");

  // Node definitions with labels
  for (const node of graph.nodes.values()) {
    const alias = aliasMap.get(node.id)!;
    const vulnCount = vulnMap.get(node.id) ?? 0;
    const licenseLabel = node.license ?? "UNKNOWN";
    const vulnLabel = vulnCount > 0 ? `<br/>⚠ ${vulnCount} vuln${vulnCount > 1 ? "s" : ""}` : "";

    const label = `${escapeMermaid(node.id)}<br/>${escapeMermaid(licenseLabel)}${vulnLabel}`;
    lines.push(`  ${alias}["${label}"]`);
  }

  lines.push("");

  // Edges
  for (const edge of graph.edges) {
    const fromAlias = aliasMap.get(edge.from);
    const toAlias = aliasMap.get(edge.to);
    if (fromAlias && toAlias) {
      lines.push(`  ${fromAlias} --> ${toAlias}`);
    }
  }

  lines.push("");

  // Styles
  for (const node of graph.nodes.values()) {
    const alias = aliasMap.get(node.id)!;
    const vulnCount = vulnMap.get(node.id) ?? 0;
    const color = getMermaidColor(node.licenseCategory, vulnCount);
    if (color) {
      lines.push(`  style ${alias} fill:${color}`);
    }
  }

  console.log(lines.join("\n"));
}

function getMermaidColor(category: string, vulnCount: number): string | null {
  if (vulnCount > 0) return "#FF6B6B";
  if (category === "copyleft") return "#FF6B6B";
  if (category === "weak-copyleft" || category === "unknown") return "#FFD93D";
  return "#90EE90";
}

function escapeMermaid(s: string): string {
  return s.replace(/"/g, "&quot;");
}
