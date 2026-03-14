import { describe, expect, test } from "bun:test";
import { analyzeVersionPinning } from "../../../src/core/pinning/analyzer.js";

describe("analyzeVersionPinning", () => {
  test("categorizes exact pinned versions", () => {
    const deps = {
      express: "4.21.2",
      lodash: "4.17.21",
    };

    const report = analyzeVersionPinning(deps, null);
    expect(report.exactPinned).toBe(2);
    expect(report.caretRange).toBe(0);
    expect(report.tildeRange).toBe(0);
    expect(report.totalDependencies).toBe(2);
  });

  test("categorizes caret and tilde ranges", () => {
    const deps = {
      express: "^4.21.2",
      lodash: "~4.17.21",
      chalk: "^5.0.0",
    };

    const report = analyzeVersionPinning(deps, null);
    expect(report.caretRange).toBe(2);
    expect(report.tildeRange).toBe(1);
  });

  test("detects wildcard dependencies", () => {
    const deps = {
      risky: "*",
      latest: "latest",
    };

    const report = analyzeVersionPinning(deps, null);
    expect(report.wildcardOrStar).toBe(2);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  test("recommends lockfile when missing", () => {
    const deps = { express: "^4.21.2" };
    const report = analyzeVersionPinning(deps, null);

    expect(
      report.recommendations.some(
        (r) => r.name === "(project)" && r.suggestion.includes("lockfile"),
      ),
    ).toBe(true);
  });

  test("lockfile reduces drift risk", () => {
    const deps = { express: "^4.21.2", lodash: "^4.17.21" };
    const withoutLock = analyzeVersionPinning(deps, null);
    const withLock = analyzeVersionPinning(deps, { format: "bun.lock", packages: new Map() });

    expect(withLock.driftRiskScore).toBeLessThan(withoutLock.driftRiskScore);
  });

  test("handles git/URL dependencies", () => {
    const deps = {
      "my-lib": "github:user/repo",
      "other-lib": "https://github.com/user/repo.git",
    };

    const report = analyzeVersionPinning(deps, null);
    expect(report.gitOrUrl).toBe(2);
  });

  test("handles empty dependencies", () => {
    const report = analyzeVersionPinning({}, null);
    expect(report.totalDependencies).toBe(0);
    expect(report.driftRiskScore).toBe(0);
  });

  test("drift risk score is bounded 0-100", () => {
    const allWildcard = {
      a: "*",
      b: "*",
      c: "*",
      d: "*",
      e: "*",
    };
    const report = analyzeVersionPinning(allWildcard, null);
    expect(report.driftRiskScore).toBeLessThanOrEqual(100);
    expect(report.driftRiskScore).toBeGreaterThanOrEqual(0);
  });
});
