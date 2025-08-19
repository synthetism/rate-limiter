import type { RateLimitResult } from "./types.js";

// Storage-native bucket data (plain object - JSON serializable)
export interface BucketData {
  tokens: number;
  capacity: number;
  burstCapacity: number; // Total capacity including burst
  lastRefill: number;
  window: number;
  refillRate: number;
}

export interface BucketInfo {
  tokens: number;
  capacity: number;
  lastRefill: number;
  nextRefill: number;
}

// Pure functions for token bucket operations (no classes, no state)
export function createBucket(
  capacity: number,
  window: number,
  burst = 0,
): BucketData {
  return {
    tokens: capacity + burst, // Allow burst initially
    capacity,
    burstCapacity: capacity + burst, // Total capacity including burst
    lastRefill: Date.now(),
    window,
    refillRate: capacity / window, // tokens per ms
  };
}

export function consumeToken(bucket: BucketData): {
  bucket: BucketData;
  result: RateLimitResult;
} {
  const refilled = refillBucket(bucket);

  if (refilled.tokens >= 1) {
    const updatedBucket = {
      ...refilled,
      tokens: refilled.tokens - 1,
    };

    return {
      bucket: updatedBucket,
      result: {
        allowed: true,
        remaining: Math.floor(updatedBucket.tokens),
        resetTime: refilled.lastRefill + refilled.window,
      },
    };
  }

  const timeToNextToken = Math.ceil(
    (1 - refilled.tokens) / refilled.refillRate,
  );
  return {
    bucket: refilled,
    result: {
      allowed: false,
      remaining: 0,
      resetTime: refilled.lastRefill + refilled.window,
      retryAfter: timeToNextToken,
    },
  };
}

export function refillBucket(bucket: BucketData): BucketData {
  const now = Date.now();
  const timePassed = now - bucket.lastRefill;

  if (timePassed >= bucket.window) {
    // Full refill if window passed - up to burst capacity
    return {
      ...bucket,
      tokens: bucket.burstCapacity,
      lastRefill: now,
    };
  } else {
    // Gradual refill based on time passed - up to burst capacity
    const tokensToAdd = timePassed * bucket.refillRate;
    return {
      ...bucket,
      tokens: Math.min(bucket.burstCapacity, bucket.tokens + tokensToAdd),
      lastRefill: now,
    };
  }
}

export function getBucketInfo(bucket: BucketData): BucketInfo {
  const refilled = refillBucket(bucket);
  return {
    tokens: Math.floor(refilled.tokens),
    capacity: refilled.capacity,
    lastRefill: refilled.lastRefill,
    nextRefill: refilled.lastRefill + refilled.window,
  };
}
