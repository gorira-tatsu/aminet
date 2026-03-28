import chalk from "chalk";
import Table from "cli-table3";
import type { LicenseCategory } from "../../core/graph/types.js";
import { getContextNotes } from "../../core/license/context-notes.js";
import type { LicenseReference } from "../../core/license/metadata.js";
import { parseLicenseComponents, renderSpdxExpression } from "../../core/license/spdx.js";
import type { Report } from "../../core/report/types.js";

export function renderTable(report: Report): void {
  console.log();
  console.log(chalk.bold(`📦 ${report.root}`));
  console.log(
    `Total packages: ${report.totalPackages} | Direct deps: ${report.directDependencies} | Max depth: ${report.maxDepth}`,
  );
  console.log();

  // Determine which optional columns to show
  // Advisories are shown inline in the vulnerability column
  const hasTrustScores = report.entries.some((e) => e.trustScore);
  const hasFreshness = report.entries.some((e) => e.freshness);
  const hasEnhancedLicense = report.entries.some((e) => e.enhancedLicense);
  const hasProvenance = report.entries.some((e) => e.provenance);
  const hasLicenseDetails = report.entries.some(
    (e) => e.licenseDetails && e.licenseDetails.length > 0,
  );

  const head = [
    chalk.cyan("Package"),
    chalk.cyan("Version"),
    chalk.cyan("Depth"),
    chalk.cyan("License"),
    chalk.cyan("License Info"),
    chalk.cyan("Vulnerabilities"),
  ];
  const colWidths: number[] = [35, 12, 7, 24, 24, 36];

  if (hasTrustScores) {
    head.push(chalk.cyan("Trust"));
    colWidths.push(8);
  }

  if (hasFreshness) {
    head.push(chalk.cyan("Freshness"));
    colWidths.push(14);
  }

  if (hasEnhancedLicense) {
    head.push(chalk.cyan("License Intel"));
    colWidths.push(18);
  }

  if (hasProvenance) {
    head.push(chalk.cyan("Provenance"));
    colWidths.push(12);
  }

  const table = new Table({ head, colWidths, wordWrap: true });

  for (const entry of report.entries) {
    let vulnText: string;

    if (entry.advisories && entry.advisories.length > 0) {
      vulnText = entry.advisories
        .map((a) => {
          const sev = colorSeverity(a.severity.toUpperCase());
          const malware = a.isMalware ? `${chalk.bgRed.white(" MALWARE ")} ` : "";
          const sources = chalk.gray(`[${a.sources.join(",")}]`);
          return `${malware}${sev} ${a.id} ${sources}`;
        })
        .join("\n");
    } else if (entry.vulnerabilities.length > 0) {
      vulnText = entry.vulnerabilities
        .map((v) => {
          const sev = v.severity ? colorSeverity(v.severity) : chalk.gray("?");
          return `${sev} ${v.id}`;
        })
        .join("\n");
    } else {
      vulnText = chalk.green("none");
    }

    const row: string[] = [
      entry.name,
      entry.version,
      String(entry.depth),
      colorLicense(entry.license, entry.licenseCategory),
      hasLicenseDetails ? formatLicenseInfo(entry.licenseDetails) : chalk.gray("-"),
      vulnText,
    ];

    if (hasTrustScores) {
      row.push(entry.trustScore ? colorTrustScore(entry.trustScore.overall) : chalk.gray("-"));
    }

    if (hasFreshness) {
      row.push(entry.freshness ? colorFreshness(entry.freshness.status) : chalk.gray("-"));
    }

    if (hasEnhancedLicense) {
      row.push(
        entry.enhancedLicense ? formatEnhancedLicense(entry.enhancedLicense) : chalk.gray("-"),
      );
    }

    if (hasProvenance) {
      row.push(entry.provenance ? colorProvenance(entry.provenance.transparency) : chalk.gray("-"));
    }

    table.push(row);
  }

  console.log(table.toString());
  console.log();

  if (report.analysisNotes && report.analysisNotes.length > 0) {
    console.log(chalk.bold("Analysis Notes:"));
    for (const note of report.analysisNotes) {
      console.log(`  - ${note}`);
    }
    console.log();
  }

  // Summary
  renderSummary(report);

  // Context notes for copyleft/weak-copyleft licenses
  const allLicenses = report.entries.map((e) => e.license).filter((l): l is string => l !== null);
  const contextNotes = getContextNotes(allLicenses);
  if (contextNotes.length > 0) {
    console.log(chalk.bold("License Notes:"));
    for (const cn of contextNotes) {
      console.log(`  ${chalk.yellow(cn.license)}: ${cn.note}`);
    }
    console.log();
  }

  // Security signals
  if (report.securitySignals && report.securitySignals.length > 0) {
    renderSecuritySignals(report);
  }

  // License contamination paths
  if (report.contaminationPaths && report.contaminationPaths.length > 0) {
    renderContaminationPaths(report);
  }

  // License incompatibilities
  if (report.licenseIncompatibilities && report.licenseIncompatibilities.length > 0) {
    renderIncompatibilities(report);
  }

  // Phantom dependencies
  if (report.phantomDeps && report.phantomDeps.length > 0) {
    renderPhantomDeps(report);
  }

  // Pinning report
  if (report.pinningReport) {
    renderPinningReport(report);
  }

  if (report.deepLicenseMismatches && report.deepLicenseMismatches.length > 0) {
    renderDeepLicenseMismatches(report);
  }
}

