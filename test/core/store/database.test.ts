import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("database fallback", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.exitCode = 0;
  });

  afterEach(async () => {
    try {
      const dbModule = await import("../../../src/core/store/database.js");
      dbModule.closeDatabase();
    } catch {
      // ignore
    }
    vi.doUnmock("../../../src/core/store/adapter.js");
    process.exitCode = 0;
  });

  it("falls back to a no-op database when native sqlite fails to initialize", async () => {
    vi.doMock("../../../src/core/store/adapter.js", async () => {
      const actual = await vi.importActual<typeof import("../../../src/core/store/adapter.js")>(
        "../../../src/core/store/adapter.js",
      );
      return {
        ...actual,
        createDatabase: () => {
          throw new Error("native bindings unavailable");
        },
      };
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const dbModule = await import("../../../src/core/store/database.js");
    const packumentStore = await import("../../../src/core/store/packument-store.js");

    dbModule.getDatabase();

    expect(dbModule.isPersistentCacheAvailable()).toBe(false);
    expect(dbModule.getPersistentCacheFailureReason()).toContain("native bindings unavailable");
    expect(errorSpy).toHaveBeenCalledTimes(1);

    expect(() => packumentStore.cachePackument("express", { name: "express" })).not.toThrow();
    expect(packumentStore.getCachedPackument("express")).toBeNull();
  });
});
