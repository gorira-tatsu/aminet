import { describe, expect, test } from "vitest";
import { extractLicense } from "../../../src/core/license/checker.js";
import type { NpmVersionInfo } from "../../../src/core/registry/types.js";

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
