import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("cache command degraded mode", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.exitCode = 0;
  });

  afterEach(() => {
    vi.doUnmock("../../../src/core/store/database.js");
    vi.doUnmock("../../../src/core/store/index.js");
    process.exitCode = 0;
  });

  it("reports unavailable persistent cache instead of crashing", async () => {
    const getStoreStats = vi.fn();
    const clearAllStores = vi.fn();
    const pruneExpiredStores = vi.fn();

    vi.doMock("../../../src/core/store/database.js", () => ({
      getDatabase: vi.fn(),
      isPersistentCacheAvailable: () => false,
      getPersistentCacheFailureReason: () => "native bindings unavailable",
    }));
    vi.doMock("../../../src/core/store/index.js", () => ({
      getStoreStats,
      clearAllStores,
      pruneExpiredStores,
      isPersistentCacheAvailable: () => false,
      getPersistentCacheFailureReason: () => "native bindings unavailable",
    }));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { cacheStatsCommand, cacheClearCommand, cachePruneCommand } = await import(
      "../../../src/cli/commands/cache.js"
    );

    await cacheStatsCommand();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Persistent cache unavailable: native bindings unavailable"),
    );
    expect(getStoreStats).not.toHaveBeenCalled();

    process.exitCode = 0;
    await cacheClearCommand();
    expect(clearAllStores).not.toHaveBeenCalled();

    process.exitCode = 0;
    await cachePruneCommand();
    expect(pruneExpiredStores).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
