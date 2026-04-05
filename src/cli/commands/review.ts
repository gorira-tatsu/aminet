import { access, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import chalk from "chalk";
import ora from "ora";
import { buildReportForPackageSpec } from "../../core/analyzer.js";
import { loadConfig } from "../../core/config/loader.js";
import type { DependencyDiff } from "../../core/diff/types.js";
import { parseLockfile } from "../../core/lockfile/parser.js";
import { buildPythonManifestNotes } from "../../core/lockfile/python-notes.js";
import {
  type ParsedPythonManifest,
  parsePyprojectManifest,
  parseRequirementsManifest,
} from "../../core/lockfile/python-parser.js";
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
  lockfilePath?: string;
}

interface ReviewManifest {
  ecosystem: "npm" | "pypi";
  dependencies: Map<string, string>;
  notes: string[];
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

  const ecosystem = inferReviewEcosystem(target);
  const useSpinner = !options.ci;
  const spinner = useSpinner ? ora("Loading dependency manifests...").start() : null;

  let baseManifest: ReviewManifest;
  try {
    baseManifest = await loadReviewManifest(target, baseRef, options.dev, ecosystem);
    if (spinner) spinner.text = "Loaded base dependency manifest";
  } catch (error) {
    if (spinner) spinner.fail("Failed to load base dependency manifest");
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }

  let headManifest: ReviewManifest;
  try {
    headManifest = await loadReviewManifest(target, headRef, options.dev, ecosystem);
    if (spinner) spinner.text = "Loaded head dependency manifest";
  } catch (error) {
    if (spinner) spinner.fail("Failed to load head dependency manifest");
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }

  const analyzerOptions = {
    depth: options.depth,
    concurrency: options.concurrency,
    dev: options.dev,
    noCache: options.noCache,
    security: options.security,
    ecosystem,
  };

  const baseLockfile = await loadAdjacentLockfile(target, baseRef, options.lockfilePath, ecosystem);
  const headLockfile = await loadAdjacentLockfile(target, headRef, options.lockfilePath, ecosystem);

  const baseDeps = baseManifest.dependencies;
  const headDeps = headManifest.dependencies;
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

