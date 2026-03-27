#!/usr/bin/env node
import { Command } from "commander";
import { analyzeCommand } from "./cli/commands/analyze.js";
import { cacheClearCommand, cachePruneCommand, cacheStatsCommand } from "./cli/commands/cache.js";
import { initCommand } from "./cli/commands/init.js";
import { reviewCommand } from "./cli/commands/review.js";

const program = new Command();

program
  .name("aminet")
  .description("Software supply chain security tool for npm and Python packages")
  .version("0.1.1");

// analyze command
program
  .command("analyze")
  .description("Analyze dependencies, licenses, and vulnerabilities")
  .argument(
    "<package>",
    "Package (e.g., express@4.21.2) or file path (package.json, requirements.txt)",
  )
  .option("--json", "Output as JSON")
  .option("--tree", "Output as dependency tree")
  .option("--dot", "Output as Graphviz DOT format")
  .option("--mermaid", "Output as Mermaid diagram")
  .option("-d, --depth <number>", "Maximum dependency depth", parseInt)
  .option("-c, --concurrency <number>", "Maximum concurrent requests", parseInt)
  .option("--dev", "Include devDependencies")
  .option("--file", "Force file mode (auto-detected for .json/.lock paths)")
  .option("--no-cache", "Skip cache reads (still writes)")
  .option("-v, --verbose", "Verbose logging")
  .option("--ci", "CI mode (no spinner, exit codes enabled)")
  .option(
    "--fail-on-vuln <severity>",
    "Exit non-zero on vulnerabilities at or above severity (low/medium/high/critical)",
  )
  .option(
    "--fail-on-license <category>",
    "Exit non-zero on license category (copyleft/weak-copyleft)",
  )
  .option(
    "--deny-license <licenses>",
    "Comma-separated list of SPDX IDs to deny (e.g., GPL-3.0,AGPL-3.0)",
  )
  .option("--notices", "Output third-party license attribution list")
  .option("--deep-license-check", "Verify LICENSE files from npm tarballs")
  .option("--cyclonedx", "Output CycloneDX 1.5 SBOM")
  .option("--spdx", "Output SPDX 2.3 SBOM")
  .option("--security", "Enable security deep analysis")
  .option("--license-report", "Enable GPL contamination trace and compatibility check")
  // Phase 5: Multi-source vulnerabilities
  .option("--vuln-sources <sources>", "Comma-separated vulnerability sources (osv,ghsa,npm-audit)")
  .option("--enhanced-license", "Enable ClearlyDefined license intelligence")
  // Phase 6: Trust score + Freshness
  .option("--trust-score", "Compute package trust scores (OpenSSF Scorecard + downloads)")
  .option("--freshness", "Analyze dependency freshness")
  .option(
    "--min-trust-score <number>",
    "Exit non-zero if any package trust score is below threshold",
    parseInt,
  )
  // Phase 7: Supply chain defense
  .option("--phantom", "Detect phantom (undeclared) dependencies")
  .option("--provenance", "Check npm provenance attestations")
  .option("--pinning", "Analyze version pinning strategy")
  // Private package support
  .option(
    "--exclude-packages <list>",
    "Comma-separated packages to skip (supports wildcards, e.g., @scope/*)",
  )
  .option("--npm-token <token>", "npm auth token for private registries")
  .option("--ecosystem <name>", "Package ecosystem: npm or pypi (auto-detected from file)")
  .action(analyzeCommand);

// ci command (alias for analyze --ci --json)
program
  .command("ci")
  .description("CI-optimized analysis (alias for analyze --ci --json)")
  .argument("<package>", "Package or --file path to analyze")
  .option("--file", "Treat argument as path to package.json")
  .option("-d, --depth <number>", "Maximum dependency depth", parseInt)
  .option("--dev", "Include devDependencies")
  .option("--fail-on-vuln <severity>", "Exit non-zero on vulnerabilities (default: high)")
  .option("--fail-on-license <category>", "Exit non-zero on license category")
  .option("--deny-license <licenses>", "Comma-separated list of SPDX IDs to deny")
  .option("--security", "Enable security deep analysis")
  .option("--vuln-sources <sources>", "Comma-separated vulnerability sources")
  .option("--trust-score", "Compute package trust scores")
  .option("--min-trust-score <number>", "Fail if trust score below threshold", parseInt)
  .action((target, opts) => {
    return analyzeCommand(target, { ...opts, ci: true, json: true });
  });

// review command (PR review bot)
program
  .command("review")
  .description("Compare dependency changes between two versions for PR review")
  .argument("<path>", "Path to package.json")
  .option("--base <ref>", "Base git ref or file path (default: HEAD~1)")
  .option("--head <ref>", "Head git ref or file path (default: working tree)")
  .option("--pr-number <number>", "GitHub PR number for comment posting")
  .option("--repo <owner/name>", "GitHub repository (e.g., user/repo)")
  .option("--update-comment", "Update existing aminet comment instead of creating new")
  .option("-d, --depth <number>", "Maximum dependency depth", parseInt)
  .option("-c, --concurrency <number>", "Maximum concurrent requests", parseInt)
  .option("--no-dev", "Exclude devDependencies from review")
  .option("--no-cache", "Skip cache reads")
  .option("--security", "Enable security deep analysis")
  .option("--lockfile-path <path>", "Explicit path to lockfile (for monorepos)")
  .option(
    "--exclude-packages <list>",
    "Comma-separated packages to skip (supports wildcards, e.g., @scope/*)",
  )
  .option("--npm-token <token>", "npm auth token for private registries")
  .option("-v, --verbose", "Verbose logging")
  .option("--ci", "CI mode (no spinner)")
  .action(reviewCommand);

// init command
program
  .command("init")
  .description("Generate aminet.config.json interactively")
  .option("--defaults", "Use default values (non-interactive)")
  .option("--force", "Overwrite existing config (use with --defaults)")
  .option("--merge", "Merge with existing config (use with --defaults)")
  .action(initCommand);

// cache commands
const cache = program.command("cache").description("Manage the local cache");

cache.command("stats").description("Show cache statistics").action(cacheStatsCommand);

cache.command("clear").description("Clear all cached data").action(cacheClearCommand);

cache.command("prune").description("Remove expired cached data").action(cachePruneCommand);

program.parse();
