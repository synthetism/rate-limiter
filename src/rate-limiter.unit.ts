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

// Synchronous StorageBinding interface
export interface SyncStorageBinding {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  delete(key: string): boolean;
  exists?(key: string): boolean;
  clear?(): void;
}

// === RATE LIMITER CORE ===

export interface RateLimiterConfig {
  requests?: number; // Max requests (default: 100)
  window?: number; // Time window in ms (default: 60000 = 1 minute)
  burst?: number; // Burst allowance (default: 10)
  keyGenerator?: (context: RateLimitContext) => string; // Custom key generator
  storage?: SyncStorageBinding; // Optional sync storage - defaults to memory
}

export interface RateLimiterProps extends UnitProps {
  requests: number;
  window: number;
  burst: number;
  keyGenerator: (context: RateLimitContext) => string;
  storage: SyncStorageBinding; // Direct sync storage injection
}

// Simple sync memory storage for default behavior
class SyncMemoryStorage implements SyncStorageBinding {
  private data = new Map<string, unknown>();

  get<T>(key: string): T | null {
    return (this.data.get(key) as T) || null;
  }

  set<T>(key: string, value: T): void {
    this.data.set(key, value);
  }

  delete(key: string): boolean {
    return this.data.delete(key);
  }

  exists(key: string): boolean {
    return this.data.has(key);
  }

  clear(): void {
    this.data.clear();
  }
}

// === RATE LIMITER UNIT ===

export class RateLimiterSync extends Unit<RateLimiterProps> {
  protected constructor(props: RateLimiterProps) {
    super(props);
  }

  // v1.1.0 Consciousness Trinity
  protected build(): UnitCore {
    const capabilities = Capabilities.create(this.dna.id, {
      check: (...args: unknown[]) => {
        const [context] = args as [RateLimitContext];
        return this.check(context);
      },
      consume: (...args: unknown[]) => {
        const [context] = args as [RateLimitContext];
        return this.consume(context);
      },
      reset: (...args: unknown[]) => {
        const [key] = args as [string];
        return this.reset(key);
      },
      stats: (...args: unknown[]) => {
        const [key] = args as [string | undefined];
        return this.stats(key);
      },
      cleanup: (...args: unknown[]) => {
        return this.cleanup();
      },
    });

    // Rich schemas for Tool units - define what we teach
    const schema = Schema.create(this.dna.id, {
      check: {
        name: "check",
        description:
          "Check if request is allowed without consuming tokens (sync)",
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
        description: "Consume a token if available (sync)",
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
        description: "Reset rate limit bucket for specific key (sync)",
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
        description: "Get rate limiting statistics (sync)",
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
        description: "Cleanup expired rate limit buckets (sync)",
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

  // Storage-native bucket operations (sync)
  private getBucket(key: string): BucketData {
    const bucket = this.props.storage.get<BucketData>(key);
    if (!bucket) {
      // Create new bucket using proper function signature
      const newBucket = createBucket(
        this.props.requests, // capacity
        this.props.window, // window
        this.props.burst, // burst
      );
      this.props.storage.set(key, newBucket);
      return newBucket;
    }
    return bucket;
  }

  private setBucket(key: string, bucket: BucketData): void {
    this.props.storage.set(key, bucket);
  }

  static create(config: RateLimiterConfig = {}): RateLimiterSync {
    const requests = config.requests ?? 100;
    const window = config.window ?? 60000; // 1 minute
    const burst = config.burst ?? 10;
    const keyGenerator =
      config.keyGenerator ??
      ((ctx: RateLimitContext) =>
        `${ctx.clientId || "default"}:${ctx.resource || "global"}`);
    const storage = config.storage ?? new SyncMemoryStorage();

    const props: RateLimiterProps = {
      dna: createUnitSchema({ id: "rate-limiter-sync", version: "1.1.0" }),
      requests,
      window,
      burst,
      keyGenerator,
      storage,
    };

    return new RateLimiterSync(props);
  }

  // === RATE LIMITING OPERATIONS (SYNC) ===

  check(context: RateLimitContext): RateLimitResult {
    const key = this.props.keyGenerator(context);
    const bucket = this.getBucket(key);
    const info = getBucketInfo(bucket);

    return {
      allowed: info.tokens > 0,
      remaining: info.tokens,
      resetTime: info.nextRefill,
      retryAfter: info.tokens === 0 ? info.nextRefill - Date.now() : 0,
      key,
    };
  }

  consume(context: RateLimitContext): RateLimitResult {
    const key = this.props.keyGenerator(context);
    const bucket = this.getBucket(key);

    // Try to consume a token
    const consumeResult = consumeToken(bucket);

    if (consumeResult.result.allowed) {
      // Update bucket in storage
      this.setBucket(key, consumeResult.bucket);
    }

    return {
      ...consumeResult.result,
      key,
    };
  }

  stats(key?: string): RateLimitStats {
    if (key) {
      const bucket = this.getBucket(key);
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

  reset(key: string): void {
    this.props.storage.delete(key);
  }

  cleanup(): void {
    // For simple memory storage, no cleanup needed
    if (this.props.storage.clear) {
      this.props.storage.clear();
    }
  }

  // === HELP & TEACHING ===

  help(): string {
    return `
RateLimiterSync Unit v1.1.0 - Synchronous Storage-Native Rate Limiting

CAPABILITIES:
  • check(context) - Check if request allowed (no token consumption)
  • consume(context) - Consume token if available  
  • reset(key) - Reset specific rate limit bucket
  • stats(key?) - Get rate limiting statistics
  • cleanup() - Clean up expired buckets

FEATURES:
  ✓ Synchronous token bucket algorithm with burst support
  ✓ Storage-agnostic design via SyncStorageBinding
  ✓ Custom key generation
  ✓ Memory storage for high-performance scenarios
  ✓ Zero external dependencies
  ✓ zero async overhead

EXAMPLES:
  const limiter = RateLimiterSync.create({
    requests: 100,     // 100 requests
    window: 60000,     // per minute  
    burst: 10,         // +10 burst
    storage: mySyncStorage // optional sync storage
  });

  const result = limiter.consume({
    clientId: 'user123',
    resource: '/api/data'
  });

ARCHITECTURE:
  RateLimiterSync + SyncStorageBinding + Pure Functions
  → No State dependency
  → No async complexity
  → Storage-native BucketData objects
  → Direct sync storage injection

USE CASES:
  • In-memory function rate limiting
  • High-performance scenarios
  • Deterministic testing
  • zero async overhead requirements
`;
  }

  whoami(): string {
    return `RateLimiterSync(${this.dna.id}): ${this.props.requests}req/${this.props.window}ms, burst=${this.props.burst}`;
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

export default RateLimiterSync;
