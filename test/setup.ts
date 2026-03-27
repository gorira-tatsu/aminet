import { afterEach, vi } from "vitest";

// Restore all mocks after each test to prevent leakage between tests
afterEach(() => {
  vi.restoreAllMocks();
});

// Guard against accidental network calls in unit tests
const originalFetch = globalThis.fetch;
globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
  const url = typeof args[0] === "string" ? args[0] : args[0] instanceof URL ? args[0].href : "";
  if (url.startsWith("http")) {
    throw new Error(
      `Unexpected network call to ${url} in unit test. Mock fetch or use test:integration.`,
    );
  }
  return originalFetch(...args);
}) as typeof fetch;
