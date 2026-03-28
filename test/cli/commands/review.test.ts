import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runCommand } = vi.hoisted(() => ({
  runCommand: vi.fn(),
}));

vi.mock("../../../src/utils/process.js", () => ({
  runCommand,
}));

const { loadConfig } = vi.hoisted(() => ({
  loadConfig: vi.fn(() => ({})),
}));

const { getDatabase } = vi.hoisted(() => ({
  getDatabase: vi.fn(),
}));

vi.mock("../../../src/core/config/loader.js", () => ({
  loadConfig,
}));

vi.mock("../../../src/core/store/database.js", () => ({
  getDatabase,
}));

import {
  buildPythonReviewNotes,
  computeWorkspacePath,
  loadAdjacentLockfile,
  parsePythonReviewManifest,
  reviewCommand,
} from "../../../src/cli/commands/review.js";

describe("review lockfile helpers", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "aminet-review-"));
    runCommand.mockReset();
    runCommand.mockResolvedValue({ exitCode: 0, stdout: `${tempRoot}\n`, stderr: "" });
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("returns forward-slash workspace paths", () => {
    expect(computeWorkspacePath("/repo", "/repo/packages/app")).toBe("packages/app");
  });

  it("finds a lockfile alongside package.json", async () => {
    const appDir = join(tempRoot, "app");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, "package.json"), "{}");
    await writeFile(
      join(appDir, "pnpm-lock.yaml"),
      "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      react:\n        version: 18.3.1\n",
    );

    const result = await loadAdjacentLockfile(join(appDir, "package.json"));

    expect(result?.packages.get("react")).toBe("18.3.1");
  });

  it("finds a lockfile in a parent directory and computes the workspace path", async () => {
    const appDir = join(tempRoot, "packages", "frontend");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, "package.json"), "{}");
    await writeFile(
      join(tempRoot, "pnpm-lock.yaml"),
      [
        "lockfileVersion: '9.0'",
        "importers:",
        "  .:",
        "    dependencies:",
        "      root-only:",
        "        version: 1.0.0",
        "  packages/frontend:",
        "    dependencies:",
        "      react:",
        "        version: 18.3.1",
      ].join("\n"),
    );

    const result = await loadAdjacentLockfile(join(appDir, "package.json"));

    expect(result?.packages.get("react")).toBe("18.3.1");
    expect(result?.packages.has("root-only")).toBe(false);
  });

  it("stops walking at the mocked git root", async () => {
    const repoDir = join(tempRoot, "repo");
    const appDir = join(repoDir, "packages", "frontend");
    const outsideDir = join(tempRoot, "outside");
    await mkdir(appDir, { recursive: true });
    await mkdir(outsideDir, { recursive: true });
    await writeFile(join(appDir, "package.json"), "{}");
    await writeFile(
      join(outsideDir, "pnpm-lock.yaml"),
      "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      leaked:\n        version: 1.0.0\n",
    );
    runCommand.mockResolvedValue({ exitCode: 0, stdout: `${repoDir}\n`, stderr: "" });

    const result = await loadAdjacentLockfile(join(appDir, "package.json"));

    expect(result).toBeNull();
  });

  it("uses an explicit lockfile path instead of walking", async () => {
    const appDir = join(tempRoot, "packages", "frontend");
    const lockfilePath = join(tempRoot, "pnpm-lock.yaml");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, "package.json"), "{}");
    await writeFile(
      lockfilePath,
      [
        "lockfileVersion: '9.0'",
        "importers:",
        "  packages/frontend:",
        "    dependencies:",
        "      vitest:",
        "        version: 3.2.4",
      ].join("\n"),
    );

    const result = await loadAdjacentLockfile(
      join(appDir, "package.json"),
      undefined,
      lockfilePath,
    );

    expect(result?.packages.get("vitest")).toBe("3.2.4");
  });

  it("finds adjacent Python lockfiles when reviewing pyproject.toml", async () => {
    const appDir = join(tempRoot, "python-app");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "pyproject.toml"),
      '[project]\nname = "python-app"\nversion = "1.0.0"\ndependencies = ["fastapi>=0.116"]\n',
    );
    await writeFile(
      join(appDir, "uv.lock"),
      '[[package]]\nname = "fastapi"\nversion = "0.116.1"\n',
    );

    const result = await loadAdjacentLockfile(
      join(appDir, "pyproject.toml"),
      undefined,
      undefined,
      "pypi",
    );

    expect(result?.format).toBe("uv.lock");
    expect(result?.packages.get("fastapi")).toBe("0.116.1");
  });
});

describe("python review manifest helpers", () => {
  it("builds review notes for requirements.txt manifests", () => {
    const parsed = parsePythonReviewManifest(
      "requirements.txt",
      'requests==2.31.0\nfastapi>=0.116 ; python_version >= "3.10"\nurllib3\n',
      false,
    );

    expect(parsed.dependencies.get("requests")).toBe("2.31.0");
    expect(parsed.dependencies.get("urllib3")).toBe("");
    expect(parsed.notes).toContain(
      "Best-effort resolution was used for: urllib3. Unpinned Python specs are reviewed against the latest compatible PyPI release and may not match the exact environment.",
    );
    expect(parsed.notes).toContain(
      "Skipped marker-gated Python dependencies: fastapi. Environment-specific requirements are not resolved in review mode.",
    );
  });

  it("includes optional/dev groups in pyproject review mode when requested", () => {
    const parsed = parsePythonReviewManifest(
      "pyproject.toml",
      `
[project]
name = "api"
version = "1.0.0"
dependencies = ["fastapi>=0.116"]

[project.optional-dependencies]
dev = ["pytest>=8.0"]
`,
      true,
    );

    expect(parsed.dependencies.get("fastapi")).toBe(">=0.116");
    expect(parsed.dependencies.get("pytest")).toBe(">=8.0");
    expect(parsed.notes).toContain("Included 1 Python optional/dev dependencies in review mode.");
  });

  it("formats review notes from parsed Python manifests", () => {
    const notes = buildPythonReviewNotes(
      {
        name: "api",
        version: "1.0.0",
        dependencies: new Map([["urllib3", ""]]),
        devDependencies: new Map([["pytest", ">=8.0"]]),
        skipped: [
          {
            name: "typing-extensions",
            spec: 'typing-extensions; python_version < "3.11"',
            reason: "marker",
          },
        ],
        bestEffortDependencies: ["urllib3"],
      },
      true,
    );

    expect(notes).toEqual([
      "Best-effort resolution was used for: urllib3. Unpinned Python specs are reviewed against the latest compatible PyPI release and may not match the exact environment.",
      "Skipped marker-gated Python dependencies: typing-extensions. Environment-specific requirements are not resolved in review mode.",
      "Included 1 Python optional/dev dependencies in review mode.",
    ]);
  });

  it("rejects standalone Python lockfiles in review mode", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "aminet-review-command-"));
    const lockfilePath = join(tempRoot, "uv.lock");
    await writeFile(lockfilePath, '[[package]]\nname = "fastapi"\nversion = "0.116.1"\n');
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code}`);
    }) as never);
    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(
        reviewCommand(lockfilePath, {
          base: lockfilePath,
          head: lockfilePath,
          ci: true,
        }),
      ).rejects.toThrow("process.exit:1");

      expect(stderrSpy.mock.calls.map(([value]) => String(value)).join("\n")).toContain(
        "Review mode expects a Python manifest",
      );
    } finally {
      exitSpy.mockRestore();
      stderrSpy.mockRestore();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
