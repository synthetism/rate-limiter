
export interface RateLimitContext {
  key?: string;
  userId?: string;
  ip?: string;
  [key: string]: unknown;
}

export interface RateLimitStats {
  totalRequests: number;
  allowedRequests: number;
  blockedRequests: number;
  activeBuckets: number;
  allowRate: number;
  created: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}
