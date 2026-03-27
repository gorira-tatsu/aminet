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

import { computeWorkspacePath, loadAdjacentLockfile } from "../../../src/cli/commands/review.js";

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
});
