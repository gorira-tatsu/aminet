import { describe, expect, test } from "bun:test";
import { resolveVersion } from "../../../src/core/graph/semver-resolver.js";
import type { NpmPackument } from "../../../src/core/registry/types.js";

describe("resolveVersion", () => {
  const mockPackument: NpmPackument = {
    name: "test-pkg",
    "dist-tags": { latest: "2.0.0", next: "3.0.0-beta.1" },
    versions: {
      "1.0.0": { name: "test-pkg", version: "1.0.0", license: "MIT" },
      "1.1.0": { name: "test-pkg", version: "1.1.0", license: "MIT" },
      "1.2.0": { name: "test-pkg", version: "1.2.0", license: "MIT" },
      "2.0.0": { name: "test-pkg", version: "2.0.0", license: "MIT" },
      "3.0.0-beta.1": { name: "test-pkg", version: "3.0.0-beta.1", license: "MIT" },
    },
  };

  test("resolves exact version", () => {
    expect(resolveVersion(mockPackument, "1.0.0")).toBe("1.0.0");
  });

  test("resolves dist-tag", () => {
    expect(resolveVersion(mockPackument, "latest")).toBe("2.0.0");
    expect(resolveVersion(mockPackument, "next")).toBe("3.0.0-beta.1");
  });

  test("resolves caret range", () => {
    expect(resolveVersion(mockPackument, "^1.0.0")).toBe("1.2.0");
  });

  test("resolves tilde range", () => {
    expect(resolveVersion(mockPackument, "~1.0.0")).toBe("1.0.0");
    expect(resolveVersion(mockPackument, "~1.1.0")).toBe("1.1.0");
  });

  test("resolves >=range", () => {
    expect(resolveVersion(mockPackument, ">=1.1.0")).toBe("2.0.0");
  });

  test("returns null for URL dependencies", () => {
    expect(resolveVersion(mockPackument, "https://example.com/pkg.tgz")).toBeNull();
    expect(resolveVersion(mockPackument, "git+ssh://git@github.com/user/repo")).toBeNull();
  });

  test("returns null for unresolvable range", () => {
    expect(resolveVersion(mockPackument, "^5.0.0")).toBeNull();
  });
});
