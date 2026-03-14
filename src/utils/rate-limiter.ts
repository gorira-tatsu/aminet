/**
 * Host-based circuit breaker to stop hammering APIs that return 429s.
 * After `threshold` consecutive failures for a host, the circuit opens for `cooldownMs`.
 */
class HostCircuitBreaker {
  private failures = new Map<string, { count: number; openUntil: number }>();

  constructor(
    private readonly threshold = 3,
    private readonly cooldownMs = 30_000,
  ) {}

  isOpen(host: string): boolean {
    const state = this.failures.get(host);
    if (!state) return false;
    if (state.count < this.threshold) return false;
    if (Date.now() >= state.openUntil) {
      this.failures.delete(host);
      return false;
    }
    return true;
  }

  recordFailure(host: string): void {
    const state = this.failures.get(host);
    if (state) {
      state.count++;
      if (state.count >= this.threshold) {
        state.openUntil = Date.now() + this.cooldownMs;
      }
    } else {
      this.failures.set(host, { count: 1, openUntil: 0 });
    }
  }

  recordSuccess(host: string): void {
    this.failures.delete(host);
  }

  reset(): void {
    this.failures.clear();
  }
}

export const circuitBreaker = new HostCircuitBreaker();

/**
 * Token bucket rate limiter.
 * Provides time-based rate limiting in addition to Semaphore's concurrency limiting.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly maxTokens: number,
    private readonly refillRate: number, // tokens per second
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Wait until a token is available
    const waitTime = ((1 - this.tokens) / this.refillRate) * 1000;
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        this.refill();
        this.tokens -= 1;
        resolve();
      }, waitTime);
    });
  }
}
