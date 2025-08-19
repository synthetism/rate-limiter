export interface RateLimitContext {
  clientId?: string;
  resource?: string;
  key?: string;
  userId?: string;
  ip?: string;
  [key: string]: unknown;
}

export interface RateLimitStats {
  totalRequests: number;
  allowedRequests: number;
  rejectedRequests: number;
  totalKeys: number;
  avgResponseTime: number;
  bucketsCreated: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
  key?: string;
}
