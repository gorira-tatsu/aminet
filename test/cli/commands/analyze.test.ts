import { describe, expect, it } from "vitest";
import { inferAnalyzeTarget } from "../../../src/cli/commands/analyze.js";

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