function renderSecuritySignals(report: Report): void {
  const signals = report.securitySignals!;
  console.log(chalk.bold("Security Signals:"));

  const { securitySummary } = report;
  if (securitySummary) {
    const parts: string[] = [];
    if (securitySummary.criticalCount > 0)
      parts.push(chalk.bgRed.white(` ${securitySummary.criticalCount} critical `));
    if (securitySummary.highCount > 0) parts.push(chalk.red(`${securitySummary.highCount} high`));
    if (securitySummary.mediumCount > 0)
      parts.push(chalk.yellow(`${securitySummary.mediumCount} medium`));
    if (securitySummary.lowCount > 0) parts.push(chalk.blue(`${securitySummary.lowCount} low`));
    if (securitySummary.infoCount > 0) parts.push(chalk.gray(`${securitySummary.infoCount} info`));
    console.log(`  Total: ${parts.join(", ")}`);
  }

  const signalTable = new Table({
    head: [
      chalk.cyan("Package"),
      chalk.cyan("Category"),
      chalk.cyan("Severity"),
      chalk.cyan("Title"),
    ],
    colWidths: [30, 18, 12, 50],
    wordWrap: true,
  });

  // Only show non-info signals in table to reduce noise
  const visibleSignals = signals.filter((s) => s.severity !== "info");
  for (const signal of visibleSignals) {
    signalTable.push([
      signal.packageId,
      signal.category,
      colorSignalSeverity(signal.severity),
      signal.title,
    ]);
  }

  if (visibleSignals.length > 0) {
    console.log(signalTable.toString());
  }

  const infoCount = signals.length - visibleSignals.length;
  if (infoCount > 0) {
    console.log(chalk.gray(`  + ${infoCount} info-level signals (use --json to see all)`));
  }
  console.log();
}

function renderContaminationPaths(report: Report): void {
  const paths = report.contaminationPaths!;
  console.log(chalk.bold.red("Copyleft Contamination Paths:"));
  console.log(`  Found ${paths.length} path(s) to copyleft-licensed packages`);
  console.log();

  for (const cp of paths) {
    console.log(`  ${chalk.red(cp.targetLicense)} in ${chalk.bold(cp.targetId)}:`);
    console.log(`    ${cp.path.join(" → ")}`);
    console.log();
  }
}

