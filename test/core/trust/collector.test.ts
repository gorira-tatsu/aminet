import { describe, expect, test } from "bun:test";
import type { NpmPackument } from "../../../src/core/registry/types.js";
import { buildTrustInput } from "../../../src/core/trust/collector.js";
import { computeTrustScore } from "../../../src/core/trust/scorer.js";

function makePackument(): NpmPackument {
  const created = new Date("2020-01-01T00:00:00.000Z").toISOString();
  const modified = new Date("2025-01-01T00:00:00.000Z").toISOString();

  return {
    name: "example",
    "dist-tags": { latest: "2.0.0" },
    maintainers: [{ name: "alice" }, { name: "bob" }],
    versions: {
      "1.0.0": { name: "example", version: "1.0.0" },
      "2.0.0": { name: "example", version: "2.0.0", deprecated: "legacy" },
    },
    time: {
      created,
      modified,
      "1.0.0": created,
      "2.0.0": modified,
    },
  };
}

describe("buildTrustInput", () => {
  test("builds a packument-only fallback input", () => {
    const input = buildTrustInput("example", "2.0.0", makePackument());

    expect(input.weeklyDownloads).toBeNull();
    expect(input.hasGithubRepo).toBe(false);
    expect(input.hasProvenance).toBe(false);
    expect(input.scorecardScore).toBeNull();
    expect(input.knownVulnCount).toBe(0);
    expect(input.maintainerCount).toBe(2);
    expect(input.versionCount).toBe(2);
    expect(input.deprecatedVersionRatio).toBe(0.5);
    expect(input.packageAgeMs).not.toBeNull();
    expect(input.daysSinceLastPublish).not.toBeNull();
  });

  test("produces a numeric trust score without external API data", () => {
    const score = computeTrustScore(buildTrustInput("example", "2.0.0", makePackument()));

    expect(Number.isNaN(score.overall)).toBe(false);
    expect(score.overall).toBeGreaterThanOrEqual(0);
    expect(score.overall).toBeLessThanOrEqual(100);
    expect(score.breakdown.popularity).toBe(50);
    expect(score.breakdown.security).toBe(70);
  });
});