  diff.notes = [...new Set([...baseManifest.notes, ...headManifest.notes])];

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

export function inferReviewEcosystem(target: string): "npm" | "pypi" {
  const lower = target.toLowerCase();
  if (
    lower.endsWith("requirements.txt") ||
    lower.endsWith("pyproject.toml") ||
    lower.endsWith("poetry.lock") ||
    lower.endsWith("pdm.lock") ||
    lower.endsWith("uv.lock")
  ) {
    return "pypi";
  }
  return "npm";
}

async function loadReviewManifest(
  filePath: string,
  ref: string | undefined,
  includeDev: boolean | undefined,
  ecosystem: "npm" | "pypi",
): Promise<ReviewManifest> {
  const content = await loadFileAtRefOrPath(filePath, ref);
  if (ecosystem === "pypi") {
    return parsePythonReviewManifest(filePath, content, includeDev);
  }

  const pkg = JSON.parse(content) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return {
    ecosystem,
    dependencies: collectDirectDependencies(pkg, includeDev),
    notes: [],
  };
}

export function parsePythonReviewManifest(
  filePath: string,
  content: string,
  includeDev: boolean | undefined,
): ReviewManifest {
  const baseName = filePath.split(/[/\\]/).pop() ?? filePath;

  if (baseName === "pyproject.toml") {
    const parsed = parsePyprojectManifest(content);
    const dependencies = new Map(parsed.dependencies);
    if (includeDev) {
      for (const [name, version] of parsed.devDependencies) {
        dependencies.set(name, version);
      }
    }
    return {
      ecosystem: "pypi",
      dependencies,
      notes: buildPythonReviewNotes(parsed, includeDev),
    };
  }

  if (baseName === "poetry.lock" || baseName === "pdm.lock" || baseName === "uv.lock") {
    throw new Error(
      `Review mode expects a Python manifest, not ${baseName}. Pass pyproject.toml or requirements.txt and use --lockfile-path if you need pinned versions.`,
    );
  }

  const parsed = parseRequirementsManifest(content);
  return {
    ecosystem: "pypi",
    dependencies: new Map(parsed.dependencies),
    notes: buildPythonReviewNotes(parsed, includeDev),
  };
}

export function buildPythonReviewNotes(
  parsed: ParsedPythonManifest,
  includeDev: boolean | undefined,
): string[] {
  return buildPythonManifestNotes(parsed, {
    includeDev,
    mode: "review",
  });
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

export async function findGitRoot(): Promise<string | null> {
  try {
    const result = await runCommand("git", ["rev-parse", "--show-toplevel"]);
    return result.exitCode === 0 ? result.stdout.trim() : null;
  } catch {
    return null;
  }
}

export function computeWorkspacePath(
  lockfileDir: string,
  packageJsonDir: string,
): string | undefined {
  const rel = relative(lockfileDir, packageJsonDir).replace(/\\/g, "/");
  return rel && rel !== "." ? rel : undefined;
}

function toGitRelativePath(filePath: string, gitRoot: string | null): string {
  if (!gitRoot) {
    return filePath;
  }

  const absolutePath = isAbsolute(filePath) ? filePath : resolve(filePath);
  const relPath = relative(gitRoot, absolutePath);

  if (!relPath || relPath.startsWith("..") || isAbsolute(relPath)) {
    return filePath;
  }

  return relPath.replace(/\\/g, "/");
}

function getReviewLockfileNames(ecosystem: "npm" | "pypi"): string[] {
  return ecosystem === "pypi"
    ? ["uv.lock", "poetry.lock", "pdm.lock"]
    : ["pnpm-lock.yaml", "bun.lock", "package-lock.json"];
}

export async function loadAdjacentLockfile(
  manifestPath: string,
  ref?: string,
  explicitLockfilePath?: string,
  ecosystem: "npm" | "pypi" = "npm",
): Promise<ReturnType<typeof parseLockfile> | null> {
  if (ref && (await isReadableFile(ref))) {
    ref = undefined;
  }

  const manifestDir = resolve(dirname(manifestPath));

  const gitRoot = await findGitRoot();

  // Explicit lockfile path takes priority
  if (explicitLockfilePath) {
    try {
      const absPath = resolve(explicitLockfilePath);
      const gitRelativePath = ref ? toGitRelativePath(absPath, gitRoot) : explicitLockfilePath;
      const content = await loadFileAtRefOrPath(gitRelativePath, ref);
      const lockfileDir = resolve(dirname(explicitLockfilePath));
      const workspacePath = computeWorkspacePath(lockfileDir, manifestDir);
      const parsed = parseLockfile(explicitLockfilePath, content, workspacePath);
      if (parsed && parsed.packages.size > 0) {
        return parsed;
      }
    } catch (error) {
      logger.warn(
        `Failed to load explicit lockfile at "${explicitLockfilePath}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return null;
  }

  // Walk up from the manifest directory, stopping at git root
  let dir = manifestDir;

  while (true) {
    for (const lockfileName of getReviewLockfileNames(ecosystem)) {
      const candidate = join(dir, lockfileName);
      const gitRelativeCandidate = ref ? toGitRelativePath(candidate, gitRoot) : candidate;
      try {
        const content = await loadFileAtRefOrPath(gitRelativeCandidate, ref);
        const workspacePath = computeWorkspacePath(dir, manifestDir);
        const parsed = parseLockfile(candidate, content, workspacePath);
        if (parsed && parsed.packages.size > 0) {
          return parsed;
        }
      } catch {}
    }

    // Stop at git root to avoid picking up unrelated lockfiles
    if (gitRoot && dir === resolve(gitRoot)) break;
    const parent = dirname(dir);
    if (parent === dir) break; // filesystem root fallback
    dir = parent;
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
