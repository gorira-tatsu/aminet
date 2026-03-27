import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import chalk from "chalk";
import ora from "ora";
import { buildReportForPackageSpec } from "../../core/analyzer.js";
import { loadConfig } from "../../core/config/loader.js";
import type { DependencyDiff } from "../../core/diff/types.js";
import { parseLockfile } from "../../core/lockfile/parser.js";
import { setNpmCacheEnabled, setNpmToken } from "../../core/registry/npm-client.js";
import {
  buildReviewDiff,
  collectDirectDependencies,
  diffDirectDependencies,
  type ReviewPackageAnalysis,
  resolveDirectDependencyVersions,
} from "../../core/review/fast-path.js";
import { getDatabase } from "../../core/store/database.js";
import { mapConcurrent } from "../../utils/concurrency.js";
import { isExcludedPackage, parseExcludePackages } from "../../utils/exclude.js";
import { fetchWithRetry } from "../../utils/http.js";
import { logger, setLogLevel } from "../../utils/logger.js";
import { runCommand } from "../../utils/process.js";
import type { AnalyzeOptions } from "../options.js";
import { renderMarkdownComment } from "../output/markdown.js";

export interface ReviewOptions extends AnalyzeOptions {
  base?: string;
  head?: string;
  prNumber?: string;
  repo?: string;
  updateComment?: boolean;
}

