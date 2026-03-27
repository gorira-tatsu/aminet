import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import chalk from "chalk";
import ora from "ora";
import { runAnalysisPhases } from "../../core/analysis/phases.js";
import { buildReportFromPackageJson } from "../../core/analyzer.js";
import { loadConfig } from "../../core/config/loader.js";
import type { AmiConfig } from "../../core/config/types.js";
import { resolveDependencyGraph } from "../../core/graph/resolver.js";
import type { DependencyGraph } from "../../core/graph/types.js";
import { checkDenyList } from "../../core/license/deny-list.js";
import { getLicenseAlternatives } from "../../core/license/spdx.js";
import { tryParseLockfile } from "../../core/lockfile/parser.js";
import type { PhantomDependency } from "../../core/phantom/scanner.js";
import { scanPhantomDependencies } from "../../core/phantom/scanner.js";
import type { PinningReport } from "../../core/pinning/analyzer.js";
import { analyzeVersionPinning } from "../../core/pinning/analyzer.js";
import { setNpmCacheEnabled, setNpmToken } from "../../core/registry/npm-client.js";
import { buildReport } from "../../core/report/builder.js";
import type { Report } from "../../core/report/types.js";
import { getDatabase } from "../../core/store/database.js";
import type { VulnSource } from "../../core/vulnerability/aggregator.js";
import { scanVulnerabilities } from "../../core/vulnerability/scanner.js";
import type { VulnerabilityResult } from "../../core/vulnerability/types.js";
import { parseExcludePackages } from "../../utils/exclude.js";
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

  // Initialize DB (ensures ~/.aminet/ exists)
  getDatabase();

  if (options.noCache) {
    setNpmCacheEnabled(false);
  }

  // Set npm token: CLI option > env var > config
  const resolvedNpmToken = options.npmToken ?? process.env.NPM_TOKEN ?? config.npmToken;
  if (resolvedNpmToken) {
    setNpmToken(resolvedNpmToken);
  }

  const isCi = options.ci || false;
  const useSpinner =
    !isCi && !options.dot && !options.mermaid && !options.cyclonedx && !options.spdx;

  // Auto-detect file mode: if target looks like a file path, treat it as --file
  const isFilePath =
    options.file ||
    target.endsWith(".json") ||
    target === "package.json" ||
    target.includes("/") ||
    target.includes("\\") ||
    target.endsWith(".lock") ||
    target === "pnpm-lock.yaml" ||
    target === "bun.lock" ||
    target === "bun.lockb" ||
    target === "package-lock.json";

  if (isFilePath) {
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
  // If user passed a lockfile, find the package.json in the same directory
  let packageJsonPath = filePath;
  const fileBaseName = basename(filePath);
  if (
    fileBaseName === "pnpm-lock.yaml" ||
    fileBaseName === "bun.lock" ||
    fileBaseName === "bun.lockb" ||
    fileBaseName === "package-lock.json"
  ) {
    const dir = dirname(filePath);
    packageJsonPath = join(dir, "package.json");
    if (!existsSync(packageJsonPath)) {
      console.error(
        chalk.red(`No package.json found alongside ${filePath}. Lockfiles need a package.json.`),
      );
      process.exit(1);
    }
    logger.info(`Found package.json at ${packageJsonPath}`);
  }

  const content = await readFile(packageJsonPath, "utf-8");
  const pkg = JSON.parse(content);

  const allDeps: Record<string, string> = {
    ...(pkg.dependencies ?? {}),
    ...(options.dev ? (pkg.devDependencies ?? {}) : {}),
  };

  const depEntries = Object.entries(allDeps);
  if (depEntries.length === 0) {
    console.error(chalk.yellow(`No dependencies found in ${packageJsonPath}`));
    return;
  }

  // Try to find a lockfile for pinned versions
  const lockfile = await tryParseLockfile(packageJsonPath);
  if (lockfile) {
    // Override version ranges with pinned versions from lockfile
    let pinned = 0;
    for (const [name] of Object.entries(allDeps)) {
      const pinnedVersion = lockfile.packages.get(name);
      if (pinnedVersion) {
        allDeps[name] = pinnedVersion;
        pinned++;
      }
    }
    if (pinned > 0) {
      logger.info(`Pinned ${pinned}/${depEntries.length} dependencies from ${lockfile.format}`);
      // Update pkg object so buildReportFromPackageJson uses pinned versions
      pkg.dependencies = { ...(pkg.dependencies ?? {}) };
      if (options.dev && pkg.devDependencies) {
        pkg.devDependencies = { ...pkg.devDependencies };
      }
      for (const [name, version] of Object.entries(allDeps)) {
        if (pkg.dependencies?.[name]) {
          pkg.dependencies[name] = version;
        }
        if (options.dev && pkg.devDependencies?.[name]) {
          pkg.devDependencies[name] = version;
        }
      }
    }
  }

  const spinner = useSpinner
    ? ora(`Analyzing ${depEntries.length} dependencies from ${packageJsonPath}...`).start()
    : null;

  if (!useSpinner) {
    logger.info(`Analyzing ${depEntries.length} dependencies from ${packageJsonPath}`);
  }

  // Use buildReportFromPackageJson for file analysis
  const excludePackages = parseExcludePackages(options.excludePackages, config.excludePackages);
  const result = await buildReportFromPackageJson(pkg, {
    depth: options.depth,
    concurrency: options.concurrency,
    dev: options.dev,
    noCache: options.noCache,
    excludePackages,
  });

  if (spinner) {
    spinner.succeed(`Resolved ${result.graph.nodes.size} packages`);
  }

  // Apply license overrides
  applyLicenseOverrides(result.graph, config);

  // Phantom dependencies (file-mode only)
  let phantomDeps: PhantomDependency[] | undefined;
  if (options.phantom) {
    const projectDir = dirname(packageJsonPath);
    const spinner2 = useSpinner ? ora("Scanning for phantom dependencies...").start() : null;
    try {
      phantomDeps = await scanPhantomDependencies(projectDir, allDeps);
      if (spinner2) {
        if (phantomDeps.length > 0) {
          spinner2.warn(chalk.yellow(`Found ${phantomDeps.length} phantom dependencies`));
        } else {
          spinner2.succeed("No phantom dependencies found");
        }
      }
    } catch {
      if (spinner2) spinner2.warn("Phantom dependency scan failed");
    }
  }

  // Version pinning analysis (file-mode only)
  let pinningReport: PinningReport | undefined;
  if (options.pinning) {
    pinningReport = analyzeVersionPinning(
      { ...(pkg.dependencies ?? {}), ...(options.dev ? (pkg.devDependencies ?? {}) : {}) },
      lockfile ?? null,
    );
  }

  outputAndExit(result.graph, result.vulnerabilities, options, config, {
    phantomDeps,
    pinningReport,
  });
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

  // Parse vuln sources
  const vulnSources = parseVulnSources(options.vulnSources);

  const vulnerabilities = await scanPhase(graph, options, useSpinner, vulnSources);

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

async function scanPhase(
  graph: DependencyGraph,
  options: AnalyzeOptions,
  useSpinner: boolean,
  vulnSources?: VulnSource[],
): Promise<VulnerabilityResult[]> {
  const spinner = useSpinner ? ora("Scanning for vulnerabilities...").start() : null;

  if (!useSpinner) {
    logger.info("Scanning for vulnerabilities...");
  }

  let vulnerabilities: VulnerabilityResult[];
  try {
    vulnerabilities = await scanVulnerabilities(
      graph,
      options.concurrency ?? 5,
      !options.noCache,
      vulnSources,
    );
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

interface ExtraReportData {
  phantomDeps?: PhantomDependency[];
  pinningReport?: PinningReport;
}

async function outputAndExit(
  graph: DependencyGraph,
  vulnerabilities: VulnerabilityResult[],
  options: AnalyzeOptions,
  config: AmiConfig,
  extra?: ExtraReportData,
): Promise<void> {
  const isCi = options.ci || false;
  const useSpinner =
    !isCi && !options.dot && !options.mermaid && !options.cyclonedx && !options.spdx;

  let reportOptions = {};
  const phaseSpinner = useSpinner ? ora("Running analysis phases...").start() : null;
  try {
    const phaseResult = await runAnalysisPhases(
      graph,
      {
        concurrency: options.concurrency,
        noCache: options.noCache,
        security: options.security,
        licenseReport: options.licenseReport,
        enhancedLicense: options.enhancedLicense,
        trustScore: options.trustScore,
        freshness: options.freshness,
        provenance: options.provenance,
        minTrustScore: options.minTrustScore,
        deepLicenseCheck: options.deepLicenseCheck,
      },
      {
        phantomDeps: extra?.phantomDeps,
        pinningReport: extra?.pinningReport,
      },
    );
    reportOptions = phaseResult.reportOptions;
    if (phaseSpinner) {
      phaseSpinner.succeed("Analysis phases complete");
    }
  } catch {
    if (phaseSpinner) {
      phaseSpinner.warn("Optional analysis phases failed, continuing with core report");
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
          const nonDenied = getLicenseAlternatives(v.license)
            .filter((alternative) => !alternative.some((part) => v.deniedIds.includes(part)))
            .map((alternative) => alternative.join(" AND "));
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
        return getLicenseAlternatives(v.license).every((alternative) =>
          alternative.some((part) => denied.includes(part)),
        );
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
      return !getLicenseAlternatives(e.license).some((alternative) =>
        alternative.every((part) => allowSet.has(part)),
      );
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
  if (options.failOnVuln || options.failOnLicense || options.minTrustScore) {
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

  // Trust score threshold
  if (options.minTrustScore) {
    const belowThreshold = report.entries.some(
      (e) => e.trustScore && e.trustScore.overall < options.minTrustScore!,
    );
    if (belowThreshold) code |= 8;
  }

  return code;
}

function writeGitHubSummary(report: Report): void {
  try {
    const summaryPath = process.env.GITHUB_STEP_SUMMARY!;
    const { summary } = report;
    const lines = [
      "## aminet Security Report",
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

function parseVulnSources(sourcesStr?: string): VulnSource[] | undefined {
  if (!sourcesStr) return undefined;
  return sourcesStr.split(",").map((s) => s.trim() as VulnSource);
}
