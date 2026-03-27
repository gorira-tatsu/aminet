import { describe, expect, it } from "vitest";
import { isExcludedPackage, parseExcludePackages } from "../../src/utils/exclude.js";

describe("exclude utilities", () => {
  it("trims, filters, and deduplicates CLI and config patterns", () => {
    const patterns = parseExcludePackages(" @scope/*,left-pad,,lodash ", [
      " lodash ",
      "",
      "internal-*",
    ]);

    expect(patterns).toEqual(["@scope/*", "left-pad", "lodash", "internal-*"]);
  });

  it("matches exact and wildcard patterns", () => {
    expect(isExcludedPackage("@scope/pkg", ["@scope/*"])).toBe(true);
    expect(isExcludedPackage("internal-lib", ["internal-*"])).toBe(true);
    expect(isExcludedPackage("lodash", ["lodash"])).toBe(true);
    expect(isExcludedPackage("express", ["@scope/*", "internal-*"])).toBe(false);
  });

  it("escapes regex metacharacters in patterns other than wildcard", () => {
    expect(isExcludedPackage("pkg.name", ["pkg.name"])).toBe(true);
    expect(isExcludedPackage("pkgxname", ["pkg.name"])).toBe(false);
  });
});
