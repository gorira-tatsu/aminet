import { logger } from "./logger.js";
import { circuitBreaker } from "./rate-limiter.js";

export interface FetchOptions {
  maxRetries?: number;
  maxRateLimitRetries?: number;
  baseDelay?: number;
  timeout?: number;
}

const DEFAULT_OPTIONS: Required<FetchOptions> = {
  maxRetries: 3,
  maxRateLimitRetries: 2,
  baseDelay: 1000,
  timeout: 30000,
};

function extractHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options?: FetchOptions,
): Promise<Response> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const host = extractHost(url);

  // Circuit breaker: if the host is failing repeatedly, skip immediately
  if (circuitBreaker.isOpen(host)) {
    logger.debug(`Circuit breaker open for ${host}, skipping request`);
    return new Response(null, { status: 503, statusText: "Circuit Breaker Open" });
  }

  let rateLimitRetries = 0;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeout);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        circuitBreaker.recordFailure(host);
        rateLimitRetries++;

        if (rateLimitRetries > opts.maxRateLimitRetries) {
          logger.debug(`Rate limit retries exhausted for ${host}, returning 429`);
          return response;
        }

        if (circuitBreaker.isOpen(host)) {
          logger.debug(`Circuit breaker tripped for ${host}, returning 429`);
          return response;
        }

        const retryAfter = response.headers.get("Retry-After");
        // Enforce minimum 1 second delay to avoid tight retry loops when Retry-After: 0
        const delay = retryAfter
          ? Math.max(1000, Number.parseInt(retryAfter, 10) * 1000)
          : opts.baseDelay * 2 ** attempt;
        logger.debug(`Rate limited by ${host}, retrying after ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      if (response.status >= 500 && attempt < opts.maxRetries) {
        const delay = opts.baseDelay * 2 ** attempt;
        logger.debug(`Server error ${response.status} from ${host}, retrying after ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      // Success — reset circuit breaker for this host
      circuitBreaker.recordSuccess(host);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (attempt === opts.maxRetries) {
        throw error;
      }
      const delay = opts.baseDelay * 2 ** attempt;
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.debug(`Request to ${host} failed (${errorMsg}), retrying after ${delay}ms...`);
      await sleep(delay);
    }
  }

  throw new Error(`Failed to fetch ${url} after ${opts.maxRetries} retries`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
