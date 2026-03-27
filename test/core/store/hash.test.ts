import { describe, expect, test } from "vitest";
import { packageHash, packumentHash } from "../../../src/core/store/hash.js";

describe("packageHash", () => {
  test("produces expected hash for known input", () => {
    expect(packageHash("npm", "express", "4.21.2")).toBe("705b7eb68a46ed181bba302c3ba5f348");
  });

  test("produces 32-character hex string", () => {
    const h = packageHash("npm", "lodash", "4.17.21");
    expect(h).toHaveLength(32);
    expect(h).toMatch(/^[0-9a-f]{32}$/);
  });

  test("different versions produce different hashes", () => {
    const h1 = packageHash("npm", "express", "4.21.2");
    const h2 = packageHash("npm", "express", "4.21.1");
    expect(h1).not.toBe(h2);
  });

  test("different ecosystems produce different hashes", () => {
    const h1 = packageHash("npm", "express", "4.21.2");
    const h2 = packageHash("pypi", "express", "4.21.2");
    expect(h1).not.toBe(h2);
  });

  test("handles scoped packages", () => {
    const h = packageHash("npm", "@types/node", "20.0.0");
    expect(h).toHaveLength(32);
    expect(h).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("packumentHash", () => {
  test("produces expected hash for known input", () => {
    expect(packumentHash("npm", "express")).toBe("1db97c492987c147581a662585d04220");
  });

  test("differs from packageHash", () => {
    const ph = packumentHash("npm", "express");
    const pkgH = packageHash("npm", "express", "4.21.2");
    expect(ph).not.toBe(pkgH);
  });
});
