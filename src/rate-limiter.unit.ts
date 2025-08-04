import { Unit, type UnitProps, createUnitSchema, type TeachingContract } from '@synet/unit';
import { State } from '@synet/state';

// === RATE LIMITER CORE ===

export interface RateLimiterConfig {
  requests?: number;      // Max requests (default: 100)
  window?: number;        // Time window in ms (default: 60000 = 1 minute)
  burst?: number;         // Burst allowance (default: 10)
  keyGenerator?: (context: RateLimitContext) => string; // Custom key generator
}

export interface RateLimiterProps extends UnitProps {
  requests: number;
  window: number;
  burst: number;
  keyGenerator: (context: RateLimitContext) => string;
  state: State;  // State unit for conscious state management
}

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

export interface BucketInfo {
  tokens: number;
  capacity: number;
  lastRefill: number;
  nextRefill: number;
}

// === TOKEN BUCKET IMPLEMENTATION ===

class TokenBucket {
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

// === RATE LIMITER UNIT ===

export class RateLimiter extends Unit<RateLimiterProps> {
  protected constructor(props: RateLimiterProps) {
    super(props);
  }

  static create(config: RateLimiterConfig = {}): RateLimiter {
    const requests = config.requests || 100;
    const window = config.window || 60000; // 1 minute
    const burst = config.burst || 10;
    
    // Create state unit for conscious state management
    const state = State.create({
      unitId: 'rate-limiter',
      initialState: {
        buckets: new Map<string, TokenBucket>(),
        stats: {
          totalRequests: 0,
          allowedRequests: 0,
          blockedRequests: 0,
          activeBuckets: 0,
          allowRate: 0,
          created: Date.now()
        }
      }
    });

    const props: RateLimiterProps = {
      dna: createUnitSchema({ 
        id: 'rate-limiter', 
        version: '1.0.0'
      }),
      requests,
      window,
      burst,
      keyGenerator: config.keyGenerator || ((context: RateLimitContext) => context?.key || 'default'),
      state
    };

    return new RateLimiter(props);
  }

  // === CORE RATE LIMITING ===

  checkLimit(context: RateLimitContext = {}): RateLimitResult {
    const key = this.props.keyGenerator(context);
    
    // Get buckets from state
    const buckets = this.props.state.get<Map<string, TokenBucket>>('buckets') || new Map();
    
    // Get or create bucket for this key
    if (!buckets.has(key)) {
      buckets.set(key, new TokenBucket(
        this.props.requests,
        this.props.window,
        this.props.burst
      ));
      this.props.state.set('buckets', buckets);
    }

    const bucket = buckets.get(key);
    if (!bucket) {
      throw new Error(`[${this.dna.id}] Bucket not found for key: ${key}`);
    }
    const result = bucket.consume();

    // Update statistics
    this.updateStats(result.allowed);

    return result;
  }

  // === ASYNC RATE LIMITING WITH BACKPRESSURE ===

  async limit<T>(operation: () => Promise<T>, context: RateLimitContext = {}): Promise<T> {
    const result = this.checkLimit(context);
    
    if (result.allowed) {
      return await operation();
    }

    // Rate limited - throw with retry information
    const error = new RateLimitError(
      `Rate limit exceeded. Retry after ${result.retryAfter}ms`,
      result
    );
    throw error;
  }

  // === ASYNC RATE LIMITING WITH AUTOMATIC RETRY ===

  async limitWithRetry<T>(
    operation: () => Promise<T>, 
    context: RateLimitContext = {},
    maxRetries = 3
  ): Promise<T> {
    let attempts = 0;
    
    while (attempts <= maxRetries) {
      const result = this.checkLimit(context);
      
      if (result.allowed) {
        return await operation();
      }

      attempts++;
      if (attempts > maxRetries) {
        throw new RateLimitError(
          `Rate limit exceeded after ${maxRetries} retries`,
          result
        );
      }

      // Wait before retry
      if (result.retryAfter) {
        await this.sleep(result.retryAfter);
      }
    }

    throw new Error('Unexpected rate limit state');
  }

  // === STATISTICS & MONITORING ===

  private updateStats(allowed: boolean): void {
    const stats = this.props.state.get<RateLimitStats>('stats') || {
      totalRequests: 0,
      allowedRequests: 0,
      blockedRequests: 0,
      activeBuckets: 0,
      allowRate: 0,
      created: Date.now()
    };

    stats.totalRequests++;
    
    if (allowed) {
      stats.allowedRequests++;
    } else {
      stats.blockedRequests++;
    }

    const buckets = this.props.state.get<Map<string, TokenBucket>>('buckets') || new Map();
    stats.activeBuckets = buckets.size;
    stats.allowRate = stats.totalRequests > 0 
      ? stats.allowedRequests / stats.totalRequests
      : 0;

    this.props.state.set('stats', stats);
  }

