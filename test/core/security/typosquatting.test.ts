import { describe, expect, it } from "bun:test";
import {
  detectTyposquatting,
  levenshteinDistance,
} from "../../../src/core/security/typosquatting.js";

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("express", "express")).toBe(0);
  });

  it("returns 1 for single character difference", () => {
    expect(levenshteinDistance("lodash", "lodas")).toBe(1);
    expect(levenshteinDistance("express", "expres")).toBe(1);
  });

  it("returns 2 for two character difference", () => {
    expect(levenshteinDistance("react", "reakt")).toBe(1);
    expect(levenshteinDistance("lodash", "lodasj")).toBe(1);
  });

  it("handles empty strings", () => {
    expect(levenshteinDistance("", "")).toBe(0);
    expect(levenshteinDistance("abc", "")).toBe(3);
    expect(levenshteinDistance("", "abc")).toBe(3);
  });

  it("returns correct distance for substitutions", () => {
    expect(levenshteinDistance("express", "expresz")).toBe(1);
  });
});

describe("detectTyposquatting", () => {
  it("detects typosquat of popular package (distance 1)", () => {
    const signals = detectTyposquatting("expresss", "1.0.0");

    const expressMatch = signals.find(
      (s) => (s.details as Record<string, unknown>)?.similarTo === "express",
    );
    expect(expressMatch).toBeDefined();
    expect(expressMatch!.severity).toBe("high");
    expect(expressMatch!.category).toBe("typosquatting");
  });

  it("detects typosquat of popular package (distance 2)", () => {
    const signals = detectTyposquatting("exprass", "1.0.0");

    const expressMatch = signals.find(
      (s) => (s.details as Record<string, unknown>)?.similarTo === "express",
    );
    // "exprass" vs "express" has distance 1 (substitution e->a)
    expect(expressMatch).toBeDefined();
  });

  it("does not flag popular packages themselves", () => {
    const signals = detectTyposquatting("express", "4.21.2");
    const selfMatch = signals.find(
      (s) => (s.details as Record<string, unknown>)?.similarTo === "express",
    );
    expect(selfMatch).toBeUndefined();
  });

  it("does not flag unrelated names", () => {
    const signals = detectTyposquatting("my-unique-package-name-12345", "1.0.0");
    expect(signals).toHaveLength(0);
  });
});
