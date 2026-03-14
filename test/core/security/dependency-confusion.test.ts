import { describe, expect, test } from "bun:test";
import type { NpmPackument } from "../../../src/core/registry/types.js";
import { detectDependencyConfusion } from "../../../src/core/security/dependency-confusion.js";

function makePackument(name: string, createdDaysAgo: number, versionCount: number): NpmPackument {
  const created = new Date(Date.now() - createdDaysAgo * 24 * 60 * 60 * 1000);
  const versions: Record<string, { name: string; version: string }> = {};
  for (let i = 1; i <= versionCount; i++) {
    versions[`${i}.0.0`] = { name, version: `${i}.0.0` };
  }

  return {
    name,
    "dist-tags": { latest: `${versionCount}.0.0` },
    versions,
    time: {
      created: created.toISOString(),
      modified: created.toISOString(),
    },
  };
}

describe("detectDependencyConfusion", () => {
  test("flags unscoped package with internal naming pattern", () => {
    const packument = makePackument("internal-utils", 10, 1);
    const signals = detectDependencyConfusion("internal-utils", "1.0.0", packument, 5);

    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].category).toBe("dependency-confusion");
  });

  test("flags private-prefixed package", () => {
    const packument = makePackument("private-config", 5, 1);
    const signals = detectDependencyConfusion("private-config", "1.0.0", packument, 0);

    expect(signals.length).toBeGreaterThan(0);
  });

  test("ignores scoped packages", () => {
    const packument = makePackument("@company/internal-utils", 10, 1);
    const signals = detectDependencyConfusion("@company/internal-utils", "1.0.0", packument, 5);

    expect(signals).toHaveLength(0);
  });

  test("ignores packages without internal naming", () => {
    const packument = makePackument("express", 3650, 100);
    const signals = detectDependencyConfusion("express", "4.21.2", packument, 50_000_000);

    expect(signals).toHaveLength(0);
  });

  test("requires multiple risk factors", () => {
    // Only has internal name but is well-established
    const packument = makePackument("internal-logger", 365, 20);
    const signals = detectDependencyConfusion("internal-logger", "20.0.0", packument, 100_000);

    // Should not flag because not enough risk factors
    expect(signals).toHaveLength(0);
  });

  test("assigns higher severity with more risk factors", () => {
    const packument = makePackument("corp-utils", 3, 1);
    const signals = detectDependencyConfusion("corp-utils", "1.0.0", packument, 2);

    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].severity).toBe("high");
  });
});
