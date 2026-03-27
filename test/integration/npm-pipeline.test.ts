/**
 * Integration tests for the npm analysis pipeline.
 *
 * Uses real package.json files from popular OSS projects (express, fastify, got)
 * as fixtures, with mocked network calls to verify the full pipeline:
 *   parse package.json → resolve graph → scan vulns → build report
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Mock all network-calling modules so tests run offline
vi.mock("../../src/core/graph/resolver.js", () => ({
  resolveDependencyGraph: vi.fn().mockImplementation(async (name: string, version: string) => ({
    root: `${name}@${version.replace(/[\^~>=<]/g, "")}`,
    nodes: new Map([
      [
        `${name}@${version.replace(/[\^~>=<]/g, "")}`,
        {
          id: `${name}@${version.replace(/[\^~>=<]/g, "")}`,
          name,
          version: version.replace(/[\^~>=<]/g, ""),
          license: "MIT",
          licenseCategory: "permissive",
          depth: 0,
          parents: new Set(),
          dependencies: new Map(),
        },
      ],
    ]),
    edges: [],
  })),
}));

vi.mock("../../src/core/vulnerability/scanner.js", () => ({
  scanVulnerabilities: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../src/core/analysis/phases.js", () => ({
  runAnalysisPhases: vi.fn().mockResolvedValue({
    reportOptions: {},
    sharedPackuments: new Map(),
    lowTrustCount: 0,
  }),
}));

import { buildReportFromPackageJson } from "../../src/core/analyzer.js";
import { resolveDependencyGraph } from "../../src/core/graph/resolver.js";

const FIXTURES = join(import.meta.dirname, "../fixtures/npm");

function loadFixture(name: string) {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf-8"));
}

describe("npm pipeline: express", () => {
  const pkg = loadFixture("express-package.json");

  it("parses all production dependencies", () => {
    const deps = Object.keys(pkg.dependencies ?? {});
    expect(deps.length).toBeGreaterThanOrEqual(25);
    expect(deps).toContain("body-parser");
    expect(deps).toContain("cookie");
    expect(deps).toContain("send");
  });

  it("runs full pipeline and produces a report", async () => {
    const result = await buildReportFromPackageJson(pkg, { depth: 1, noCache: true });

    expect(result.report).toBeDefined();
    expect(result.report.root).toContain("express");
    expect(result.graph.nodes.size).toBeGreaterThanOrEqual(1);
    expect(result.report.entries.length).toBeGreaterThanOrEqual(1);

    // Each declared dep should have been resolved
    const depCount = Object.keys(pkg.dependencies).length;
    expect(resolveDependencyGraph).toHaveBeenCalledTimes(depCount);
  });

  it("includes devDependencies when dev=true", async () => {
    (resolveDependencyGraph as any).mockClear();

    const result = await buildReportFromPackageJson(pkg, { depth: 1, noCache: true, dev: true });

    const totalDeps =
      Object.keys(pkg.dependencies ?? {}).length + Object.keys(pkg.devDependencies ?? {}).length;
    expect(resolveDependencyGraph).toHaveBeenCalledTimes(totalDeps);
    expect(result.report.totalPackages).toBeGreaterThan(0);
  });

  it("excludes packages via excludePackages option", async () => {
    (resolveDependencyGraph as any).mockClear();

    await buildReportFromPackageJson(pkg, {
      depth: 1,
      noCache: true,
      excludePackages: ["body-parser", "cookie"],
    });

    const resolvedNames = (resolveDependencyGraph as any).mock.calls.map((c: unknown[]) => c[0]);
    expect(resolveDependencyGraph).toHaveBeenCalledTimes(Object.keys(pkg.dependencies).length - 2);
    expect(resolvedNames).not.toContain("body-parser");
    expect(resolvedNames).not.toContain("cookie");
    expect(resolvedNames).toContain("send");
  });
});

describe("npm pipeline: fastify", () => {
  const pkg = loadFixture("fastify-package.json");

  it("parses fastify dependencies correctly", () => {
    const deps = Object.keys(pkg.dependencies ?? {});
    expect(deps.length).toBeGreaterThanOrEqual(10);
    expect(deps).toContain("fast-json-stringify");
  });

  it("produces a valid report", async () => {
    const result = await buildReportFromPackageJson(pkg, { depth: 1, noCache: true });

    expect(result.report.root).toContain("fastify");
    expect(result.report.totalPackages).toBeGreaterThan(0);
    expect(result.report.summary.licenseCounts).toBeDefined();
  });
});

describe("npm pipeline: got", () => {
  const pkg = loadFixture("got-package.json");

  it("parses got dependencies correctly", () => {
    const deps = Object.keys(pkg.dependencies ?? {});
    expect(deps.length).toBeGreaterThanOrEqual(8);
  });

  it("produces a valid report with license summary", async () => {
    const result = await buildReportFromPackageJson(pkg, { depth: 1, noCache: true });

    expect(result.report.totalPackages).toBeGreaterThan(0);
    expect(result.report.summary.licenseCounts.permissive).toBeGreaterThanOrEqual(0);
    expect(result.report.maxDepth).toBeGreaterThanOrEqual(0);
  });
});
