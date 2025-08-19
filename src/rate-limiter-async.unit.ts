import {
  Unit,
  type UnitProps,
  createUnitSchema,
  type TeachingContract,
  type UnitCore,
  Capabilities,
  Schema,
  Validator,
} from "@synet/unit";
import type {
  RateLimitResult,
  RateLimitContext,
  RateLimitStats,
} from "./types.js";
import {
  createBucket,
  consumeToken,
  getBucketInfo,
  type BucketData,
  type BucketInfo,
} from "./bucket.js";

// StorageBinding interface - what RateLimiter expects from storage
export interface StorageBinding {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  exists?(key: string): Promise<boolean>;
  clear?(): Promise<void>;
}

// === RATE LIMITER CORE ===

export interface RateLimiterConfig {
  requests?: number; // Max requests (default: 100)
  window?: number; // Time window in ms (default: 60000 = 1 minute)
  burst?: number; // Burst allowance (default: 10)
  keyGenerator?: (context: RateLimitContext) => string; // Custom key generator
  storage?: StorageBinding; // Optional external storage - defaults to memory
}

export interface RateLimiterProps extends UnitProps {
  requests: number;
  window: number;
  burst: number;
  keyGenerator: (context: RateLimitContext) => string;
  storage: StorageBinding; // Direct storage injection
}

// Simple memory storage for default behavior
class MemoryStorage implements StorageBinding {
  private data = new Map<string, any>();

  async get<T>(key: string): Promise<T | null> {
    return this.data.get(key) || null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.data.has(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }
}

export class RateLimiter extends Unit<RateLimiterProps> {
  protected constructor(props: RateLimiterProps) {
    super(props);
  }

  // v1.1.0 Consciousness Trinity
  protected build(): UnitCore {
    const capabilities = Capabilities.create(this.dna.id, {
      check: async (...args: unknown[]) => {
        const [context] = args as [RateLimitContext];
        return this.check(context);
      },
      consume: async (...args: unknown[]) => {
        const [context] = args as [RateLimitContext];
        return this.consume(context);
      },
      reset: async (...args: unknown[]) => {
        const [key] = args as [string];
        return this.reset(key);
      },
      stats: async (...args: unknown[]) => {
        const [key] = args as [string | undefined];
        return this.stats(key);
      },
      cleanup: async (...args: unknown[]) => {
        return this.cleanup();
      },
    });

    // Rich schemas for Tool units - define what we teach
    const schema = Schema.create(this.dna.id, {
      check: {
        name: "check",
        description: "Check if request is allowed without consuming tokens",
        parameters: {
          type: "object",
          properties: {
            context: {
              type: "object",
              description: "Rate limit context with client and resource info",
            },
          },
          required: ["context"],
        },
        response: {
          type: "object",
          properties: {
            allowed: {
              type: "boolean",
              description: "Whether request is allowed",
            },
            remaining: { type: "number", description: "Remaining tokens" },
            resetTime: {
              type: "number",
              description: "When bucket resets (timestamp)",
            },
            retryAfter: {
              type: "number",
              description: "Milliseconds until retry",
            },
            key: { type: "string", description: "Rate limit key used" },
          },
        },
      },
      consume: {
        name: "consume",
        description: "Consume a token if available",
        parameters: {
          type: "object",
          properties: {
            context: {
              type: "object",
              description: "Rate limit context with client and resource info",
            },
          },
          required: ["context"],
        },
        response: {
          type: "object",
          properties: {
            allowed: {
              type: "boolean",
              description: "Whether token was consumed",
            },
            remaining: { type: "number", description: "Remaining tokens" },
            resetTime: {
              type: "number",
              description: "When bucket resets (timestamp)",
            },
            retryAfter: {
              type: "number",
              description: "Milliseconds until retry",
            },
            key: { type: "string", description: "Rate limit key used" },
          },
        },
      },
      reset: {
        name: "reset",
        description: "Reset rate limit bucket for specific key",
        parameters: {
          type: "object",
          properties: {
            key: { type: "string", description: "Rate limit key to reset" },
          },
          required: ["key"],
        },
        response: { type: "void" },
      },
      stats: {
        name: "stats",
        description: "Get rate limiting statistics",
        parameters: {
          type: "object",
          properties: {
            key: {
              type: "string",
              description: "Specific key stats (optional)",
            },
          },
        },
        response: {
          type: "object",
          properties: {
            totalRequests: {
              type: "number",
              description: "Total requests processed",
            },
            allowedRequests: {
              type: "number",
              description: "Allowed requests count",
            },
            rejectedRequests: {
              type: "number",
              description: "Rejected requests count",
            },
            totalKeys: { type: "number", description: "Total unique keys" },
            avgResponseTime: {
              type: "number",
              description: "Average response time",
            },
            bucketsCreated: {
              type: "number",
              description: "Number of buckets created",
            },
          },
        },
      },
      cleanup: {
        name: "cleanup",
        description: "Cleanup expired rate limit buckets",
        parameters: {
          type: "object",
          properties: {},
        },
        response: { type: "void" },
      },
    });

    const validator = Validator.create({
      unitId: this.dna.id,
      capabilities,
      schema,
      strictMode: false,
    });

    return { capabilities, schema, validator };
  }

