import { describe, expect, test } from "bun:test";
import { extractLicense } from "../../../src/core/license/checker.js";
import { classifyLicense } from "../../../src/core/license/spdx.js";
import type { NpmVersionInfo } from "../../../src/core/registry/types.js";

describe("classifyLicense", () => {
  test("classifies permissive licenses", () => {
    expect(classifyLicense("MIT")).toBe("permissive");
    expect(classifyLicense("ISC")).toBe("permissive");
    expect(classifyLicense("Apache-2.0")).toBe("permissive");
    expect(classifyLicense("BSD-2-Clause")).toBe("permissive");
    expect(classifyLicense("BSD-3-Clause")).toBe("permissive");
  });

  test("classifies copyleft licenses", () => {
    expect(classifyLicense("GPL-2.0")).toBe("copyleft");
    expect(classifyLicense("GPL-3.0")).toBe("copyleft");
    expect(classifyLicense("AGPL-3.0")).toBe("copyleft");
    expect(classifyLicense("GPL-3.0-only")).toBe("copyleft");
  });

  test("classifies weak-copyleft licenses", () => {
    expect(classifyLicense("LGPL-2.1")).toBe("weak-copyleft");
    expect(classifyLicense("MPL-2.0")).toBe("weak-copyleft");
    expect(classifyLicense("EPL-2.0")).toBe("weak-copyleft");
  });

  test("returns unknown for unrecognized licenses", () => {
    expect(classifyLicense("WTFPL")).toBe("unknown");
    expect(classifyLicense("Custom")).toBe("unknown");
  });

  test("handles SPDX OR expressions (most permissive wins)", () => {
    expect(classifyLicense("MIT OR GPL-3.0")).toBe("permissive");
    expect(classifyLicense("GPL-3.0 OR LGPL-2.1")).toBe("weak-copyleft");
  });

  test("handles SPDX AND expressions (most restrictive wins)", () => {
    expect(classifyLicense("MIT AND GPL-3.0")).toBe("copyleft");
    expect(classifyLicense("MIT AND MPL-2.0")).toBe("weak-copyleft");
  });
});

describe("extractLicense", () => {
  test("extracts string license", () => {
    const info: NpmVersionInfo = { name: "test", version: "1.0.0", license: "MIT" };
    const result = extractLicense(info);
    expect(result.spdxId).toBe("MIT");
    expect(result.category).toBe("permissive");
  });

  test("extracts legacy object license", () => {
    const info: NpmVersionInfo = {
      name: "test",
      version: "1.0.0",
      license: { type: "MIT", url: "https://example.com" },
    };
    const result = extractLicense(info);
    expect(result.spdxId).toBe("MIT");
    expect(result.category).toBe("permissive");
  });

  test("extracts legacy array license", () => {
    const info: NpmVersionInfo = {
      name: "test",
      version: "1.0.0",
      license: [{ type: "MIT" }, { type: "Apache-2.0" }] as any,
    };
    const result = extractLicense(info);
    expect(result.spdxId).toBe("MIT OR Apache-2.0");
    expect(result.category).toBe("permissive");
  });

  test("returns unknown for missing license", () => {
    const info: NpmVersionInfo = { name: "test", version: "1.0.0" };
    const result = extractLicense(info);
    expect(result.spdxId).toBeNull();
    expect(result.category).toBe("unknown");
  });

  test("handles parenthesized license", () => {
    const info: NpmVersionInfo = { name: "test", version: "1.0.0", license: "(MIT)" };
    const result = extractLicense(info);
    expect(result.spdxId).toBe("MIT");
    expect(result.category).toBe("permissive");
  });
});
