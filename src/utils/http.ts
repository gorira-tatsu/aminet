import { logger } from "./logger.js";

export interface FetchOptions {
  maxRetries?: number;
  baseDelay?: number;
  timeout?: number;
}

const DEFAULT_OPTIONS: Required<FetchOptions> = {
  maxRetries: 3,
  baseDelay: 1000,
  timeout: 30000,
};

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options?: FetchOptions,
): Promise<Response> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), opts.timeout);

      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : opts.baseDelay * 2 ** attempt;
        logger.warn(`Rate limited, retrying after ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      if (response.status >= 500 && attempt < opts.maxRetries) {
        const delay = opts.baseDelay * 2 ** attempt;
        logger.warn(`Server error ${response.status}, retrying after ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      return response;
    } catch (error) {
      if (attempt === opts.maxRetries) {
        throw error;
      }
      const delay = opts.baseDelay * 2 ** attempt;
      logger.warn(`Request failed, retrying after ${delay}ms...`, error);
      await sleep(delay);
    }
  }

  throw new Error(`Failed to fetch ${url} after ${opts.maxRetries} retries`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
