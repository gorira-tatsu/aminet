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
