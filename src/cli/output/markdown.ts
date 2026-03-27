import type { DependencyDiff } from "../../core/diff/types.js";
import type { LicenseReference } from "../../core/license/metadata.js";

const MARKER = "<!-- aminet-review -->";

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
  lines.push("## aminet Dependency Review");
  lines.push("");
  lines.push("| Metric | Count |");
  lines.push("|--------|-------|");
  lines.push(`| Added | ${diff.summary.addedCount} |`);
  lines.push(`| Removed | ${diff.summary.removedCount} |`);
  lines.push(`| Updated | ${diff.summary.updatedCount} |`);
  lines.push(`| New Vulnerabilities | ${diff.summary.newVulnCount} |`);
  lines.push(`| Resolved Vulnerabilities | ${diff.summary.resolvedVulnCount} |`);
  lines.push(`| New Security Signals | ${diff.summary.newSecuritySignalCount} |`);
  lines.push(`| Resolved Security Signals | ${diff.summary.resolvedSecuritySignalCount} |`);
  lines.push(`| License Changes | ${diff.summary.licenseChangeCount} |`);
  if (diff.summary.skippedCount > 0) {
    lines.push(`| Skipped (unavailable) | ${diff.summary.skippedCount} |`);
  }
  lines.push("");

  const icon = RISK_ICONS[diff.summary.riskLevel] ?? ":white_circle:";
  lines.push(`**Risk Level**: ${icon} ${capitalize(diff.summary.riskLevel)}`);
  lines.push("");

  const keyAlerts = buildKeyAlerts(diff);
  if (keyAlerts.length > 0) {
    lines.push("### Key Alerts");
    lines.push("");
    for (const alert of keyAlerts) {
      lines.push(`- ${alert}`);
    }
    lines.push("");
  }

  if (diff.newVulnerabilities.length > 0) {
    lines.push("### New Vulnerabilities");
    lines.push("");
    lines.push("| Package | Version | Severity | Advisory | Fixed | Source | Summary |");
    lines.push("|---------|---------|----------|----------|-------|--------|---------|");
    for (const change of diff.newVulnerabilities) {
      for (const vulnerability of change.vulnerabilities) {
        const aliases =
          vulnerability.aliases.length > 0
            ? `<br/><sub>${vulnerability.aliases.join(", ")}</sub>`
            : "";
        lines.push(
          `| ${change.name} | ${change.version} | ${vulnerability.severity ?? "?"} | ${vulnerability.id}${aliases} | ${vulnerability.fixedVersion ?? "-"} | ${(vulnerability.sources ?? []).join(",") || "-"} | ${escapePipes(vulnerability.summary)} |`,
        );
      }
    }
    lines.push("");
  }

  if (diff.resolvedVulnerabilities.length > 0) {
    lines.push("### Resolved Vulnerabilities");
    lines.push("");
    lines.push("| Package | Version | Severity | Advisory | Fixed |");
    lines.push("|---------|---------|----------|----------|-------|");
    for (const change of diff.resolvedVulnerabilities) {
      for (const vulnerability of change.vulnerabilities) {
        lines.push(
          `| ${change.name} | ${change.version} | ${vulnerability.severity ?? "?"} | ${vulnerability.id} | ${vulnerability.fixedVersion ?? "-"} |`,
        );
      }
    }
    lines.push("");
  }

  const visibleNewSignals = filterVisibleSecuritySignals(diff.newSecuritySignals);
  if (visibleNewSignals.length > 0) {
    lines.push("### New Security Signals");
    lines.push("");
    lines.push("| Package | Severity | Category | Title |");
    lines.push("|---------|----------|----------|-------|");
    for (const change of visibleNewSignals) {
      for (const signal of change.signals) {
        lines.push(
          `| ${change.name} | ${signal.severity.toUpperCase()} | ${signal.category} | ${signal.title} |`,
        );
      }
    }
    lines.push("");
  }

  const visibleResolvedSignals = filterVisibleSecuritySignals(diff.resolvedSecuritySignals);
  if (visibleResolvedSignals.length > 0) {
    lines.push("### Resolved Security Signals");
    lines.push("");
    lines.push("| Package | Severity | Category | Title |");
    lines.push("|---------|----------|----------|-------|");
    for (const change of visibleResolvedSignals) {
      for (const signal of change.signals) {
        lines.push(
          `| ${change.name} | ${signal.severity.toUpperCase()} | ${signal.category} | ${signal.title} |`,
        );
      }
    }
    lines.push("");
  }

  const licenseAlerts = buildLicenseAlerts(diff);
  if (licenseAlerts.length > 0) {
    lines.push("### License Alerts");
    lines.push("");
    lines.push("| Package | Change | License | OSI | FSF | Links |");
    lines.push("|---------|--------|---------|-----|-----|-------|");
    for (const alert of licenseAlerts) {
      lines.push(
        `| ${alert.name} | ${alert.change} | ${alert.license} | ${alert.osi} | ${alert.fsf} | ${alert.links} |`,
      );
    }
    lines.push("");
  }

  if (diff.added.length > 0) {
    lines.push("### New Dependencies");
    lines.push("");
    lines.push("| Package | Declared | Resolved | License | Depth |");
    lines.push("|---------|----------|----------|---------|-------|");
    for (const entry of diff.added) {
      lines.push(
        `| ${entry.name} | ${entry.declaredVersion ?? "-"} | ${entry.resolvedVersion ?? entry.version} | ${entry.license ?? "UNKNOWN"} | ${entry.depth} |`,
      );
    }
    lines.push("");
  }

  if (diff.removed.length > 0) {
    lines.push("### Removed Dependencies");
    lines.push("");
    lines.push("| Package | Declared | Resolved | License |");
    lines.push("|---------|----------|----------|---------|");
    for (const entry of diff.removed) {
      lines.push(
        `| ${entry.name} | ${entry.previousDeclaredVersion ?? entry.declaredVersion ?? "-"} | ${entry.previousResolvedVersion ?? entry.version} | ${entry.license ?? "UNKNOWN"} |`,
      );
    }
    lines.push("");
  }

  if (diff.updated.length > 0) {
    lines.push("### Updated Dependencies");
    lines.push("");
    lines.push("| Package | Declared | Resolved | License |");
    lines.push("|---------|----------|----------|---------|");
    for (const entry of diff.updated) {
      lines.push(
        `| ${entry.name} | ${formatTransition(entry.previousDeclaredVersion, entry.declaredVersion)} | ${formatTransition(entry.previousResolvedVersion, entry.resolvedVersion ?? entry.version)} | ${entry.license ?? "UNKNOWN"} |`,
      );
    }
    lines.push("");
  }

  if (diff.licenseChanged.length > 0) {
    lines.push("### License Changes");
    lines.push("");
    lines.push("| Package | Previous License | New License | Category |");
    lines.push("|---------|-----------------|-------------|----------|");
    for (const change of diff.licenseChanged) {
      lines.push(
        `| ${change.name} | ${change.previousLicense ?? "UNKNOWN"} | ${change.newLicense ?? "UNKNOWN"} | ${change.newCategory} |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

function filterVisibleSecuritySignals(
  changes: DependencyDiff["newSecuritySignals"],
): DependencyDiff["newSecuritySignals"] {
  return changes
    .map((change) => ({
      ...change,
      signals: change.signals.filter((signal) => signal.severity !== "info"),
    }))
    .filter((change) => change.signals.length > 0);
}

function buildKeyAlerts(diff: DependencyDiff): string[] {
  const alerts: string[] = [];

  const highOrCriticalVulns = diff.newVulnerabilities.flatMap((change) =>
    change.vulnerabilities.filter((vulnerability) => {
      const severity = vulnerability.severity?.toUpperCase();
      return severity === "CRITICAL" || severity === "HIGH";
    }),
  );
  if (highOrCriticalVulns.length > 0) {
    alerts.push(`${highOrCriticalVulns.length} critical/high vulnerability alerts introduced`);
  }

  const highOrCriticalSignals = filterVisibleSecuritySignals(diff.newSecuritySignals).flatMap(
    (change) =>
      change.signals.filter(
        (signal) => signal.severity === "critical" || signal.severity === "high",
      ),
  );
  if (highOrCriticalSignals.length > 0) {
    alerts.push(`${highOrCriticalSignals.length} high-severity security signals introduced`);
  }

  const licenseAlerts = buildLicenseAlerts(diff);
  if (licenseAlerts.length > 0) {
    alerts.push(`${licenseAlerts.length} dependency license alerts require review`);
  }

  return alerts;
}

function buildLicenseAlerts(diff: DependencyDiff): Array<{
  name: string;
  change: string;
  license: string;
  osi: string;
  fsf: string;
  links: string;
}> {
  const alerts: Array<{
    name: string;
    change: string;
    license: string;
    osi: string;
    fsf: string;
    links: string;
  }> = [];

  for (const entry of diff.added) {
    if (entry.licenseCategory === "copyleft" || entry.licenseCategory === "weak-copyleft") {
      alerts.push({
        name: entry.name,
        change: "new dependency",
        license: formatLicenseDetails(entry.license ?? "UNKNOWN", entry.licenseDetails),
        osi: summarizeOsi(entry.licenseDetails),
        fsf: summarizeFsf(entry.licenseDetails),
        links: formatLicenseLinks(entry.licenseDetails),
      });
    }
  }

  for (const change of diff.licenseChanged) {
    alerts.push({
      name: change.name,
      change: `${change.previousCategory} → ${change.newCategory}`,
      license: formatLicenseDetails(change.newLicense ?? "UNKNOWN", change.newLicenseDetails),
      osi: summarizeOsi(change.newLicenseDetails),
      fsf: summarizeFsf(change.newLicenseDetails),
      links: formatLicenseLinks(change.newLicenseDetails),
    });
  }

  return alerts;
}

function formatLicenseDetails(license: string, details?: LicenseReference[]): string {
  if (!details || details.length === 0) {
    return license;
  }
  return details.map((detail) => `${detail.spdxId} (${detail.displayName})`).join("<br/>");
}

function summarizeOsi(details?: LicenseReference[]): string {
  if (!details || details.length === 0) {
    return "unknown";
  }
  return details
    .map((detail) =>
      detail.osiApproved === true
        ? "approved"
        : detail.osiApproved === false
          ? "not-approved"
          : "unknown",
    )
    .join("<br/>");
}

function summarizeFsf(details?: LicenseReference[]): string {
  if (!details || details.length === 0) {
    return "unknown";
  }
  return details.map((detail) => detail.fsfStatus).join("<br/>");
}

function formatLicenseLinks(details?: LicenseReference[]): string {
  if (!details || details.length === 0) {
    return "-";
  }
  return details
    .map((detail) => {
      const links = [`[EN](${detail.originalTextUrl})`];
      if (detail.japaneseTextUrl) {
        links.push(`[JA](${detail.japaneseTextUrl})`);
      }
      return `${detail.spdxId}: ${links.join(" / ")}`;
    })
    .join("<br/>");
}

function escapePipes(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function formatTransition(previous?: string | null, next?: string | null): string {
  const before = previous ?? "-";
  const after = next ?? "-";
  return `${before} → ${after}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
