import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { closeDatabase, setDatabase } from "../../../src/core/store/database.js";
import { clearAllStores, getStoreStats } from "../../../src/core/store/index.js";
import { runMigrations } from "../../../src/core/store/migrations.js";
import {
  cachePackage,
  cachePackageBatch,
  getCachedPackage,
} from "../../../src/core/store/package-store.js";
import { cachePackument, getCachedPackument } from "../../../src/core/store/packument-store.js";
import {
  cacheVulnerabilities,
  cacheVulnerabilityBatch,
  getCachedVulnerabilities,
} from "../../../src/core/store/vulnerability-store.js";

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
  runMigrations(db);
  setDatabase(db);
});

afterEach(() => {
  closeDatabase();
});

describe("packument store", () => {
  test("cache miss returns null", () => {
    expect(getCachedPackument("nonexistent")).toBeNull();
  });

  test("cache hit returns data", () => {
    const data = { name: "express", versions: { "4.21.2": {} } };
    cachePackument("express", data);
    const result = getCachedPackument("express");
    expect(result).toEqual(data);
  });

  test("handles scoped packages", () => {
    const data = { name: "@types/node" };
    cachePackument("@types/node", data);
    expect(getCachedPackument("@types/node")).toEqual(data);
  });
});

describe("package store", () => {
  test("cache miss returns null", () => {
    expect(getCachedPackage("nonexistent", "1.0.0")).toBeNull();
  });

  test("caches and retrieves package (immutable, no TTL)", () => {
    cachePackage({
      name: "lodash",
      version: "4.17.21",
      license: "MIT",
      licenseCategory: "permissive",
      dependencies: { "lodash.debounce": "^4.0.0" },
    });

    const result = getCachedPackage("lodash", "4.17.21");
    expect(result).not.toBeNull();
    expect(result!.license).toBe("MIT");
    expect(result!.licenseCategory).toBe("permissive");
    expect(result!.dependencies).toEqual({ "lodash.debounce": "^4.0.0" });
  });

  test("batch insert", () => {
    cachePackageBatch([
      {
        name: "a",
        version: "1.0.0",
        license: "MIT",
        licenseCategory: "permissive",
        dependencies: {},
      },
      {
        name: "b",
        version: "2.0.0",
        license: "ISC",
        licenseCategory: "permissive",
        dependencies: {},
      },
    ]);

    expect(getCachedPackage("a", "1.0.0")).not.toBeNull();
    expect(getCachedPackage("b", "2.0.0")).not.toBeNull();
  });

  test("INSERT OR IGNORE preserves first insert", () => {
    cachePackage({
      name: "x",
      version: "1.0.0",
      license: "MIT",
      licenseCategory: "permissive",
      dependencies: {},
    });
    // Second insert with different data should be ignored
    cachePackage({
      name: "x",
      version: "1.0.0",
      license: "ISC",
      licenseCategory: "permissive",
      dependencies: { y: "^1.0.0" },
    });

    const result = getCachedPackage("x", "1.0.0");
    expect(result!.license).toBe("MIT"); // First insert preserved
  });
});

describe("vulnerability store", () => {
  test("cache miss returns null", () => {
    expect(getCachedVulnerabilities("nonexistent", "1.0.0")).toBeNull();
  });

  test("caches vulnerabilities (including zero vulns)", () => {
    cacheVulnerabilities("safe-pkg", "1.0.0", []);
    const result = getCachedVulnerabilities("safe-pkg", "1.0.0");
    expect(result).toEqual([]);
  });

  test("caches and retrieves vulns", () => {
    const vulns = [{ id: "GHSA-123", summary: "XSS vulnerability" }];
    cacheVulnerabilities("vuln-pkg", "1.0.0", vulns as any);
    const result = getCachedVulnerabilities("vuln-pkg", "1.0.0");
    expect(result).toHaveLength(1);
    expect(result![0].id).toBe("GHSA-123");
  });

  test("batch insert", () => {
    cacheVulnerabilityBatch([
      { name: "a", version: "1.0.0", vulns: [] },
      { name: "b", version: "2.0.0", vulns: [{ id: "CVE-1" } as any] },
    ]);

    expect(getCachedVulnerabilities("a", "1.0.0")).toEqual([]);
    expect(getCachedVulnerabilities("b", "2.0.0")).toHaveLength(1);
  });
});

describe("store stats", () => {
  test("returns counts", () => {
    cachePackument("express", { name: "express" });
    cachePackage({
      name: "lodash",
      version: "4.17.21",
      license: "MIT",
      licenseCategory: "permissive",
      dependencies: {},
    });
    cacheVulnerabilities("x", "1.0.0", []);

    const stats = getStoreStats();
    expect(stats.packuments).toBe(1);
    expect(stats.packages).toBe(1);
    expect(stats.vulnerabilities).toBe(1);
  });
});

describe("clearAllStores", () => {
  test("removes all entries", () => {
    cachePackument("express", { name: "express" });
    cachePackage({
      name: "lodash",
      version: "4.17.21",
      license: "MIT",
      licenseCategory: "permissive",
      dependencies: {},
    });
    cacheVulnerabilities("x", "1.0.0", []);

    clearAllStores();

    const stats = getStoreStats();
    expect(stats.packuments).toBe(0);
    expect(stats.packages).toBe(0);
    expect(stats.vulnerabilities).toBe(0);
  });
});
