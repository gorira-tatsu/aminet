import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { buildReportForPackageSpec } = vi.hoisted(() => ({
  buildReportForPackageSpec: vi.fn(),
}));

const { loadConfig } = vi.hoisted(() => ({
  loadConfig: vi.fn(() => ({})),
}));

const { getDatabase } = vi.hoisted(() => ({
  getDatabase: vi.fn(),
}));

const { fetchWithRetry } = vi.hoisted(() => ({
  fetchWithRetry: vi.fn(),
}));

vi.mock("../../../src/core/analyzer.js", () => ({
  buildReportForPackageSpec,
}));

vi.mock("../../../src/core/config/loader.js", () => ({
  loadConfig,
}));

vi.mock("../../../src/core/store/database.js", () => ({
  getDatabase,
}));

vi.mock("../../../src/utils/http.js", () => ({
  fetchWithRetry,
}));

import { loadAdjacentLockfile, reviewCommand } from "../../../src/cli/commands/review.js";

describe("reviewCommand Python regression coverage", () => {
  let tempRoot: string;
  let previousCwd: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "aminet-review-python-"));
    previousCwd = process.cwd();
    process.chdir(tempRoot);
    execFileSync("git", ["init"], { cwd: tempRoot });
    execFileSync("git", ["config", "user.email", "codex@example.com"], { cwd: tempRoot });
    execFileSync("git", ["config", "user.name", "Codex"], { cwd: tempRoot });

    buildReportForPackageSpec.mockReset();
    buildReportForPackageSpec.mockImplementation(async (name: string, spec: string) => ({
      graph: { nodes: new Map(), edges: [], root: `${name}@${spec}` },
      vulnerabilities: [],
      report: {
        root: `${name}@${spec}`,
        totalPackages: 1,
        directDependencies: 1,
        maxDepth: 1,
        entries: [
          {
            name,
            version: spec,
            id: `${name}@${spec}`,
            depth: 0,
            license: "MIT",
            licenseCategory: "permissive",
            vulnerabilities: [],
          },
        ],
        summary: {
          licenseCounts: {
            permissive: 1,
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
      },
    }));
  });

  afterEach(async () => {
    process.chdir(previousCwd);
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("renders a Python review diff and markdown output from a temp git repo", async () => {
    await writeText(
      "services/api/pyproject.toml",
      [
        "[project]",
        'name = "api"',
        'version = "1.0.0"',
        'dependencies = ["fastapi>=0.116"]',
        "",
      ].join("\n"),
    );
    await writeText(
      "services/api/uv.lock",
      ["[[package]]", 'name = "fastapi"', 'version = "0.116.0"', ""].join("\n"),
    );
    execFileSync("git", ["add", "."], { cwd: tempRoot });
    execFileSync("git", ["commit", "-m", "base"], { cwd: tempRoot });

    await writeText(
      "services/api/pyproject.toml",
      [
        "[project]",
        'name = "api"',
        'version = "1.0.0"',
        "dependencies = [",
        '  "fastapi>=0.117",',
        '  "httpx==0.28.1",',
        '  "typing-extensions>=4.0; python_version < \\"3.11\\"",',
        "]",
        "",
      ].join("\n"),
    );
    await writeText(
      "services/api/uv.lock",
      [
        "[[package]]",
        'name = "fastapi"',
        'version = "0.117.1"',
        "",
        "[[package]]",
        'name = "httpx"',
        'version = "0.28.1"',
        "",
      ].join("\n"),
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      await reviewCommand("services/api/pyproject.toml", {
        base: "HEAD",
        ci: true,
        updateComment: false,
      });
      const output = logSpy.mock.calls.map((args) => args.map(String).join(" ")).join("\n");
      expect(output).toContain("### New Dependencies");
      expect(output).toContain("### Updated Dependencies");
      expect(output).toContain("| httpx |");
      expect(output).toContain("| fastapi |");
      expect(output).toContain("Best-effort");
      expect(output).toContain("Skipped marker-gated Python dependencies: typing-extensions.");
      expect(buildReportForPackageSpec).toHaveBeenCalledWith(
        "fastapi",
        "0.117.1",
        expect.objectContaining({ ecosystem: "pypi" }),
      );
      expect(buildReportForPackageSpec).toHaveBeenCalledWith(
        "httpx",
        "0.28.1",
        expect.objectContaining({ ecosystem: "pypi" }),
      );
    } finally {
      logSpy.mockRestore();
    }
  });

  it("keeps npm and Python lockfile discovery separated in a mixed repo", async () => {
    await writeText(
      "package.json",
      JSON.stringify({ name: "root-app", version: "1.0.0", dependencies: { react: "^18.3.0" } }),
    );
    await writeText(
      "pnpm-lock.yaml",
      [
        "lockfileVersion: '9.0'",
        "importers:",
        "  .:",
        "    dependencies:",
        "      react:",
        "        version: 18.3.1",
        "",
      ].join("\n"),
    );
    await writeText(
      "services/api/pyproject.toml",
      [
        "[project]",
        'name = "api"',
        'version = "1.0.0"',
        'dependencies = ["fastapi>=0.116"]',
        "",
      ].join("\n"),
    );
    await writeText(
      "services/api/uv.lock",
      ["[[package]]", 'name = "fastapi"', 'version = "0.116.1"', ""].join("\n"),
    );

    const npmLockfile = await loadAdjacentLockfile("package.json");
    const pythonLockfile = await loadAdjacentLockfile(
      "services/api/pyproject.toml",
      undefined,
      undefined,
      "pypi",
    );

    expect(npmLockfile?.format).toBe("pnpm-lock.yaml");
    expect(npmLockfile?.packages.get("react")).toBe("18.3.1");
    expect(pythonLockfile?.format).toBe("uv.lock");
    expect(pythonLockfile?.packages.get("fastapi")).toBe("0.116.1");
    expect(pythonLockfile?.packages.has("react")).toBe(false);
  });
});

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}