  getStats(): RateLimitStats {
    const stats = this.props.state.get<RateLimitStats>('stats') || {
      totalRequests: 0,
      allowedRequests: 0,
      blockedRequests: 0,
      activeBuckets: 0,
      allowRate: 0,
      created: Date.now()
    };
    return { ...stats };
  }

  getBucketInfo(key: string) {
    const buckets = this.props.state.get<Map<string, TokenBucket>>('buckets') || new Map();
    const bucket = buckets.get(key);
    return bucket ? bucket.getInfo() : null;
  }

  getAllBuckets(): Record<string, BucketInfo> {
    const buckets = this.props.state.get<Map<string, TokenBucket>>('buckets') || new Map();
    const result: Record<string, BucketInfo> = {};
    
    for (const [key, bucket] of buckets.entries()) {
      result[key] = bucket.getInfo();
    }
    
    return result;
  }

  // === MANAGEMENT ===

  getStateUnit(): State {
    return this.props.state;
  }

  reset(key?: string): void {
    if (key) {
      const buckets = this.props.state.get<Map<string, TokenBucket>>('buckets') || new Map();
      buckets.delete(key);
      this.props.state.set('buckets', buckets);
    } else {
      // Reset everything
      this.props.state.set('buckets', new Map<string, TokenBucket>());
      this.props.state.set('stats', {
        totalRequests: 0,
        allowedRequests: 0,
        blockedRequests: 0,
        activeBuckets: 0,
        allowRate: 0,
        created: Date.now()
      });
    }
  }

  // === UTILITIES ===

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // === UNIT ARCHITECTURE ===

  teach(): TeachingContract {
    return {
      unitId: this.dna.id,
      capabilities: {
        checkLimit: (...args: unknown[]) => this.checkLimit(args[0] as RateLimitContext),
        limit: (...args: unknown[]) => this.limit(args[0] as () => Promise<unknown>, args[1] as RateLimitContext),
        limitWithRetry: (...args: unknown[]) => this.limitWithRetry(
          args[0] as () => Promise<unknown>, 
          args[1] as RateLimitContext, 
          args[2] as number
        ),
        getStats: (...args: unknown[]) => this.getStats(),
        getBucketInfo: (...args: unknown[]) => this.getBucketInfo(args[0] as string),
        getAllBuckets: (...args: unknown[]) => this.getAllBuckets(),
        getStateUnit: (...args: unknown[]) => this.getStateUnit(),
        reset: (...args: unknown[]) => this.reset(args[0] as string)
      }
    };
  }

  whoami(): string {
    const stats = this.getStats();
    return `RateLimiter[${this.props.requests}req/${this.props.window}ms, ${stats.activeBuckets} buckets, ${(stats.allowRate * 100).toFixed(1)}% allowed] - v${this.dna.version}`;
  }

  help(): string {
    const stats = this.getStats();
    return `
RateLimiter v${this.dna.version} - Conscious Rate Limiting

Configuration:
• Requests: ${this.props.requests} per ${this.props.window}ms window
• Burst: ${this.props.burst} extra tokens
• Active Buckets: ${stats.activeBuckets}

Statistics:
• Total Requests: ${stats.totalRequests}
• Allowed: ${stats.allowedRequests} (${(stats.allowRate * 100).toFixed(1)}%)
• Blocked: ${stats.blockedRequests}

CORE METHODS:
• checkLimit(context?) - Check if request is allowed
• limit(operation, context?) - Execute with rate limiting
• limitWithRetry(operation, context?, maxRetries?) - Execute with automatic retry

MANAGEMENT:
• getStats() - Get rate limiting statistics
• getBucketInfo(key) - Get specific bucket status
• getAllBuckets() - Get all bucket statuses
• reset(key?) - Reset specific bucket or all

Teaching:
• Teaches all rate limiting capabilities for composition
• Context-aware key generation
• Automatic token bucket management

Example:
  const limiter = RateLimiter.create({ requests: 100, window: 60000 });
  
  const result = limiter.checkLimit({ key: 'user-123' });
  if (result.allowed) {
    // Process request
  } else {
    // Rate limited - retry after result.retryAfter ms
  }
`;
  }
}

// === CUSTOM ERROR ===

export class RateLimitError extends Error {
  constructor(message: string, public result: RateLimitResult) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export default RateLimiter;
