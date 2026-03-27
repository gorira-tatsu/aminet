/**
 * Integration tests for the Python analysis pipeline.
 *
 * Uses real dependency files from popular OSS projects (Flask, FastAPI, requests,
 * Black, httpx) as fixtures. Tests the full parsing → resolution → report pipeline
 * with mocked PyPI network calls.
 *
 * Fixture sources:
 * - flask-pyproject.toml: pallets/flask
 * - fastapi-pyproject.toml: tiangolo/fastapi
 * - requests-pyproject.toml: psf/requests
 * - black-pyproject.toml: psf/black (has extras syntax like [jupyter])
 * - httpx-requirements.txt: encode/httpx (has -e, [extras], pinned versions)
 * - simple-requirements.txt: synthetic, combines common patterns
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  parsePyprojectDependencies,
  parseRequirementsTxt,
} from "../../src/core/lockfile/python-parser.js";

// Mock network calls for pipeline tests
vi.mock("../../src/core/graph/py-resolver.js", () => ({
  resolvePythonDependencyGraph: vi
    .fn()
    .mockImplementation(async (name: string, _version: string) => ({
      root: `${name}@1.0.0`,
      nodes: new Map([
        [
          `${name}@1.0.0`,
          {
            id: `${name}@1.0.0`,
            name,
            version: "1.0.0",
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

vi.mock("../../src/core/graph/resolver.js", () => ({
  resolveDependencyGraph: vi.fn().mockRejectedValue(new Error("should not call npm resolver")),
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
import { resolvePythonDependencyGraph } from "../../src/core/graph/py-resolver.js";

const FIXTURES = join(import.meta.dirname, "../fixtures/python");

function loadText(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf-8");
}

// ─── pyproject.toml parsing tests against real OSS files ─────────────

describe("Python parsing: Flask pyproject.toml", () => {
  const content = loadText("flask-pyproject.toml");
  const parsed = parsePyprojectDependencies(content);

  it("extracts project name", () => {
    expect(parsed.name).toBe("Flask");
  });

  it("extracts all production dependencies", () => {
    expect(parsed.dependencies.size).toBeGreaterThanOrEqual(5);
    expect(parsed.dependencies.has("werkzeug")).toBe(true);
    expect(parsed.dependencies.has("jinja2")).toBe(true);
    expect(parsed.dependencies.has("click")).toBe(true);
    expect(parsed.dependencies.has("blinker")).toBe(true);
    expect(parsed.dependencies.has("markupsafe")).toBe(true);
  });

  it("preserves version specifiers", () => {
    const werkzeug = parsed.dependencies.get("werkzeug") ?? "";
    expect(werkzeug).toMatch(/>=\d/);
  });
});

describe("Python parsing: FastAPI pyproject.toml", () => {
  const content = loadText("fastapi-pyproject.toml");
  const parsed = parsePyprojectDependencies(content);

  it("extracts project name", () => {
    expect(parsed.name).toBe("fastapi");
  });

  it("extracts dependencies including starlette and pydantic", () => {
    expect(parsed.dependencies.size).toBeGreaterThanOrEqual(2);
    expect(parsed.dependencies.has("starlette")).toBe(true);
    expect(parsed.dependencies.has("pydantic")).toBe(true);
  });
});

describe("Python parsing: requests pyproject.toml", () => {
  const content = loadText("requests-pyproject.toml");
  const parsed = parsePyprojectDependencies(content);

  it("extracts project name", () => {
    expect(parsed.name).toBe("requests");
  });

  it("extracts core dependencies", () => {
    expect(parsed.dependencies.has("urllib3")).toBe(true);
    expect(parsed.dependencies.has("certifi")).toBe(true);
    expect(parsed.dependencies.has("idna")).toBe(true);
    expect(
      parsed.dependencies.has("charset_normalizer") ||
        parsed.dependencies.has("charset-normalizer"),
    ).toBe(true);
  });

  it("preserves range specifiers with upper bounds", () => {
    const urllib3 = parsed.dependencies.get("urllib3") ?? "";
    expect(urllib3).toMatch(/<\d/);
  });
});

describe("Python parsing: Black pyproject.toml (extras syntax)", () => {
  const content = loadText("black-pyproject.toml");
  const parsed = parsePyprojectDependencies(content);

  it("extracts project name", () => {
    expect(parsed.name).toBe("black");
  });

  it("extracts dependencies including all core deps", () => {
    expect(parsed.dependencies.has("click")).toBe(true);
    expect(parsed.dependencies.has("pathspec")).toBe(true);
    expect(parsed.dependencies.has("platformdirs")).toBe(true);
  });

  it("handles environment markers without crashing", () => {
    // Black has deps like: "tomli>=1.1.0; python_version<'3.11'"
    // These should be parsed (possibly with marker) but not crash
    expect(parsed.dependencies.size).toBeGreaterThanOrEqual(4);
  });
});

// ─── requirements.txt parsing tests against real OSS files ───────────

describe("Python parsing: httpx requirements.txt", () => {
  const content = loadText("httpx-requirements.txt");
  const deps = parseRequirementsTxt(content);

  it("skips -e editable installs", () => {
    for (const name of deps.keys()) {
      expect(name).not.toContain("-e");
      expect(name).not.toBe(".");
    }
  });

  it("parses pinned dependencies", () => {
    expect(deps.get("chardet")).toBe("5.2.0");
  });

  it("parses dependencies with version constraints", () => {
    const count = deps.size;
    expect(count).toBeGreaterThanOrEqual(5);
  });
});

describe("Python parsing: simple-requirements.txt (mixed patterns)", () => {
  const content = loadText("simple-requirements.txt");
  const deps = parseRequirementsTxt(content);

  it("parses pinned versions", () => {
    expect(deps.get("flask")).toBe("3.0.0");
    expect(deps.get("numpy")).toBe("1.26.4");
  });

  it("parses range specifiers", () => {
    const django = deps.get("django") ?? "";
    expect(django).toMatch(/>=4\.2/);
  });

  it("parses packages with extras (strips extras from name)", () => {
    expect(deps.has("celery")).toBe(true);
    expect(deps.has("httpx")).toBe(true);
  });

  it("parses tilde constraints", () => {
    const boto3 = deps.get("boto3") ?? "";
    expect(boto3).toMatch(/~=1\.28/);
  });

  it("skips environment markers", () => {
    // "pytest>=7.0 ; python_version >= "3.8"" should still parse the package
    expect(deps.has("pytest")).toBe(true);
  });

  it("parses all expected dependencies", () => {
    expect(deps.size).toBeGreaterThanOrEqual(10);
  });
});

// ─── Full pipeline tests with mocked resolution ─────────────────────

describe("Python pipeline: Flask end-to-end", () => {
  const content = loadText("flask-pyproject.toml");
  const parsed = parsePyprojectDependencies(content);

  it("runs full pipeline from parsed pyproject.toml", async () => {
    const depObj: Record<string, string> = {};
    for (const [name, ver] of parsed.dependencies) {
      depObj[name] = ver;
    }

    (resolvePythonDependencyGraph as any).mockClear();

    const result = await buildReportFromPackageJson(
      { name: parsed.name, version: parsed.version ?? "0.0.0", dependencies: depObj },
      { depth: 1, noCache: true, ecosystem: "pypi" },
    );

    expect(result.report).toBeDefined();
    expect(result.report.root).toContain("Flask");
    expect(result.graph.nodes.size).toBeGreaterThan(0);
    expect(result.report.entries.length).toBeGreaterThan(0);

    // Verify Python resolver was used, not npm
    expect(resolvePythonDependencyGraph).toHaveBeenCalled();
    const resolvedNames = (resolvePythonDependencyGraph as any).mock.calls.map(
      (c: unknown[]) => c[0],
    );
    expect(resolvedNames).toContain("werkzeug");
    expect(resolvedNames).toContain("jinja2");
  });
});

describe("Python pipeline: requests end-to-end", () => {
  const content = loadText("requests-pyproject.toml");
  const parsed = parsePyprojectDependencies(content);

  it("produces a valid report for requests", async () => {
    const depObj: Record<string, string> = {};
    for (const [name, ver] of parsed.dependencies) {
      depObj[name] = ver;
    }

    const result = await buildReportFromPackageJson(
      { name: "requests", version: "2.32.0", dependencies: depObj },
      { depth: 1, noCache: true, ecosystem: "pypi" },
    );

    expect(result.report.totalPackages).toBeGreaterThan(0);
    expect(result.report.summary.licenseCounts).toBeDefined();
  });
});

describe("Python pipeline: simple-requirements.txt end-to-end", () => {
  const content = loadText("simple-requirements.txt");
  const deps = parseRequirementsTxt(content);

  it("runs full pipeline from requirements.txt", async () => {
    const depObj: Record<string, string> = {};
    for (const [name, ver] of deps) {
      depObj[name] = ver;
    }

    (resolvePythonDependencyGraph as any).mockClear();

    const result = await buildReportFromPackageJson(
      { name: "test-project", version: "0.0.0", dependencies: depObj },
      { depth: 1, noCache: true, ecosystem: "pypi" },
    );

    expect(result.report.totalPackages).toBeGreaterThan(0);
    expect(resolvePythonDependencyGraph).toHaveBeenCalledTimes(deps.size);
  });
});
