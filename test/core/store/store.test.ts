import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { TTL } from "../../../src/core/store/config.js";
import { closeDatabase, setDatabase } from "../../../src/core/store/database.js";
import {
  clearAllStores,
  getStoreStats,
  pruneExpiredStores,
} from "../../../src/core/store/index.js";
import { cacheLicenseIntelligence } from "../../../src/core/store/license-store.js";
import { runMigrations } from "../../../src/core/store/migrations.js";
import {
  cachePackage,
  cachePackageBatch,
  getCachedPackage,
} from "../../../src/core/store/package-store.js";
import { cachePackument, getCachedPackument } from "../../../src/core/store/packument-store.js";
import { cacheSecuritySignals } from "../../../src/core/store/security-store.js";
import {
  cacheDepsdevProject,
  cacheDepsdevVersion,
  cacheNpmDownloads,
  getCachedDepsdevProject,
  getCachedDepsdevVersion,
  getCachedNpmDownloads,
} from "../../../src/core/store/trust-api-store.js";
import { cacheTrustScore } from "../../../src/core/store/trust-store.js";
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

describe("trust api store", () => {
  test("caches npm downloads including null", () => {
    cacheNpmDownloads("express", 123456);
    cacheNpmDownloads("missing-pkg", null);

    expect(getCachedNpmDownloads("express")).toBe(123456);
    expect(getCachedNpmDownloads("missing-pkg")).toBeNull();
  });

  test("caches deps.dev version and project payloads", () => {
    const versionData = {
      versionKey: { system: "npm", name: "express", version: "4.21.2" },
      advisoryKeys: [{ id: "ADV-1" }],
    };
    const projectData = {
      projectKey: { id: "github.com/expressjs/express" },
      scorecard: { date: "2025-01-01", score: 7.5, checks: [] },
    };

    cacheDepsdevVersion("express", "4.21.2", versionData as any);
    cacheDepsdevProject("github.com/expressjs/express", projectData as any);

    expect(getCachedDepsdevVersion("express", "4.21.2")).toEqual(versionData);
    expect(getCachedDepsdevProject("github.com/expressjs/express")).toEqual(projectData);
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
    cacheSecuritySignals("express", "4.21.2", []);
    cacheLicenseIntelligence("express", "4.21.2", {
      declared: "MIT",
      discovered: "MIT",
      confidence: "high",
      mismatch: false,
      attributionParties: [],
    });
    cacheTrustScore("express", "4.21.2", {
      overall: 82,
      breakdown: { maintenance: 80, security: 84, community: 78, maturity: 86, popularity: 88 },
      signals: [],
      hasProvenance: true,
      scorecardScore: 7.5,
    });
    cacheNpmDownloads("express", 123);
    cacheDepsdevVersion("express", "4.21.2", null);
    cacheDepsdevProject("github.com/expressjs/express", null);

    const stats = getStoreStats();
    expect(stats.packuments).toBe(1);
    expect(stats.packages).toBe(1);
    expect(stats.vulnerabilities).toBe(1);
    expect(stats.securitySignals).toBe(1);
    expect(stats.licenseIntelligence).toBe(1);
    expect(stats.trustScores).toBe(1);
    expect(stats.npmDownloads).toBe(1);
    expect(stats.depsdevVersions).toBe(1);
    expect(stats.depsdevProjects).toBe(1);
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
    cacheSecuritySignals("express", "4.21.2", []);
    cacheLicenseIntelligence("express", "4.21.2", {
      declared: "MIT",
      discovered: "MIT",
      confidence: "high",
      mismatch: false,
      attributionParties: [],
    });
    cacheTrustScore("express", "4.21.2", {
      overall: 82,
      breakdown: { maintenance: 80, security: 84, community: 78, maturity: 86, popularity: 88 },
      signals: [],
      hasProvenance: true,
      scorecardScore: 7.5,
    });
    cacheNpmDownloads("express", 123);
    cacheDepsdevVersion("express", "4.21.2", null);
    cacheDepsdevProject("github.com/expressjs/express", null);

    clearAllStores();

    const stats = getStoreStats();
    expect(stats.packuments).toBe(0);
    expect(stats.packages).toBe(0);
    expect(stats.vulnerabilities).toBe(0);
    expect(stats.securitySignals).toBe(0);
    expect(stats.licenseIntelligence).toBe(0);
    expect(stats.trustScores).toBe(0);
    expect(stats.npmDownloads).toBe(0);
    expect(stats.depsdevVersions).toBe(0);
    expect(stats.depsdevProjects).toBe(0);
  });
});

