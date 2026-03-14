import { describe, expect, it } from "bun:test";
import type { NpmVersionInfo } from "../../../src/core/registry/types.js";
import { detectDeprecated } from "../../../src/core/security/deprecated.js";

describe("detectDeprecated", () => {
  it("detects deprecated package", () => {
    const vInfo: NpmVersionInfo = {
      name: "request",
      version: "2.88.2",
      deprecated: "request has been deprecated, see https://github.com/request/request/issues/3142",
    };

    const signals = detectDeprecated("request", "2.88.2", vInfo);
    expect(signals).toHaveLength(1);
    expect(signals[0].category).toBe("deprecated");
    expect(signals[0].severity).toBe("low");
    expect(signals[0].description).toContain("deprecated");
  });

  it("returns empty for non-deprecated package", () => {
    const vInfo: NpmVersionInfo = {
      name: "express",
      version: "4.21.2",
    };

    const signals = detectDeprecated("express", "4.21.2", vInfo);
    expect(signals).toHaveLength(0);
  });
});