function renderIncompatibilities(report: Report): void {
  const pairs = report.licenseIncompatibilities!;
  console.log(chalk.bold.red("License Incompatibilities:"));

  const table = new Table({
    head: [
      chalk.cyan("License A"),
      chalk.cyan("Package A"),
      chalk.cyan("License B"),
      chalk.cyan("Package B"),
      chalk.cyan("Explanation"),
    ],
    colWidths: [16, 25, 16, 25, 40],
    wordWrap: true,
  });

  for (const pair of pairs) {
    table.push([
      chalk.red(pair.licenseA),
      pair.packageA,
      chalk.red(pair.licenseB),
      pair.packageB,
      pair.explanation,
    ]);
  }

  console.log(table.toString());
  console.log();
}

function renderPhantomDeps(report: Report): void {
  const phantoms = report.phantomDeps!;
  console.log(chalk.bold.yellow("Phantom Dependencies:"));
  console.log(`  Found ${phantoms.length} imported but undeclared package(s)`);
  console.log();

  const table = new Table({
    head: [chalk.cyan("Package"), chalk.cyan("Risk"), chalk.cyan("Used In")],
    colWidths: [30, 10, 70],
    wordWrap: true,
  });

  for (const p of phantoms) {
    const riskColor =
      p.risk === "high" ? chalk.red : p.risk === "medium" ? chalk.yellow : chalk.blue;
    table.push([
      p.importedName,
      riskColor(p.risk.toUpperCase()),
      p.usedInFiles.slice(0, 3).join("\n") +
        (p.usedInFiles.length > 3 ? `\n+${p.usedInFiles.length - 3} more` : ""),
    ]);
  }

  console.log(table.toString());
  console.log();
}

function renderPinningReport(report: Report): void {
  const pr = report.pinningReport!;
  console.log(chalk.bold("Version Pinning Analysis:"));
  console.log(`  Total dependencies: ${pr.totalDependencies}`);
  console.log(`  Exact pinned: ${chalk.green(String(pr.exactPinned))}`);
  console.log(`  Caret (^): ${chalk.blue(String(pr.caretRange))}`);
  console.log(`  Tilde (~): ${chalk.blue(String(pr.tildeRange))}`);
  if (pr.wildcardOrStar > 0) console.log(`  Wildcard/*: ${chalk.red(String(pr.wildcardOrStar))}`);
  if (pr.gitOrUrl > 0) console.log(`  Git/URL: ${chalk.yellow(String(pr.gitOrUrl))}`);
  console.log(`  Drift risk: ${colorDriftRisk(pr.driftRiskScore)}/100`);

  if (pr.recommendations.length > 0) {
    console.log();
    console.log(chalk.bold("  Recommendations:"));
    for (const rec of pr.recommendations.slice(0, 5)) {
      console.log(`    ${chalk.yellow(rec.name)}: ${rec.suggestion}`);
      console.log(`      ${chalk.gray(rec.reason)}`);
    }
    if (pr.recommendations.length > 5) {
      console.log(chalk.gray(`    +${pr.recommendations.length - 5} more recommendations`));
    }
  }
  console.log();
}

function renderDeepLicenseMismatches(report: Report): void {
  const mismatches = report.deepLicenseMismatches!;
  console.log(chalk.bold.red("Deep License Mismatches:"));

  const table = new Table({
    head: [chalk.cyan("Package"), chalk.cyan("Declared"), chalk.cyan("Detected")],
    colWidths: [30, 20, 20],
    wordWrap: true,
  });

  for (const mismatch of mismatches) {
    table.push([mismatch.packageId, chalk.yellow(mismatch.declared), chalk.red(mismatch.detected)]);
  }

  console.log(table.toString());
  console.log();
}

function colorTrustScore(score: number): string {
  if (score >= 70) return chalk.green(String(score));
  if (score >= 40) return chalk.yellow(String(score));
  return chalk.red(String(score));
}

function colorFreshness(status: string): string {
  switch (status) {
    case "current":
      return chalk.green("current");
    case "minor-behind":
      return chalk.blue("minor behind");
    case "major-behind":
      return chalk.yellow("major behind");
    case "outdated":
      return chalk.red("outdated");
    case "abandoned":
      return chalk.bgRed.white(" abandoned ");
    default:
      return chalk.gray(status);
  }
}

