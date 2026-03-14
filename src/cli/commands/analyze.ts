import { readFile } from "node:fs/promises";
import chalk from "chalk";
import ora from "ora";
import { buildReportFromPackageJson } from "../../core/analyzer.js";
import { loadConfig } from "../../core/config/loader.js";
import type { AmiConfig } from "../../core/config/types.js";
import { resolveDependencyGraph } from "../../core/graph/resolver.js";
import type { DependencyGraph } from "../../core/graph/types.js";
import { checkTreeCompatibility } from "../../core/license/compatibility.js";
import { traceContaminationPaths } from "../../core/license/contamination.js";
import { checkDenyList } from "../../core/license/deny-list.js";
import { extractLicenseFiles } from "../../core/license/tarball-checker.js";
import { setNpmCacheEnabled } from "../../core/registry/npm-client.js";
import type { BuildReportOptions } from "../../core/report/builder.js";
import { buildReport } from "../../core/report/builder.js";
import type { Report } from "../../core/report/types.js";
import { scanSecuritySignals } from "../../core/security/scanner.js";
import { getDatabase } from "../../core/store/database.js";
import { scanVulnerabilities } from "../../core/vulnerability/scanner.js";
import type { VulnerabilityResult } from "../../core/vulnerability/types.js";
import { logger, setLogLevel } from "../../utils/logger.js";
import type { AnalyzeOptions } from "../options.js";
import { renderCycloneDx } from "../output/cyclonedx.js";
import { renderGraphviz } from "../output/graphviz.js";
import { renderJson } from "../output/json.js";
import { renderMermaid } from "../output/mermaid.js";
import { renderNotices, renderNoticesJson } from "../output/notices.js";
import { renderSpdx } from "../output/spdx.js";
import { renderTable } from "../output/table.js";
import { renderTree } from "../output/tree.js";

export async function analyzeCommand(target: string, options: AnalyzeOptions): Promise<void> {
  if (options.verbose) {
    setLogLevel("debug");
  }

  // Load config and merge with CLI options
  const config = loadConfig();
  mergeConfig(options, config);

  // CI mode defaults
  if (options.ci) {
    if (!options.failOnVuln) {
      options.failOnVuln = "high";
    }
    // Force JSON for CI unless other format specified
    if (!options.dot && !options.mermaid && !options.tree && !options.notices) {
      options.json = true;
    }
    // Security on by default in CI
    if (options.security === undefined) {
      options.security = true;
    }
  }

  // Initialize DB (ensures ~/.ami/ exists)
  getDatabase();

  if (options.noCache) {
    setNpmCacheEnabled(false);
  }

  const isCi = options.ci || false;
  const useSpinner =
    !isCi && !options.dot && !options.mermaid && !options.cyclonedx && !options.spdx;

  if (options.file) {
    await analyzeFile(target, options, config, useSpinner);
    return;
  }

  const parsed = parsePackageSpec(target);
  await analyzePackage(parsed.name, parsed.versionRange, options, config, useSpinner);
}

function mergeConfig(options: AnalyzeOptions, config: AmiConfig): void {
  // CLI takes precedence over config
  if (options.depth === undefined && config.depth !== undefined) {
    options.depth = config.depth;
  }
  if (options.concurrency === undefined && config.concurrency !== undefined) {
    options.concurrency = config.concurrency;
  }
  if (!options.failOnVuln && config.failOnVuln) {
    options.failOnVuln = config.failOnVuln;
  }
  if (!options.failOnLicense && config.failOnLicense) {
    options.failOnLicense = config.failOnLicense;
  }
  if (!options.denyLicense && config.denyLicenses && config.denyLicenses.length > 0) {
    options.denyLicense = config.denyLicenses.join(",");
  }
  if (options.deepLicenseCheck === undefined && config.deepLicenseCheck) {
    options.deepLicenseCheck = config.deepLicenseCheck;
  }
  if (options.security === undefined && config.security) {
    options.security = config.security;
  }
}

