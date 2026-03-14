import { describe, expect, it } from "bun:test";
import type { NpmPackument } from "../../../src/core/registry/types.js";
import { detectPublishAnomalies } from "../../../src/core/security/publish-anomaly.js";

function makePackument(
  time: Record<string, string>,
  overrides: Partial<NpmPackument> = {},
): NpmPackument {
  return {
    name: "test-pkg",
    "dist-tags": { latest: "1.0.0" },
    versions: {},
    time,
    ...overrides,
  };
}

describe("detectPublishAnomalies", () => {
  it("detects version burst (3+ within 1 hour)", () => {
    const now = Date.now();
    const packument = makePackument({
      created: new Date(now - 3600_000 * 24).toISOString(),
      modified: new Date(now).toISOString(),
      "1.0.0": new Date(now - 3600_000 * 24).toISOString(),
      "1.0.1": new Date(now - 1800_000).toISOString(), // 30 min ago
      "1.0.2": new Date(now - 1200_000).toISOString(), // 20 min ago
      "1.0.3": new Date(now - 600_000).toISOString(), // 10 min ago
    });

    const signals = detectPublishAnomalies("test-pkg", "1.0.2", packument);
    const burst = signals.find((s) => s.title.includes("burst"));
    expect(burst).toBeDefined();
    expect(burst!.severity).toBe("medium");
  });

  it("detects dormancy (365+ days gap)", () => {
    const now = Date.now();
    const packument = makePackument({
      created: new Date(now - 400 * 86400_000).toISOString(),
      modified: new Date(now).toISOString(),
      "1.0.0": new Date(now - 400 * 86400_000).toISOString(),
      "2.0.0": new Date(now - 1000).toISOString(), // just now
    });

    const signals = detectPublishAnomalies("test-pkg", "2.0.0", packument);
    const dormancy = signals.find((s) => s.title.includes("dormancy"));
    expect(dormancy).toBeDefined();
    expect(dormancy!.severity).toBe("medium");
  });

  it("detects recently created package", () => {
    const now = Date.now();
    const packument = makePackument({
      created: new Date(now - 86400_000 * 2).toISOString(), // 2 days ago
      modified: new Date(now).toISOString(),
      "1.0.0": new Date(now - 86400_000 * 2).toISOString(),
    });

    const signals = detectPublishAnomalies("test-pkg", "1.0.0", packument);
    const newPkg = signals.find((s) => s.title.includes("Recently created"));
    expect(newPkg).toBeDefined();
    expect(newPkg!.severity).toBe("low");
  });

  it("returns empty for normal package", () => {
    const now = Date.now();
    const packument = makePackument({
      created: new Date(now - 365 * 86400_000).toISOString(),
      modified: new Date(now - 30 * 86400_000).toISOString(),
      "1.0.0": new Date(now - 365 * 86400_000).toISOString(),
      "1.1.0": new Date(now - 180 * 86400_000).toISOString(),
      "1.2.0": new Date(now - 30 * 86400_000).toISOString(),
    });

    const signals = detectPublishAnomalies("test-pkg", "1.2.0", packument);
    // Should have no burst or dormancy
    const burst = signals.find((s) => s.title.includes("burst"));
    const dormancy = signals.find((s) => s.title.includes("dormancy"));
    expect(burst).toBeUndefined();
    expect(dormancy).toBeUndefined();
  });

  it("handles missing time field", () => {
    const packument = makePackument({});
    delete (packument as Record<string, unknown>).time;
    const signals = detectPublishAnomalies("test-pkg", "1.0.0", packument as NpmPackument);
    expect(signals).toHaveLength(0);
  });
});
