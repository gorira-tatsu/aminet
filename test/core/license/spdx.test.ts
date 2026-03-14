import { describe, expect, test } from "bun:test";
import { parseLicenseComponents } from "../../../src/core/license/spdx.js";

describe("parseLicenseComponents", () => {
  test("parses single license", () => {
    const result = parseLicenseComponents("MIT");
    expect(result).toEqual([{ spdxId: "MIT", category: "permissive" }]);
  });

  test("parses OR expression", () => {
    const result = parseLicenseComponents("MIT OR GPL-3.0");
    expect(result).toEqual([
      { spdxId: "MIT", category: "permissive" },
      { spdxId: "GPL-3.0", category: "copyleft" },
    ]);
  });

  test("parses AND expression", () => {
    const result = parseLicenseComponents("MIT AND Apache-2.0");
    expect(result).toEqual([
      { spdxId: "MIT", category: "permissive" },
      { spdxId: "Apache-2.0", category: "permissive" },
    ]);
  });

  test("returns empty for empty string", () => {
    expect(parseLicenseComponents("")).toEqual([]);
    expect(parseLicenseComponents("  ")).toEqual([]);
  });

  test("handles triple OR expression", () => {
    const result = parseLicenseComponents("MIT OR Apache-2.0 OR GPL-3.0");
    expect(result).toHaveLength(3);
    expect(result[0].spdxId).toBe("MIT");
    expect(result[1].spdxId).toBe("Apache-2.0");
    expect(result[2].spdxId).toBe("GPL-3.0");
  });

  test("classifies each component independently", () => {
    const result = parseLicenseComponents("MIT OR LGPL-2.1");
    expect(result[0].category).toBe("permissive");
    expect(result[1].category).toBe("weak-copyleft");
  });
});