async function analyzeFile(
  filePath: string,
  options: AnalyzeOptions,
  config: AmiConfig,
  useSpinner: boolean,
): Promise<void> {
  const content = await readFile(filePath, "utf-8");
  const pkg = JSON.parse(content);

  const allDeps: Record<string, string> = {
    ...(pkg.dependencies ?? {}),
    ...(options.dev ? (pkg.devDependencies ?? {}) : {}),
  };

  const depEntries = Object.entries(allDeps);
  if (depEntries.length === 0) {
    console.error(chalk.yellow(`No dependencies found in ${filePath}`));
    return;
  }

  const spinner = useSpinner
    ? ora(`Analyzing ${depEntries.length} dependencies from ${filePath}...`).start()
    : null;

  if (!useSpinner) {
    logger.info(`Analyzing ${depEntries.length} dependencies from ${filePath}`);
  }

  // Use buildReportFromPackageJson for file analysis
  const result = await buildReportFromPackageJson(pkg, {
    depth: options.depth,
    concurrency: options.concurrency,
    dev: options.dev,
    noCache: options.noCache,
  });

  if (spinner) {
    spinner.succeed(`Resolved ${result.graph.nodes.size} packages`);
  }

  // Apply license overrides
  applyLicenseOverrides(result.graph, config);

  // Deep license check
  if (options.deepLicenseCheck) {
    await deepLicenseCheckPhase(result.graph, useSpinner);
  }

  outputAndExit(result.graph, result.vulnerabilities, options, config);
}

async function analyzePackage(
  packageName: string,
  versionRange: string,
  options: AnalyzeOptions,
  config: AmiConfig,
  useSpinner: boolean,
): Promise<void> {
  // Phase 1: Resolve dependency graph
  const spinner = useSpinner
    ? ora(`Resolving dependencies for ${packageName}@${versionRange}...`).start()
    : null;

  if (!useSpinner) {
    logger.info(`Resolving dependencies for ${packageName}@${versionRange}`);
  }

  let graph: DependencyGraph;
  try {
    graph = await resolveDependencyGraph(
      packageName,
      versionRange,
      {
        maxDepth: options.depth,
        concurrency: options.concurrency ?? 5,
        includeDev: options.dev,
      },
      (resolved, pending) => {
        if (spinner) {
          spinner.text = `Resolving dependencies... (${resolved} resolved, ${pending} pending)`;
        }
      },
    );
    if (spinner) {
      spinner.succeed(`Resolved ${graph.nodes.size} packages (${graph.edges.length} edges)`);
    }
  } catch (error) {
    if (spinner) {
      spinner.fail("Failed to resolve dependencies");
    }
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }

  // Apply license overrides
  applyLicenseOverrides(graph, config);

  const vulnerabilities = await scanPhase(graph, options, useSpinner);

  // Deep license check
  if (options.deepLicenseCheck) {
    await deepLicenseCheckPhase(graph, useSpinner);
  }

  outputAndExit(graph, vulnerabilities, options, config);
}

function applyLicenseOverrides(graph: DependencyGraph, config: AmiConfig): void {
  if (!config.licenseOverrides) return;

  const { classifyLicense } = require("../../core/license/spdx.js");
  for (const [pkgId, spdxId] of Object.entries(config.licenseOverrides)) {
    const node = graph.nodes.get(pkgId);
    if (node) {
      logger.debug(`License override: ${pkgId} -> ${spdxId}`);
      node.license = spdxId;
      node.licenseCategory = classifyLicense(spdxId);
    }
  }
}

async function deepLicenseCheckPhase(graph: DependencyGraph, useSpinner: boolean): Promise<void> {
  const spinner = useSpinner ? ora("Checking LICENSE files from tarballs...").start() : null;

  if (!useSpinner) {
    logger.info("Checking LICENSE files from tarballs...");
  }

  let checked = 0;
  let mismatches = 0;
  const warnings: string[] = [];

  const { getPackument } = require("../../core/registry/npm-client.js");

  for (const node of graph.nodes.values()) {
    if (node.depth === 0) continue;

    try {
      const packument = await getPackument(node.name);
      const versionInfo = packument.versions?.[node.version];
      if (!versionInfo?.dist?.tarball) continue;

      const result = await extractLicenseFiles(versionInfo.dist.tarball);
      checked++;

      if (result.detectedLicense && node.license) {
        if (result.detectedLicense !== node.license) {
          const declared = node.license;
          const detected = result.detectedLicense;
          if (!isLicenseVariant(declared, detected)) {
            mismatches++;
            const msg = `${node.id}: package.json declares "${declared}" but LICENSE file suggests "${detected}"`;
            warnings.push(msg);
          }
        }
      }

      if (spinner) {
        spinner.text = `Checking LICENSE files... (${checked} checked, ${mismatches} mismatches)`;
      }
    } catch {
      // Skip packages we can't check
    }
  }

  if (spinner) {
    if (mismatches > 0) {
      spinner.warn(`Checked ${checked} LICENSE files, ${mismatches} mismatch(es)`);
    } else {
      spinner.succeed(`Checked ${checked} LICENSE files, no mismatches`);
    }
  }

  for (const w of warnings) {
    console.error(chalk.yellow(`  ⚠ ${w}`));
  }
}

