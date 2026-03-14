import { describe, expect, test } from "bun:test";
import { checkDenyList } from "../../../src/core/license/deny-list.js";
import type { ReportEntry } from "../../../src/core/report/types.js";

function makeEntry(id: string, license: string | null): ReportEntry {
  return {
    name: id.split("@")[0],
    version: id.split("@")[1] ?? "1.0.0",
    id,
    depth: 1,
    license,
    licenseCategory: "permissive",
    vulnerabilities: [],
  };
}

describe("checkDenyList", () => {
  test("returns empty for no denied licenses", () => {
    const entries = [makeEntry("pkg@1.0.0", "MIT")];
    expect(checkDenyList(entries, [])).toEqual([]);
  });

  test("detects simple denied license", () => {
    const entries = [makeEntry("pkg-a@1.0.0", "MIT"), makeEntry("pkg-b@1.0.0", "GPL-3.0")];
    const violations = checkDenyList(entries, ["GPL-3.0"]);
    expect(violations).toHaveLength(1);
    expect(violations[0].packageId).toBe("pkg-b@1.0.0");
    expect(violations[0].isOrExpression).toBe(false);
  });

  test("handles OR expression - partial match is warning", () => {
    const entries = [makeEntry("pkg@1.0.0", "MIT OR GPL-3.0")];
    const violations = checkDenyList(entries, ["GPL-3.0"]);
    expect(violations).toHaveLength(1);
    expect(violations[0].isOrExpression).toBe(true);
    expect(violations[0].deniedIds).toEqual(["GPL-3.0"]);
  });

  test("handles AND expression", () => {
    const entries = [makeEntry("pkg@1.0.0", "MIT AND GPL-3.0")];
    const violations = checkDenyList(entries, ["GPL-3.0"]);
    expect(violations).toHaveLength(1);
    expect(violations[0].isOrExpression).toBe(false);
  });

  test("handles nested OR alternatives", () => {
    const entries = [makeEntry("pkg@1.0.0", "MIT OR (GPL-3.0 AND LGPL-2.1)")];
    const violations = checkDenyList(entries, ["GPL-3.0"]);
    expect(violations).toHaveLength(1);
    expect(violations[0].isOrExpression).toBe(true);
  });

  test("no match returns empty", () => {
    const entries = [makeEntry("pkg@1.0.0", "MIT")];
    expect(checkDenyList(entries, ["GPL-3.0"])).toEqual([]);
  });

  test("skips entries with null license", () => {
    const entries = [makeEntry("pkg@1.0.0", null)];
    expect(checkDenyList(entries, ["GPL-3.0"])).toEqual([]);
  });

  test("handles multiple denied licenses", () => {
    const entries = [
      makeEntry("a@1.0.0", "GPL-3.0"),
      makeEntry("b@1.0.0", "AGPL-3.0"),
      makeEntry("c@1.0.0", "MIT"),
    ];
    const violations = checkDenyList(entries, ["GPL-3.0", "AGPL-3.0"]);
    expect(violations).toHaveLength(2);
  });
});
