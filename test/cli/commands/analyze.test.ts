import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loadConfig } = vi.hoisted(() => ({
  loadConfig: vi.fn(() => ({})),
}));

const { getDatabase } = vi.hoisted(() => ({
  getDatabase: vi.fn(),
}));

const { buildReportFromPackageJson } = vi.hoisted(() => ({
  buildReportFromPackageJson: vi.fn(),
}));

const { runAnalysisPhases } = vi.hoisted(() => ({
  runAnalysisPhases: vi.fn(),
}));

const { buildReport } = vi.hoisted(() => ({
  buildReport: vi.fn(),
}));

const { renderJson } = vi.hoisted(() => ({
  renderJson: vi.fn(),
}));

vi.mock("../../../src/core/config/loader.js", () => ({
  loadConfig,
}));

vi.mock("../../../src/core/store/database.js", () => ({
  getDatabase,
}));

vi.mock("../../../src/core/analyzer.js", () => ({
  buildReportFromPackageJson,
}));

vi.mock("../../../src/core/analysis/phases.js", () => ({
  runAnalysisPhases,
}));

vi.mock("../../../src/core/report/builder.js", () => ({
  buildReport,
}));

vi.mock("../../../src/cli/output/json.js", () => ({
  renderJson,
}));

import { analyzeCommand, inferAnalyzeTarget } from "../../../src/cli/commands/analyze.js";

function createGraph() {
  return {
    root: "python-app@1.2.3",
    nodes: new Map(),
    edges: [],
  };
}

function createReport() {
  return {
    root: "python-app@1.2.3",
    totalPackages: 1,
    directDependencies: 1,
    maxDepth: 1,
    entries: [],
    summary: {
      licenseCounts: {
        permissive: 0,
        copyleft: 0,
        "weak-copyleft": 0,
        unknown: 0,
      },
      vulnerabilityCount: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
    },
  };
}

describe("inferAnalyzeTarget", () => {
  it("auto-detects requirements.txt as a PyPI file target", () => {
    expect(inferAnalyzeTarget("requirements.txt", {})).toEqual({
      ecosystem: "pypi",
      fileMode: true,
    });
  });

  it("auto-detects pyproject.toml as a PyPI file target", () => {
    expect(inferAnalyzeTarget("services/api/pyproject.toml", {})).toEqual({
      ecosystem: "pypi",
      fileMode: true,
    });
  });

  it.each([
    "poetry.lock",
    "pdm.lock",
    "uv.lock",
  ])("auto-detects %s as a PyPI file target", (lockfileName) => {
    expect(inferAnalyzeTarget(lockfileName, {})).toEqual({
      ecosystem: "pypi",
      fileMode: true,
    });
  });

  it("does not treat package.json as a Python target", () => {
    expect(inferAnalyzeTarget("package.json", {})).toEqual({
      ecosystem: "npm",
      fileMode: true,
    });
  });

  it("preserves an explicit pypi ecosystem override", () => {
    expect(inferAnalyzeTarget("deps.txt", { ecosystem: "pypi", file: true })).toEqual({
      ecosystem: "pypi",
      fileMode: true,
    });
  });
});

describe("analyzeCommand Python lockfile support", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "aminet-analyze-"));
    getDatabase.mockReset();
    buildReportFromPackageJson.mockReset();
    runAnalysisPhases.mockReset();
    buildReport.mockReset();
    renderJson.mockReset();

    buildReportFromPackageJson.mockResolvedValue({
      graph: createGraph(),
      vulnerabilities: [],
    });
    runAnalysisPhases.mockResolvedValue({ reportOptions: {} });
    buildReport.mockReturnValue(createReport());
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it.each([
    ["poetry.lock", "2.32.3"],
    ["pdm.lock", "2.32.2"],
    ["uv.lock", "2.32.1"],
  ])("pins direct dependencies from %s", async (lockfileName, pinnedVersion) => {
    const pyprojectPath = join(tempRoot, "pyproject.toml");
    const lockfilePath = join(tempRoot, lockfileName);

    await writeFile(
      pyprojectPath,
      [
        "[project]",
        'name = "python-app"',
        'version = "1.2.3"',
        'dependencies = ["requests>=2.31"]',
      ].join("\n"),
    );
    await writeFile(
      lockfilePath,
      ["[[package]]", 'name = "requests"', `version = "${pinnedVersion}"`].join("\n"),
    );

    await analyzeCommand(lockfilePath, { ci: true, json: true });

    expect(buildReportFromPackageJson).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "python-app",
        version: "1.2.3",
        dependencies: {
          requests: pinnedVersion,
        },
      }),
      expect.objectContaining({
        ecosystem: "pypi",
      }),
    );
    expect(renderJson).toHaveBeenCalledWith(
      expect.objectContaining({
        analysisNotes: expect.arrayContaining([
          `Pinned 1/1 Python direct dependencies from ${lockfileName}.`,
        ]),
      }),
    );
  });

  it("fails when a Python lockfile does not have an adjacent pyproject.toml", async () => {
    const lockfilePath = join(tempRoot, "uv.lock");
    await writeFile(
      lockfilePath,
      ["[[package]]", 'name = "requests"', 'version = "2.32.0"'].join("\n"),
    );

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code}`);
    }) as never);
    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(analyzeCommand(lockfilePath, { ci: true, json: true })).rejects.toThrow(
        "process.exit:1",
      );

      expect(stderrSpy.mock.calls.map(([value]) => String(value)).join("\n")).toContain(
        "No pyproject.toml found alongside",
      );
      expect(buildReportFromPackageJson).not.toHaveBeenCalled();
    } finally {
      exitSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });
});