function isLicenseVariant(declared: string, detected: string): boolean {
  const normalize = (s: string) => s.replace(/-only$/, "").replace(/-or-later$/, "");
  return normalize(declared) === normalize(detected);
}

async function scanPhase(
  graph: DependencyGraph,
  options: AnalyzeOptions,
  useSpinner: boolean,
): Promise<VulnerabilityResult[]> {
  const spinner = useSpinner ? ora("Scanning for vulnerabilities...").start() : null;

  if (!useSpinner) {
    logger.info("Scanning for vulnerabilities...");
  }

  let vulnerabilities: VulnerabilityResult[];
  try {
    vulnerabilities = await scanVulnerabilities(graph, options.concurrency ?? 5, !options.noCache);
    const totalVulns = vulnerabilities.reduce((sum, v) => sum + v.vulnerabilities.length, 0);
    if (totalVulns > 0) {
      if (spinner) {
        spinner.warn(
          chalk.yellow(`Found ${totalVulns} vulnerabilities in ${vulnerabilities.length} packages`),
        );
      }
    } else {
      if (spinner) {
        spinner.succeed("No vulnerabilities found");
      }
    }
  } catch (_error) {
    if (spinner) {
      spinner.warn("Vulnerability scan failed, continuing without results");
    }
    vulnerabilities = [];
  }

  return vulnerabilities;
}

