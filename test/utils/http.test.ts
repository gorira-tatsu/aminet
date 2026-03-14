import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { fetchWithRetry } from "../../src/utils/http.js";
import { circuitBreaker } from "../../src/utils/rate-limiter.js";

const originalFetch = globalThis.fetch;

describe("fetchWithRetry", () => {
  beforeEach(() => {
    circuitBreaker.reset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    circuitBreaker.reset();
  });

  test("waits at least 1 second when Retry-After is 0", async () => {
    const fetchMock = mock<typeof fetch>(() =>
      Promise.resolve(new Response(null, { status: 200 })),
    );
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        new Response(null, {
          status: 429,
          headers: { "Retry-After": "0" },
        }),
      ),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const start = Date.now();
    const response = await fetchWithRetry("https://api.deps.dev/v3alpha/test", undefined, {
      maxRetries: 1,
      maxRateLimitRetries: 1,
      baseDelay: 10,
    });
    const elapsed = Date.now() - start;

    expect(response.status).toBe(200);
    expect(elapsed).toBeGreaterThanOrEqual(900);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("opens the circuit breaker after repeated 429s", async () => {
    const fetchMock = mock<typeof fetch>(() =>
      Promise.resolve(new Response(null, { status: 429 })),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    for (let i = 0; i < 3; i++) {
      const response = await fetchWithRetry("https://api.deps.dev/v3alpha/test", undefined, {
        maxRetries: 0,
        maxRateLimitRetries: 0,
      });
      expect(response.status).toBe(429);
    }

    const response = await fetchWithRetry("https://api.deps.dev/v3alpha/test", undefined, {
      maxRetries: 0,
      maxRateLimitRetries: 0,
    });

    expect(response.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
