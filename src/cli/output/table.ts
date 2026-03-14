import chalk from "chalk";
import Table from "cli-table3";
import type { LicenseCategory } from "../../core/graph/types.js";
import { getContextNotes } from "../../core/license/context-notes.js";
import { parseLicenseComponents } from "../../core/license/spdx.js";
import type { Report } from "../../core/report/types.js";

export function renderTable(report: Report): void {
  console.log();
  console.log(chalk.bold(`📦 ${report.root}`));
  console.log(
    `Total packages: ${report.totalPackages} | Direct deps: ${report.directDependencies} | Max depth: ${report.maxDepth}`,
  );
  console.log();

  const table = new Table({
    head: [
      chalk.cyan("Package"),
      chalk.cyan("Version"),
      chalk.cyan("Depth"),
      chalk.cyan("License"),
      chalk.cyan("Vulnerabilities"),
    ],
    colWidths: [35, 12, 7, 20, 40],
    wordWrap: true,
  });

  for (const entry of report.entries) {
    const vulnText =
      entry.vulnerabilities.length > 0
        ? entry.vulnerabilities
            .map((v) => {
              const sev = v.severity ? colorSeverity(v.severity) : chalk.gray("?");
              return `${sev} ${v.id}`;
            })
            .join("\n")
        : chalk.green("none");

    table.push([
      entry.name,
      entry.version,
      String(entry.depth),
      colorLicense(entry.license, entry.licenseCategory),
      vulnText,
    ]);
  }

  console.log(table.toString());
  console.log();

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

  // For compound SPDX expressions, color each component individually
  if (license.includes(" OR ") || license.includes(" AND ")) {
    const separator = license.includes(" OR ") ? " OR " : " AND ";
    const components = parseLicenseComponents(license);
    const colored = components.map((c) => colorByCategory(c.spdxId, c.category));
    return colored.join(chalk.white(separator));
  }

  return colorByCategory(license, category);
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
