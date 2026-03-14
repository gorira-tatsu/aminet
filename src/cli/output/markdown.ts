import type { DependencyDiff } from "../../core/diff/types.js";

const MARKER = "<!-- ami-review -->";

const RISK_ICONS: Record<string, string> = {
  none: ":white_circle:",
  low: ":green_circle:",
  medium: ":yellow_circle:",
  high: ":orange_circle:",
  critical: ":red_circle:",
};

export function renderMarkdownComment(diff: DependencyDiff): string {
  const lines: string[] = [];

  lines.push(MARKER);
  lines.push("## ami Dependency Review");
  lines.push("");

  // Summary table
  lines.push("| Metric | Count |");
  lines.push("|--------|-------|");
  lines.push(`| Added | ${diff.summary.addedCount} |`);
  lines.push(`| Removed | ${diff.summary.removedCount} |`);
  lines.push(`| Updated | ${diff.summary.updatedCount} |`);
  lines.push(`| New Vulnerabilities | ${diff.summary.newVulnCount} |`);
  lines.push(`| Resolved Vulnerabilities | ${diff.summary.resolvedVulnCount} |`);
  lines.push(`| License Changes | ${diff.summary.licenseChangeCount} |`);
  lines.push("");

  const icon = RISK_ICONS[diff.summary.riskLevel] ?? ":white_circle:";
  lines.push(`**Risk Level**: ${icon} ${capitalize(diff.summary.riskLevel)}`);
  lines.push("");

  // New Dependencies
  if (diff.added.length > 0) {
    lines.push("### New Dependencies");
    lines.push("");
    lines.push("| Package | Version | License | Depth |");
    lines.push("|---------|---------|---------|-------|");
    for (const entry of diff.added) {
      lines.push(
        `| ${entry.name} | ${entry.version} | ${entry.license ?? "UNKNOWN"} | ${entry.depth} |`,
      );
    }
    lines.push("");
  }

  // Removed Dependencies
  if (diff.removed.length > 0) {
    lines.push("### Removed Dependencies");
    lines.push("");
    lines.push("| Package | Version | License |");
    lines.push("|---------|---------|---------|");
    for (const entry of diff.removed) {
      lines.push(`| ${entry.name} | ${entry.version} | ${entry.license ?? "UNKNOWN"} |`);
    }
    lines.push("");
  }

  // Updated Dependencies
  if (diff.updated.length > 0) {
    lines.push("### Updated Dependencies");
    lines.push("");
    lines.push("| Package | Previous | New | License |");
    lines.push("|---------|----------|-----|---------|");
    for (const entry of diff.updated) {
      lines.push(
        `| ${entry.name} | ${entry.previousVersion ?? "?"} | ${entry.version} | ${entry.license ?? "UNKNOWN"} |`,
      );
    }
    lines.push("");
  }

  // Vulnerability Changes
  if (diff.newVulnerabilities.length > 0) {
    lines.push("### New Vulnerabilities");
    lines.push("");
    lines.push("| Package | Version | Vulnerability | Severity | Summary |");
    lines.push("|---------|---------|---------------|----------|---------|");
    for (const vc of diff.newVulnerabilities) {
      for (const v of vc.vulnerabilities) {
        lines.push(
          `| ${vc.name} | ${vc.version} | ${v.id} | ${v.severity ?? "?"} | ${v.summary} |`,
        );
      }
    }
    lines.push("");
  }

  if (diff.resolvedVulnerabilities.length > 0) {
    lines.push("### Resolved Vulnerabilities");
    lines.push("");
    lines.push("| Package | Version | Vulnerability | Severity |");
    lines.push("|---------|---------|---------------|----------|");
    for (const vc of diff.resolvedVulnerabilities) {
      for (const v of vc.vulnerabilities) {
        lines.push(`| ${vc.name} | ${vc.version} | ${v.id} | ${v.severity ?? "?"} |`);
      }
    }
    lines.push("");
  }

  // License Alerts
  if (diff.licenseChanged.length > 0) {
    lines.push("### License Changes");
    lines.push("");
    lines.push("| Package | Previous License | New License | Category |");
    lines.push("|---------|-----------------|-------------|----------|");
    for (const lc of diff.licenseChanged) {
      lines.push(
        `| ${lc.name} | ${lc.previousLicense ?? "UNKNOWN"} | ${lc.newLicense ?? "UNKNOWN"} | ${lc.newCategory} |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