export async function reviewCommand(target: string, options: ReviewOptions): Promise<void> {
  if (options.verbose) {
    setLogLevel("debug");
  }

  getDatabase();

  if (options.noCache) {
    setNpmCacheEnabled(false);
  }

  // Load config early for token + exclude resolution
  const config = loadConfig(dirname(target));

  // Set npm token: CLI option > env var > config
  const resolvedNpmToken = options.npmToken ?? process.env.NPM_TOKEN ?? config.npmToken;
  if (resolvedNpmToken) {
    setNpmToken(resolvedNpmToken);
  }

  const baseRef = options.base ?? "HEAD~1";
  const headRef = options.head; // undefined means working tree

  const useSpinner = !options.ci;
  const spinner = useSpinner ? ora("Loading package.json versions...").start() : null;

  // Load base package.json
  let basePkg: Record<string, unknown>;
  try {
    basePkg = await loadPackageJson(target, baseRef);
    if (spinner) spinner.text = "Loaded base package.json";
  } catch (error) {
    if (spinner) spinner.fail("Failed to load base package.json");
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }

  // Load head package.json
  let headPkg: Record<string, unknown>;
  try {
    headPkg = await loadPackageJson(target, headRef);
    if (spinner) spinner.text = "Loaded head package.json";
  } catch (error) {
    if (spinner) spinner.fail("Failed to load head package.json");
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }

  const analyzerOptions = {
    depth: options.depth,
    concurrency: options.concurrency,
    dev: options.dev,
    noCache: options.noCache,
    security: options.security,
  };

  const baseLockfile = await loadAdjacentLockfile(target, baseRef);
  const headLockfile = await loadAdjacentLockfile(target, headRef);

  const baseDeps = collectDirectDependencies(
    basePkg as Parameters<typeof collectDirectDependencies>[0],
    options.dev,
  );
  const headDeps = collectDirectDependencies(
    headPkg as Parameters<typeof collectDirectDependencies>[0],
    options.dev,
  );
  const baseResolved = resolveDirectDependencyVersions(baseDeps, baseLockfile);
  const headResolved = resolveDirectDependencyVersions(headDeps, headLockfile);
  const allChanges = diffDirectDependencies(baseDeps, headDeps, baseResolved, headResolved);

  // Apply exclude-packages filter (CLI option + config)
  const excludePatterns = parseExcludePackages(options.excludePackages, config.excludePackages);
  const changes =
    excludePatterns.length > 0
      ? allChanges.filter((c) => !isExcludedPackage(c.name, excludePatterns))
      : allChanges;

  let diff: DependencyDiff;
  if (changes.length === 0) {
    if (spinner) spinner.succeed("No direct dependency changes");
    diff = buildReviewDiff([], new Map(), new Map());
  } else {
    if (spinner) spinner.text = `Analyzing ${changes.length} changed direct dependencies...`;

    const baseAnalyses = new Map<string, ReviewPackageAnalysis>();
    const headAnalyses = new Map<string, ReviewPackageAnalysis>();
    const analysisCache = new Map<string, Awaited<ReturnType<typeof buildReportForPackageSpec>>>();

    await mapConcurrent(changes, options.concurrency ?? 5, async (change) => {
      try {
        if (change.changeType === "removed" || change.changeType === "updated") {
          const spec = change.baseResolved ?? change.baseDeclared;
          if (spec) {
            const result = await analyzePackageWithCache(
              change.name,
              spec,
              analyzerOptions,
              analysisCache,
            );
            baseAnalyses.set(change.name, {
              name: change.name,
              declaredVersion: change.baseDeclared ?? null,
              resolvedVersion:
                (result.report.root.split("@").slice(1).join("@") || change.baseResolved) ?? null,
              report: result.report,
            });
          }
        }

        if (change.changeType === "added" || change.changeType === "updated") {
          const spec = change.headResolved ?? change.headDeclared;
          if (spec) {
            const result = await analyzePackageWithCache(
              change.name,
              spec,
              analyzerOptions,
              analysisCache,
            );
            headAnalyses.set(change.name, {
              name: change.name,
              declaredVersion: change.headDeclared ?? null,
              resolvedVersion:
                (result.report.root.split("@").slice(1).join("@") || change.headResolved) ?? null,
              report: result.report,
            });
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Skipping ${change.name}: ${msg}`);
      }
    });

    if (spinner) spinner.succeed("Analysis complete");
    diff = buildReviewDiff(changes, baseAnalyses, headAnalyses);
  }

  const markdown = renderMarkdownComment(diff);

  // Post to GitHub PR if credentials available
  const token = process.env.GITHUB_TOKEN;
  const repo = options.repo ?? process.env.GITHUB_REPOSITORY;
  const prNumber = options.prNumber ?? process.env.PR_NUMBER;

  if (token && repo && prNumber && options.updateComment !== false) {
    const prSpinner = useSpinner ? ora("Posting PR comment...").start() : null;
    try {
      await postOrUpdateComment(repo, parseInt(prNumber, 10), markdown, token);
      if (prSpinner) prSpinner.succeed("PR comment posted");
    } catch (error) {
      if (prSpinner) prSpinner.fail("Failed to post PR comment");
      console.error(chalk.yellow(error instanceof Error ? error.message : String(error)));
      // Fall through to stdout output
      console.log(markdown);
    }
  } else {
    // Output to stdout for piping
    console.log(markdown);
  }
}

async function analyzePackageWithCache(
  name: string,
  versionSpec: string,
  options: Parameters<typeof buildReportForPackageSpec>[2],
  cache: Map<string, Awaited<ReturnType<typeof buildReportForPackageSpec>>>,
): Promise<Awaited<ReturnType<typeof buildReportForPackageSpec>>> {
  const key = `${name}@${versionSpec}`;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  const result = await buildReportForPackageSpec(name, versionSpec, options);
  cache.set(key, result);
  return result;
}

async function loadPackageJson(filePath: string, ref?: string): Promise<Record<string, unknown>> {
  const content = await loadFileAtRefOrPath(filePath, ref);
  return JSON.parse(content);
}

async function loadFileAtRefOrPath(filePath: string, ref?: string): Promise<string> {
  if (!ref) {
    return readFile(filePath, "utf-8");
  }

  // Try as git ref first
  try {
    const result = await runCommand("git", ["show", `${ref}:${filePath}`]);
    if (result.exitCode === 0 && result.stdout.trim()) {
      return result.stdout;
    }
  } catch {
    // Not a git ref, try as file path
  }

  // Try as file path
  return readFile(ref, "utf-8");
}

async function loadAdjacentLockfile(
  packageJsonPath: string,
  ref?: string,
): Promise<ReturnType<typeof parseLockfile> | null> {
  if (ref && (await isReadableFile(ref))) {
    ref = undefined;
  }

  const prefix = dirname(packageJsonPath);
  const candidates = [
    join(prefix === "." ? "" : prefix, "pnpm-lock.yaml"),
    join(prefix === "." ? "" : prefix, "bun.lock"),
    join(prefix === "." ? "" : prefix, "package-lock.json"),
  ];

  for (const candidate of candidates) {
    try {
      const content = await loadFileAtRefOrPath(candidate, ref);
      const parsed = parseLockfile(candidate, content);
      if (parsed && parsed.packages.size > 0) {
        return parsed;
      }
    } catch {}
  }

  return null;
}

async function isReadableFile(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function postOrUpdateComment(
  repo: string,
  prNumber: number,
  body: string,
  token: string,
): Promise<void> {
  const apiBase = "https://api.github.com";
  const marker = "<!-- aminet-review -->";
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };

  // Search for existing comment
  const listUrl = `${apiBase}/repos/${repo}/issues/${prNumber}/comments?per_page=100`;
  const listResponse = await fetchWithRetry(listUrl, { headers });

  if (!listResponse.ok) {
    throw new Error(`Failed to list PR comments: ${listResponse.status}`);
  }

  const comments = (await listResponse.json()) as Array<{
    id: number;
    body: string;
  }>;
  const existing = comments.find((c) => c.body.includes(marker));

  if (existing) {
    // Update existing comment
    const updateUrl = `${apiBase}/repos/${repo}/issues/comments/${existing.id}`;
    const response = await fetchWithRetry(updateUrl, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ body }),
    });
    if (!response.ok) {
      throw new Error(`Failed to update comment: ${response.status}`);
    }
    logger.debug(`Updated existing comment ${existing.id}`);
  } else {
    // Create new comment
    const createUrl = `${apiBase}/repos/${repo}/issues/${prNumber}/comments`;
    const response = await fetchWithRetry(createUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ body }),
    });
    if (!response.ok) {
      throw new Error(`Failed to create comment: ${response.status}`);
    }
    logger.debug("Created new PR comment");
  }
}
