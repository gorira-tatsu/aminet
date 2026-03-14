import { describe, expect, test } from "bun:test";
import { computeTrustScore } from "../../../src/core/trust/scorer.js";
import type { TrustInput } from "../../../src/core/trust/types.js";

function makeInput(overrides: Partial<TrustInput> = {}): TrustInput {
  return {
    name: "test-pkg",
    version: "1.0.0",
    weeklyDownloads: 100_000,
    maintainerCount: 3,
    hasGithubRepo: true,
    packageAgeMs: 3 * 365 * 24 * 60 * 60 * 1000, // 3 years
    daysSinceLastPublish: 30,
    versionCount: 20,
    hasProvenance: false,
    scorecardScore: null,
    knownVulnCount: 0,
    deprecatedVersionRatio: 0,
    ...overrides,
  };
}

describe("computeTrustScore", () => {
  test("gives high score to popular, maintained package", () => {
    const score = computeTrustScore(
      makeInput({
        weeklyDownloads: 10_000_000,
        scorecardScore: 8,
        hasProvenance: true,
      }),
    );

    expect(score.overall).toBeGreaterThanOrEqual(75);
    expect(score.breakdown.popularity).toBe(100);
    expect(score.hasProvenance).toBe(true);
  });

  test("gives low score to abandoned package", () => {
    const score = computeTrustScore(
      makeInput({
        weeklyDownloads: 10,
        daysSinceLastPublish: 1000, // ~3 years
        maintainerCount: 1,
        hasGithubRepo: false,
        versionCount: 1,
      }),
    );

    expect(score.overall).toBeLessThan(50);
  });

  test("penalizes known vulnerabilities", () => {
    const withVulns = computeTrustScore(makeInput({ knownVulnCount: 5 }));
    const withoutVulns = computeTrustScore(makeInput({ knownVulnCount: 0 }));

    expect(withVulns.breakdown.security).toBeLessThan(withoutVulns.breakdown.security);
  });

  test("rewards provenance attestation", () => {
    const withProv = computeTrustScore(makeInput({ hasProvenance: true }));
    const withoutProv = computeTrustScore(makeInput({ hasProvenance: false }));

    expect(withProv.breakdown.security).toBeGreaterThan(withoutProv.breakdown.security);
  });

  test("includes meaningful signals", () => {
    const score = computeTrustScore(
      makeInput({
        weeklyDownloads: 5,
        maintainerCount: 1,
        hasGithubRepo: false,
        daysSinceLastPublish: 800,
      }),
    );

    const signalMessages = score.signals.map((s) => s.message);
    expect(signalMessages.some((m) => m.includes("download"))).toBe(true);
    expect(signalMessages.some((m) => m.includes("maintainer") || m.includes("bus factor"))).toBe(
      true,
    );
  });

  test("score is bounded 0-100", () => {
    const lowScore = computeTrustScore(
      makeInput({
        weeklyDownloads: 0,
        maintainerCount: 0,
        hasGithubRepo: false,
        daysSinceLastPublish: 2000,
        versionCount: 1,
        knownVulnCount: 10,
      }),
    );

    const highScore = computeTrustScore(
      makeInput({
        weeklyDownloads: 100_000_000,
        maintainerCount: 10,
        hasGithubRepo: true,
        daysSinceLastPublish: 1,
        versionCount: 100,
        hasProvenance: true,
        scorecardScore: 10,
      }),
    );

    expect(lowScore.overall).toBeGreaterThanOrEqual(0);
    expect(lowScore.overall).toBeLessThanOrEqual(100);
    expect(highScore.overall).toBeGreaterThanOrEqual(0);
    expect(highScore.overall).toBeLessThanOrEqual(100);
  });

  test("handles null weekly downloads gracefully", () => {
    const score = computeTrustScore(makeInput({ weeklyDownloads: null }));
    expect(score.breakdown.popularity).toBe(50); // Default
  });

  test("detects very new packages", () => {
    const score = computeTrustScore(
      makeInput({
        packageAgeMs: 7 * 24 * 60 * 60 * 1000, // 1 week
      }),
    );

    expect(score.signals.some((s) => s.message.includes("new package"))).toBe(true);
  });

  test("rewards OpenSSF Scorecard", () => {
    const highScorecard = computeTrustScore(makeInput({ scorecardScore: 9 }));
    const lowScorecard = computeTrustScore(makeInput({ scorecardScore: 2 }));

    expect(highScorecard.breakdown.security).toBeGreaterThan(lowScorecard.breakdown.security);
    expect(highScorecard.scorecardScore).toBe(9);
  });
});