  capabilities(): Capabilities {
    return this._unit.capabilities;
  }
  schema(): Schema {
    return this._unit.schema;
  }
  validator(): Validator {
    return this._unit.validator;
  }

  // Storage-native bucket operations
  private async getBucket(key: string): Promise<BucketData> {
    const bucket = await this.props.storage.get<BucketData>(key);
    if (!bucket) {
      // Create new bucket using proper function signature
      const newBucket = createBucket(
        this.props.requests, // capacity
        this.props.window, // window
        this.props.burst, // burst
      );
      await this.props.storage.set(key, newBucket);
      return newBucket;
    }
    return bucket;
  }

  private async setBucket(key: string, bucket: BucketData): Promise<void> {
    await this.props.storage.set(key, bucket);
  }

  static create(config: RateLimiterConfig = {}): RateLimiter {
    const requests = config.requests ?? 100;
    const window = config.window ?? 60000; // 1 minute
    const burst = config.burst ?? 10;
    const keyGenerator =
      config.keyGenerator ??
      ((ctx: RateLimitContext) =>
        `${ctx.clientId || "default"}:${ctx.resource || "global"}`);
    const storage = config.storage ?? new MemoryStorage();

    const props: RateLimiterProps = {
      dna: createUnitSchema({ id: "rate-limiter", version: "1.1.0" }),
      requests,
      window,
      burst,
      keyGenerator,
      storage,
    };

    return new RateLimiter(props);
  }

  // === RATE LIMITING OPERATIONS ===

  async check(context: RateLimitContext): Promise<RateLimitResult> {
    const key = this.props.keyGenerator(context);
    const bucket = await this.getBucket(key);
    const info = getBucketInfo(bucket);

    return {
      allowed: info.tokens > 0,
      remaining: info.tokens,
      resetTime: info.nextRefill,
      retryAfter: info.tokens === 0 ? info.nextRefill - Date.now() : 0,
      key,
    };
  }

  async consume(context: RateLimitContext): Promise<RateLimitResult> {
    const key = this.props.keyGenerator(context);
    const bucket = await this.getBucket(key);

    // Try to consume a token
    const consumeResult = consumeToken(bucket);

    if (consumeResult.result.allowed) {
      // Update bucket in storage
      await this.setBucket(key, consumeResult.bucket);
    }

    return {
      ...consumeResult.result,
      key,
    };
  }

  async stats(key?: string): Promise<RateLimitStats> {
    if (key) {
      const bucket = await this.getBucket(key);
      const info = getBucketInfo(bucket);
      const initialTokens = this.props.requests + this.props.burst;

      return {
        totalRequests: initialTokens - info.tokens,
        allowedRequests: initialTokens - info.tokens,
        rejectedRequests: 0, // Would need separate tracking
        totalKeys: 1,
        avgResponseTime: 0,
        bucketsCreated: 1,
      };
    }

    // Global stats would require iteration - simplified for now
    return {
      totalRequests: 0,
      allowedRequests: 0,
      rejectedRequests: 0,
      totalKeys: 0,
      avgResponseTime: 0,
      bucketsCreated: 0,
    };
  }

  async reset(key: string): Promise<void> {
    await this.props.storage.delete(key);
  }

  async cleanup(): Promise<void> {
    // For simple memory storage, no cleanup needed
    // For distributed storage, would implement TTL-based cleanup
    if (this.props.storage.clear) {
      await this.props.storage.clear();
    }
  }

  // === HELP & TEACHING ===

  help(): string {
    return `
RateLimiter Unit v1.1.0 - Storage-Native Rate Limiting

CAPABILITIES:
  • check(context) - Check if request allowed (no token consumption)
  • consume(context) - Consume token if available  
  • reset(key) - Reset specific rate limit bucket
  • stats(key?) - Get rate limiting statistics
  • cleanup() - Clean up expired buckets

FEATURES:
  ✓ Token bucket algorithm with burst support
  ✓ Storage-agnostic design via StorageBinding
  ✓ Custom key generation
  ✓ Memory and distributed storage support
  ✓ Zero external dependencies

EXAMPLES:
  const limiter = RateLimiter.create({
    requests: 100,     // 100 requests
    window: 60000,     // per minute  
    burst: 10,         // +10 burst
    storage: myStorage // optional external storage
  });

  const result = await limiter.consume({
    clientId: 'user123',
    resource: '/api/data'
  });

ARCHITECTURE:
  RateLimiter + StorageBinding + Pure Functions
  → No StateAsync complexity
  → Storage-native BucketData objects
  → Direct storage injection
`;
  }

  whoami(): string {
    return `RateLimiter(${this.dna.id}): ${this.props.requests}req/${this.props.window}ms, burst=${this.props.burst}`;
  }

  teach(): TeachingContract {
    return {
      unitId: this.dna.id,
      capabilities: this._unit.capabilities,
      schema: this._unit.schema,
      validator: this._unit.validator,
    };
  }
}

export default RateLimiter;