describe("pruneExpiredStores", () => {
  test("removes only expired cache entries", () => {
    const now = Date.now();

    cachePackument("fresh-packument", { name: "fresh-packument" });
    cachePackage({
      name: "immutable-pkg",
      version: "1.0.0",
      license: "MIT",
      licenseCategory: "permissive",
      dependencies: {},
    });

    db.run(
      "INSERT INTO packuments (ecosystem, name, hash, data, fetched_at) VALUES (?, ?, ?, ?, ?)",
      [
        "npm",
        "expired-packument",
        "expired-packument",
        JSON.stringify({ name: "expired-packument" }),
        now - TTL.packument - 1,
      ],
    );
    db.run(
      "INSERT INTO vulnerabilities (ecosystem, name, version, hash, vulns, vuln_count, scanned_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ["npm", "expired-vuln", "1.0.0", "expired-vuln", "[]", 0, now - TTL.vulnerability - 1],
    );
    db.run(
      "INSERT INTO security_signals (ecosystem, name, version, category, severity, title, description, details, scanned_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        "npm",
        "expired-security",
        "1.0.0",
        "_none",
        "info",
        "No signals",
        "",
        null,
        now - TTL.securitySignals - 1,
      ],
    );
    db.run(
      "INSERT INTO license_intelligence (ecosystem, name, version, declared_license, discovered_license, confidence, attribution_parties, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        "npm",
        "expired-license",
        "1.0.0",
        "MIT",
        "MIT",
        "high",
        null,
        now - TTL.licenseIntelligence - 1,
      ],
    );
    db.run(
      "INSERT INTO trust_scores (ecosystem, name, version, overall_score, breakdown, signals, has_provenance, scorecard_score, computed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        "npm",
        "expired-trust",
        "1.0.0",
        80,
        JSON.stringify({ maintenance: 80 }),
        "[]",
        0,
        null,
        now - TTL.trustScore - 1,
      ],
    );
    db.run(
      "INSERT INTO npm_downloads_cache (ecosystem, name, weekly_downloads, fetched_at) VALUES (?, ?, ?, ?)",
      ["npm", "expired-downloads", 10, now - TTL.npmDownloads - 1],
    );
    db.run(
      "INSERT INTO depsdev_versions_cache (ecosystem, name, version, data, fetched_at) VALUES (?, ?, ?, ?, ?)",
      ["npm", "expired-depsdev", "1.0.0", null, now - TTL.depsdevVersion - 1],
    );
    db.run("INSERT INTO depsdev_projects_cache (project_id, data, fetched_at) VALUES (?, ?, ?)", [
      "expired/project",
      null,
      now - TTL.depsdevProject - 1,
    ]);

    const result = pruneExpiredStores(now);
    expect(result.totalDeleted).toBe(8);
    expect(result.packuments).toBe(1);
    expect(result.vulnerabilities).toBe(1);
    expect(result.securitySignals).toBe(1);
    expect(result.licenseIntelligence).toBe(1);
    expect(result.trustScores).toBe(1);
    expect(result.npmDownloads).toBe(1);
    expect(result.depsdevVersions).toBe(1);
    expect(result.depsdevProjects).toBe(1);

    const stats = getStoreStats();
    expect(stats.packuments).toBe(1);
    expect(stats.packages).toBe(1);
    expect(stats.vulnerabilities).toBe(0);
  });
});