function formatEnhancedLicense(
  enhanced: NonNullable<Report["entries"][number]["enhancedLicense"]>,
): string {
  if (enhanced.mismatch) {
    return chalk.red(`mismatch (${enhanced.confidence})`);
  }
  if (enhanced.discovered || enhanced.declared) {
    return chalk.green(`ok (${enhanced.confidence})`);
  }
  return chalk.gray("-");
}

function colorProvenance(transparency: string): string {
  switch (transparency) {
    case "full":
      return chalk.green("full");
    case "partial":
      return chalk.yellow("partial");
    case "none":
      return chalk.red("none");
    default:
      return chalk.gray(transparency);
  }
}

function colorDriftRisk(score: number): string {
  if (score <= 20) return chalk.green(String(score));
  if (score <= 50) return chalk.yellow(String(score));
  return chalk.red(String(score));
}

function colorSignalSeverity(severity: string): string {
  switch (severity) {
    case "critical":
      return chalk.bgRed.white(" CRITICAL ");
    case "high":
      return chalk.red("HIGH");
    case "medium":
      return chalk.yellow("MEDIUM");
    case "low":
      return chalk.blue("LOW");
    case "info":
      return chalk.gray("INFO");
    default:
      return chalk.gray(severity);
  }
}

function colorLicense(license: string | null, category: LicenseCategory): string {
  if (!license) return chalk.gray("UNKNOWN");

  const components = parseLicenseComponents(license);
  if (components.length > 1) {
    const categories = new Map(
      components.map((component) => [component.spdxId, component.category]),
    );
    return renderSpdxExpression(license, (spdxId) =>
      colorByCategory(spdxId, categories.get(spdxId) ?? "unknown"),
    );
  }

  return colorByCategory(license, category);
}

function formatLicenseInfo(details?: LicenseReference[]): string {
  if (!details || details.length === 0) {
    return chalk.gray("unknown");
  }

  return details
    .map((detail) => {
      const osi =
        detail.osiApproved === true ? "OSI" : detail.osiApproved === false ? "non-OSI" : "OSI?";
      const fsf =
        detail.fsfStatus === "free"
          ? "FSF-free"
          : detail.fsfStatus === "nonfree"
            ? "FSF-nonfree"
            : "FSF?";
      return `${detail.spdxId} ${chalk.gray(`(${osi}, ${fsf})`)}`;
    })
    .join("\n");
}

function colorByCategory(text: string, category: LicenseCategory): string {
  switch (category) {
    case "permissive":
      return chalk.green(text);
    case "copyleft":
      return chalk.red(text);
    case "weak-copyleft":
      return chalk.yellow(text);
    default:
      return chalk.gray(text);
  }
}

function colorSeverity(severity: string): string {
  switch (severity.toUpperCase()) {
    case "CRITICAL":
      return chalk.bgRed.white(" CRITICAL ");
    case "HIGH":
      return chalk.red("HIGH");
    case "MEDIUM":
      return chalk.yellow("MEDIUM");
    case "LOW":
      return chalk.blue("LOW");
    default:
      return chalk.gray(severity);
  }
}

function renderSummary(report: Report): void {
  const { summary } = report;

  console.log(chalk.bold("Summary:"));
  console.log(
    `  Licenses: ${chalk.green(`${summary.licenseCounts.permissive} permissive`)}, ${chalk.yellow(`${summary.licenseCounts["weak-copyleft"]} weak-copyleft`)}, ${chalk.red(`${summary.licenseCounts.copyleft} copyleft`)}, ${chalk.gray(`${summary.licenseCounts.unknown} unknown`)}`,
  );

  if (summary.vulnerabilityCount > 0) {
    console.log(
      `  Vulnerabilities: ${chalk.red(`${summary.vulnerabilityCount} total`)} (${summary.criticalCount} critical, ${summary.highCount} high, ${summary.mediumCount} medium, ${summary.lowCount} low)`,
    );
  } else {
    console.log(`  Vulnerabilities: ${chalk.green("0 found")}`);
  }
  console.log();
}
