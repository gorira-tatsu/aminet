import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("database degraded mode", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.doUnmock("../../../src/core/store/adapter.js");
    vi.doUnmock("../../../src/core/store/migrations.js");
    vi.doUnmock("../../../src/utils/logger.js");
  });

  it("warns once and continues in ephemeral mode when persistent cache init fails", async () => {
    const warn = vi.fn();

    vi.doMock("../../../src/core/store/adapter.js", () => ({
      createDatabase: vi.fn(() => {
        throw new Error("native bindings unavailable");
      }),
    }));
    vi.doMock("../../../src/core/store/migrations.js", () => ({
      runMigrations: vi.fn(),
    }));
    vi.doMock("../../../src/utils/logger.js", () => ({
      logger: {
        debug: vi.fn(),
        warn,
      },
    }));

    const {
      closeDatabase,
      getDatabase,
      getPersistentCacheFailureReason,
      isPersistentCacheAvailable,
    } = await import("../../../src/core/store/database.js");

    const first = getDatabase(":memory:");
    const second = getDatabase(":memory:");

    expect(first).toBe(second);
    expect(isPersistentCacheAvailable()).toBe(false);
    expect(getPersistentCacheFailureReason()).toBe("native bindings unavailable");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ephemeral mode"));

    closeDatabase();
  });
});
