import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { closeDatabase, setDatabase } from "../../../src/core/store/database.js";
import { runMigrations } from "../../../src/core/store/migrations.js";
import {
  cacheDepsdevProject,
  cacheDepsdevVersion,
  cacheNpmDownloads,
} from "../../../src/core/store/trust-api-store.js";
import {
  fetchDepsdevProject,
  fetchDepsdevVersion,
} from "../../../src/core/trust/depsdev-client.js";
import { fetchWeeklyDownloads } from "../../../src/core/trust/npm-downloads-client.js";

let db: Database;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  db = new Database(":memory:");
  runMigrations(db);
  setDatabase(db);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  closeDatabase();
});

describe("trust external cache clients", () => {
  test("fetchWeeklyDownloads returns cached value without network", async () => {
    cacheNpmDownloads("express", 999);
    const fetchMock = mock<typeof fetch>(() => {
      throw new Error("network should not be used");
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(fetchWeeklyDownloads("express")).resolves.toBe(999);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("fetchDepsdevVersion returns cached value without network", async () => {
    const payload = {
      versionKey: { system: "npm", name: "express", version: "4.21.2" },
      advisoryKeys: [{ id: "ADV-1" }],
    };
    cacheDepsdevVersion("express", "4.21.2", payload as any);
    const fetchMock = mock<typeof fetch>(() => {
      throw new Error("network should not be used");
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(fetchDepsdevVersion("express", "4.21.2")).resolves.toEqual(payload);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("fetchDepsdevProject returns cached value without network", async () => {
    const payload = {
      projectKey: { id: "github.com/expressjs/express" },
      scorecard: { date: "2025-01-01", score: 7.1, checks: [] },
    };
    cacheDepsdevProject("github.com/expressjs/express", payload as any);
    const fetchMock = mock<typeof fetch>(() => {
      throw new Error("network should not be used");
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(fetchDepsdevProject("github.com/expressjs/express")).resolves.toEqual(payload);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
