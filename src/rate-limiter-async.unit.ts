import { 
  Unit, 
  type UnitProps, 
  createUnitSchema, 
  type TeachingContract,
  type UnitCore,
  Capabilities,
  Schema,
  Validator
} from '@synet/unit';
import {  StateAsync } from '@synet/state';
import type {
  RateLimitResult,
  RateLimitContext,
  RateLimitStats
} from './types.js';
import { TokenBucket, type BucketInfo } from "./bucket.js";


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
  state: StateAsync;  // State unit for conscious state management
}



export class AsyncRateLimiter extends Unit<RateLimiterProps> {
  protected constructor(props: RateLimiterProps) {
    super(props);
  }
   // v1.1.0 Consciousness Trinity (empty for composition units)
  protected build(): UnitCore {
    const capabilities = Capabilities.create(this.dna.id, {});
    const schema = Schema.create(this.dna.id, {});
    const validator = Validator.create({
      unitId: this.dna.id,
      capabilities,
      schema,
      strictMode: false
    });

    return { capabilities, schema, validator };
  }


  // Consciousness Trinity Access
  capabilities(): Capabilities { return this._unit.capabilities; }
  schema(): Schema { return this._unit.schema; }
  validator(): Validator { return this._unit.validator; }


  static create(config: RateLimiterConfig = {}): AsyncRateLimiter {
    const requests = config.requests || 100;
    const window = config.window || 60000; // 1 minute
    const burst = config.burst || 10;
    
    // Create state unit for conscious state management
    const state = StateAsync.create({
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

    return new AsyncRateLimiter(props);
  }

  // === CORE RATE LIMITING ===

  async checkLimit(context: RateLimitContext = {}): Promise<RateLimitResult> {
    const key = this.props.keyGenerator(context);
    
    // Get buckets from state
    const buckets = await this.props.state.get<Map<string, TokenBucket>>('buckets') || new Map();
    
    // Get or create bucket for this key
    if (!buckets.has(key)) {
      buckets.set(key, new TokenBucket(
        this.props.requests,
        this.props.window,
        this.props.burst
      ));
      await this.props.state.set('buckets', buckets);
    }

    const bucket = buckets.get(key);
    if (!bucket) {
      throw new Error(`[${this.dna.id}] Bucket not found for key: ${key}`);
    }
    const result = bucket.consume();

    // Update statistics
    await  this.updateStats(result.allowed);

    return result;
  }

  // === ASYNC RATE LIMITING WITH BACKPRESSURE ===

  async limit<T>(operation: () => Promise<T>, context: RateLimitContext = {}): Promise<T> {
    const result = await this.checkLimit(context);
    
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
      const result = await this.checkLimit(context);
      
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

  private async updateStats(allowed: boolean): Promise<void> {
    const stats = await this.props.state.get<RateLimitStats>('stats') || {
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

    const buckets = await this.props.state.get<Map<string, TokenBucket>>('buckets') || new Map();
    stats.activeBuckets = buckets.size;
    stats.allowRate = stats.totalRequests > 0 
      ? stats.allowedRequests / stats.totalRequests
      : 0;

    this.props.state.set('stats', stats);
  }

  async getStats(): Promise<RateLimitStats> {
    const stats = await this.props.state.get<RateLimitStats>('stats') || {
      totalRequests: 0,
      allowedRequests: 0,
      blockedRequests: 0,
      activeBuckets: 0,
      allowRate: 0,
      created: Date.now()
    };
    return { ...stats };
  }

  async getBucketInfo(key: string) {
    const buckets = await this.props.state.get<Map<string, TokenBucket>>('buckets') || new Map();
    const bucket = buckets.get(key);
    return bucket ? bucket.getInfo() : null;
  }

  async getAllBuckets(): Promise<Record<string, BucketInfo>> {
    const buckets = await this.props.state.get<Map<string, TokenBucket>>('buckets') || new Map();
    const result: Record<string, BucketInfo> = {};
    
    for (const [key, bucket] of buckets.entries()) {
      result[key] = bucket.getInfo();
    }
    
    return result;
  }

  // === MANAGEMENT ===

  getStateUnit(): StateAsync {
    return this.props.state;
  }

  async reset(key?: string): Promise<void> {
    if (key) {
      const buckets = await this.props.state.get<Map<string, TokenBucket>>('buckets') || new Map();
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

 
 teach(): TeachingContract {
    return {
      unitId: this.dna.id,
      capabilities: this._unit.capabilities,
      schema: this._unit.schema,
      validator: this._unit.validator
    };
  }

  whoami(): string {
    const stats = this.getStats();
    return `RateLimiter[${this.props.requests}req/${this.props.window}ms`;
  }

  help(): string {
    const stats = this.getStats();
    return `
RateLimiter v${this.dna.version} - Conscious Rate Limiting

Configuration:
• Requests: ${this.props.requests} per ${this.props.window}ms window
• Burst: ${this.props.burst} extra tokens


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


export class RateLimitError extends Error {
  constructor(message: string, public result: RateLimitResult) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export default AsyncRateLimiter;
