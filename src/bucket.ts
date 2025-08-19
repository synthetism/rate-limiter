import type { RateLimitResult } from './types.js';

export interface BucketInfo {
  tokens: number;
  capacity: number;
  lastRefill: number;
  nextRefill: number;
}

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number;
  private readonly window: number;

  constructor(capacity: number, window: number, burst = 0) {
    this.capacity = capacity;
    this.tokens = capacity + burst; // Allow burst initially
    this.lastRefill = Date.now();
    this.window = window;
    this.refillRate = capacity / window; // tokens per ms
  }

  consume(): RateLimitResult {
    this.refill();
    
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return {
        allowed: true,
        remaining: Math.floor(this.tokens),
        resetTime: this.lastRefill + this.window
      };
    }
    
    const timeToNextToken = Math.ceil((1 - this.tokens) / this.refillRate);
    return {
      allowed: false,
      remaining: 0,
      resetTime: this.lastRefill + this.window,
      retryAfter: timeToNextToken
    };
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    
    if (timePassed >= this.window) {
      // Full refill if window passed
      this.tokens = this.capacity;
      this.lastRefill = now;
    } else {
      // Gradual refill based on time passed
      const tokensToAdd = timePassed * this.refillRate;
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  getInfo(): BucketInfo {
    this.refill();
    return {
      tokens: Math.floor(this.tokens),
      capacity: this.capacity,
      lastRefill: this.lastRefill,
      nextRefill: this.lastRefill + this.window
    };
  }
}
