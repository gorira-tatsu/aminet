import { describe, expect, test } from "bun:test";
import { analyzeFreshness } from "../../../src/core/freshness/analyzer.js";
import type { NpmPackument } from "../../../src/core/registry/types.js";

function makePackument(overrides: Partial<NpmPackument> = {}): NpmPackument {
  const now = new Date();
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const threeYearsAgo = new Date(now.getTime() - 3 * 365 * 24 * 60 * 60 * 1000);

  return {
    name: "test-pkg",
    "dist-tags": { latest: "3.0.0" },
    versions: {
      "1.0.0": { name: "test-pkg", version: "1.0.0" },
      "2.0.0": { name: "test-pkg", version: "2.0.0" },
      "3.0.0": { name: "test-pkg", version: "3.0.0" },
    },
    time: {
      created: threeYearsAgo.toISOString(),
      modified: oneMonthAgo.toISOString(),
      "1.0.0": threeYearsAgo.toISOString(),
      "2.0.0": new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString(),
      "3.0.0": oneMonthAgo.toISOString(),
    },
    ...overrides,
  };
}

describe("analyzeFreshness", () => {
  test("reports current when using latest version", () => {
    const packument = makePackument();
    const result = analyzeFreshness("test-pkg", "3.0.0", packument);

    expect(result.status).toBe("current");
    expect(result.versionsBehind).toBe(0);
    expect(result.latestVersion).toBe("3.0.0");
  });

  test("reports major-behind when behind one major", () => {
    const packument = makePackument();
    const result = analyzeFreshness("test-pkg", "2.0.0", packument);

    expect(result.status).toBe("major-behind");
    expect(result.versionsBehind).toBeGreaterThan(0);
  });

  test("reports outdated when behind 3+ majors", () => {
    const packument = makePackument({
      "dist-tags": { latest: "5.0.0" },
      versions: {
        "1.0.0": { name: "test-pkg", version: "1.0.0" },
        "2.0.0": { name: "test-pkg", version: "2.0.0" },
        "3.0.0": { name: "test-pkg", version: "3.0.0" },
        "4.0.0": { name: "test-pkg", version: "4.0.0" },
        "5.0.0": { name: "test-pkg", version: "5.0.0" },
      },
    });

    const result = analyzeFreshness("test-pkg", "1.0.0", packument);
    expect(result.status).toBe("outdated");
  });

  test("reports abandoned when no publish in 2+ years", () => {
    const threeYearsAgo = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000);
    const packument = makePackument({
      time: {
        created: threeYearsAgo.toISOString(),
        modified: threeYearsAgo.toISOString(),
        "1.0.0": threeYearsAgo.toISOString(),
        "2.0.0": threeYearsAgo.toISOString(),
        "3.0.0": threeYearsAgo.toISOString(),
      },
    });

    const result = analyzeFreshness("test-pkg", "3.0.0", packument);
    expect(result.status).toBe("abandoned");
  });

  test("calculates days since publish", () => {
    const packument = makePackument();
    const result = analyzeFreshness("test-pkg", "3.0.0", packument);

    expect(result.daysSinceCurrentPublish).not.toBeNull();
    expect(result.daysSinceCurrentPublish!).toBeGreaterThanOrEqual(25);
    expect(result.daysSinceCurrentPublish!).toBeLessThanOrEqual(35);
  });

  test("reports minor-behind for minor version differences", () => {
    const packument = makePackument({
      "dist-tags": { latest: "3.2.0" },
      versions: {
        "3.0.0": { name: "test-pkg", version: "3.0.0" },
        "3.1.0": { name: "test-pkg", version: "3.1.0" },
        "3.2.0": { name: "test-pkg", version: "3.2.0" },
      },
    });

    const result = analyzeFreshness("test-pkg", "3.0.0", packument);
    expect(result.status).toBe("minor-behind");
  });
});