async function outputAndExit(
  graph: DependencyGraph,
  vulnerabilities: VulnerabilityResult[],
  options: AnalyzeOptions,
  config: AmiConfig,
): Promise<void> {
  // Build report options with optional security/license data
  const reportOptions: BuildReportOptions = {};

  // Phase 3: Security scan
  if (options.security) {
    const useSpinner =
      !options.ci && !options.dot && !options.mermaid && !options.cyclonedx && !options.spdx;
    const spinner = useSpinner ? ora("Running security analysis...").start() : null;

    try {
      const securityResult = await scanSecuritySignals(graph);
      reportOptions.securitySignals = securityResult.signals;
      reportOptions.securitySummary = securityResult.summary;

      const totalSignals = securityResult.signals.length;
      if (spinner) {
        if (totalSignals > 0) {
          spinner.warn(
            chalk.yellow(
              `Found ${totalSignals} security signals (${securityResult.summary.highCount} high, ${securityResult.summary.mediumCount} medium)`,
            ),
          );
        } else {
          spinner.succeed("No security signals found");
        }
      }
    } catch (_error) {
      if (spinner) {
        spinner.warn("Security scan failed, continuing without results");
      }
    }
  }

  // Phase 4: License report
  if (options.licenseReport) {
    const contamination = traceContaminationPaths(graph);
    if (contamination.paths.length > 0) {
      reportOptions.contaminationPaths = contamination.paths;
    }

    const incompatible = checkTreeCompatibility(graph);
    if (incompatible.length > 0) {
      reportOptions.licenseIncompatibilities = incompatible;
    }
  }

  const report = buildReport(graph, vulnerabilities, reportOptions);

  // Output
  if (options.cyclonedx) {
    renderCycloneDx(report, graph);
  } else if (options.spdx) {
    renderSpdx(report, graph);
  } else if (options.notices) {
    if (options.json) {
      renderNoticesJson(report);
    } else {
      renderNotices(report);
    }
  } else if (options.dot) {
    renderGraphviz(graph, vulnerabilities);
  } else if (options.mermaid) {
    renderMermaid(graph, vulnerabilities);
  } else if (options.tree) {
    renderTree(graph, vulnerabilities);
  } else if (options.json) {
    renderJson(report);
  } else {
    renderTable(report);
  }

  // Deny-list check
  let denyListExitCode = 0;
  if (options.denyLicense) {
    const denied = options.denyLicense.split(",").map((s) => s.trim());
    const violations = checkDenyList(report.entries, denied);

    if (violations.length > 0) {
      console.error("");
      console.error(chalk.red.bold("Deny-list violations:"));
      for (const v of violations) {
        if (v.isOrExpression) {
          const nonDenied = v.license
            .split(" OR ")
            .map((p) => p.trim())
            .filter((p) => !v.deniedIds.includes(p));
          console.error(
            chalk.yellow(
              `  ⚠ ${v.packageId}: "${v.license}" contains denied ${v.deniedIds.join(", ")} (can use ${nonDenied.join(" or ")} instead)`,
            ),
          );
        } else {
          console.error(chalk.red(`  ✗ ${v.packageId}: "${v.license}" is denied`));
        }
      }

      const hardViolations = violations.filter((v) => {
        if (!v.isOrExpression) return true;
        const parts = v.license.split(" OR ").map((p) => p.trim());
        return parts.every((p) => denied.includes(p));
      });
      if (hardViolations.length > 0) {
        denyListExitCode = 4;
      }
    }
  }

  // Allow-list check
  if (config.allowLicenses && config.allowLicenses.length > 0) {
    const allowSet = new Set(config.allowLicenses);
    const unlisted = report.entries.filter((e) => {
      if (!e.license) return true;
      const parts = e.license.split(/ (?:OR|AND) /).map((p) => p.trim());
      return !parts.some((p) => allowSet.has(p));
    });

    if (unlisted.length > 0) {
      console.error("");
      console.error(chalk.yellow.bold("Licenses not in allow-list:"));
      for (const e of unlisted) {
        console.error(chalk.yellow(`  ⚠ ${e.id}: ${e.license ?? "UNKNOWN"}`));
      }
    }
  }

  // CI exit codes
  let exitCode = denyListExitCode;
  if (options.failOnVuln || options.failOnLicense) {
    exitCode |= computeExitCode(report, options);

    // Write GitHub Actions step summary if available
    if (process.env.GITHUB_ACTIONS && process.env.GITHUB_STEP_SUMMARY) {
      writeGitHubSummary(report);
    }
  }

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

function computeExitCode(report: Report, options: AnalyzeOptions): number {
  let code = 0;

  if (options.failOnVuln) {
    const threshold = options.failOnVuln.toLowerCase();
    const { summary } = report;
    let vulnFound = false;

    switch (threshold) {
      case "critical":
        vulnFound = summary.criticalCount > 0;
        break;
      case "high":
        vulnFound = summary.criticalCount > 0 || summary.highCount > 0;
        break;
      case "medium":
        vulnFound = summary.criticalCount > 0 || summary.highCount > 0 || summary.mediumCount > 0;
        break;
      case "low":
        vulnFound = summary.vulnerabilityCount > 0;
        break;
    }

    if (vulnFound) code |= 1;
  }

  if (options.failOnLicense) {
    const threshold = options.failOnLicense.toLowerCase();
    const { licenseCounts } = report.summary;
    let licenseViolation = false;

    if (threshold === "copyleft") {
      licenseViolation = licenseCounts.copyleft > 0;
    } else if (threshold === "weak-copyleft") {
      licenseViolation = licenseCounts.copyleft > 0 || licenseCounts["weak-copyleft"] > 0;
    }

    if (licenseViolation) code |= 2;
  }

  return code;
}

function writeGitHubSummary(report: Report): void {
  try {
    const summaryPath = process.env.GITHUB_STEP_SUMMARY!;
    const { summary } = report;
    const lines = [
      "## ami Security Report",
      "",
      `| Metric | Count |`,
      `|--------|-------|`,
      `| Total packages | ${report.totalPackages} |`,
      `| Vulnerabilities | ${summary.vulnerabilityCount} |`,
      `| Critical | ${summary.criticalCount} |`,
      `| High | ${summary.highCount} |`,
      `| Medium | ${summary.mediumCount} |`,
      `| Low | ${summary.lowCount} |`,
      `| Copyleft licenses | ${summary.licenseCounts.copyleft} |`,
      `| Weak-copyleft licenses | ${summary.licenseCounts["weak-copyleft"]} |`,
      "",
    ];
    const { appendFileSync } = require("node:fs");
    appendFileSync(summaryPath, lines.join("\n"));
  } catch {
    // Non-critical
  }
}

function parsePackageSpec(spec: string): {
  name: string;
  versionRange: string;
} {
  if (spec.startsWith("@")) {
    const slashIndex = spec.indexOf("/");
    if (slashIndex === -1) {
      throw new Error(`Invalid package spec: ${spec}`);
    }
    const rest = spec.slice(slashIndex + 1);
    const atIndex = rest.lastIndexOf("@");
    if (atIndex > 0) {
      return {
        name: spec.slice(0, slashIndex + 1 + atIndex),
        versionRange: rest.slice(atIndex + 1),
      };
    }
    return { name: spec, versionRange: "latest" };
  }

  const atIndex = spec.lastIndexOf("@");
  if (atIndex > 0) {
    return {
      name: spec.slice(0, atIndex),
      versionRange: spec.slice(atIndex + 1),
    };
  }

  return { name: spec, versionRange: "latest" };
}
