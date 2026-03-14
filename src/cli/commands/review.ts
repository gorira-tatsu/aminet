import { readFile } from "node:fs/promises";
import chalk from "chalk";
import ora from "ora";
import { buildReportFromPackageJson } from "../../core/analyzer.js";
import { computeDiff } from "../../core/diff/reporter.js";
import { setNpmCacheEnabled } from "../../core/registry/npm-client.js";
import { getDatabase } from "../../core/store/database.js";
import { fetchWithRetry } from "../../utils/http.js";
import { logger, setLogLevel } from "../../utils/logger.js";
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

  if (spinner) spinner.text = "Analyzing base dependencies...";

  const analyzerOptions = {
    depth: options.depth,
    concurrency: options.concurrency,
    dev: options.dev,
    noCache: options.noCache,
  };

  const baseResult = await buildReportFromPackageJson(
    basePkg as Parameters<typeof buildReportFromPackageJson>[0],
    analyzerOptions,
  );

  if (spinner) spinner.text = "Analyzing head dependencies...";

  const headResult = await buildReportFromPackageJson(
    headPkg as Parameters<typeof buildReportFromPackageJson>[0],
    analyzerOptions,
  );

  if (spinner) spinner.succeed("Analysis complete");

  const diff = computeDiff(baseResult.report, headResult.report);
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

async function loadPackageJson(filePath: string, ref?: string): Promise<Record<string, unknown>> {
  if (!ref) {
    // Read from working tree
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content);
  }

  // Try as git ref first
  try {
    const proc = Bun.spawn(["git", "show", `${ref}:${filePath}`], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const text = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode === 0 && text.trim()) {
      return JSON.parse(text);
    }
  } catch {
    // Not a git ref, try as file path
  }

  // Try as file path
  const content = await readFile(ref, "utf-8");
  return JSON.parse(content);
}

async function postOrUpdateComment(
  repo: string,
  prNumber: number,
  body: string,
  token: string,
): Promise<void> {
  const apiBase = "https://api.github.com";
  const marker = "<!-- ami-review -->";
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
