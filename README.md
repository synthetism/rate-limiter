# Rate Limiter Unit

```bash
 _____       _         _      _           _ _            
|  __ \     | |       | |    (_)         (_) |           
| |__) |__ _| |_ ___  | |     _ _ __ ___  _| |_ ___ _ __  
|  _  // _` | __/ _ \ | |    | | '_ ` _ \| | __/ _ \ '__| 
| | \ \ (_| | ||  __/ | |____| | | | | | | | ||  __/ |    
|_|  \_\__,_|\__\___| |______|_|_| |_| |_|_|\__\___|_|    
                                                          
version: 1.0.0
```

**Storage-first rate limiting with direct storage injection**

Clean token bucket implementation. Memory and storage injection for maximum flexibility and performance.

## Quick Start 

```typescript
import { RateLimiter, RateLimiterSync } from '@synet/rate-limiter';
import { KeyValue } from '@synet/kv';

// custom storage binding injection following StorageBinding interface
const storage = createMyStorageBinding(kv); 

const limiter = RateLimiter.create({
  requests: 100,    // 100 requests
  window: 60000,    // per minute
  burst: 10,        // +10 burst allowance
  storage          // Direct storage injection!
});

// Simple usage - no StateAsync complexity
const result = await limiter.consume({
  clientId: 'user123',
  resource: '/api/data'
});

if (result.allowed) {
  console.log(`✅ Request allowed (${result.remaining} remaining)`);
} else {
  console.log(`❌ Rate limited - retry after ${result.retryAfter}ms`);
}

// 🎯 Sync RateLimiter for high-performance scenarios
const syncLimiter = RateLimiterSync.create({
  requests: 50,
  window: 10000     // Built-in memory storage
});

const syncResult = syncLimiter.consume({ clientId: 'batch-process' });
```


## Storage Injection Patterns

### **With @synet/kv Integration**
```typescript
import { KeyValue } from '@synet/kv';
import { MemoryAdapter } from '@synet/kv/dist/adapters/memory.adapter.js';

// Create KV storage
const kv = KeyValue.create({ 
  adapter: new MemoryAdapter(),
  namespace: 'rate-limiter' 
});

// Create StorageBinding adapter
const storage = {
  async get(key) { return await kv.get(key) || null; },
  async set(key, value) { await kv.set(key, value); },
  async delete(key) { return await kv.delete(key); },
  async exists(key) { return await kv.exists(key); },
  async clear() { await kv.clear(); }
};

// Direct injection
const limiter = RateLimiter.create({ 
  requests: 100, 
  window: 60000,
  storage  // Real distributed storage!
});
```

### **Memory-Only (Default)**
```typescript
// Zero configuration - uses built-in memory storage
const limiter = RateLimiter.create({
  requests: 100,
  window: 60000
});
// Perfect for single-process applications
```

### **Custom Storage Implementation**
```typescript
interface StorageBinding {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  exists?(key: string): Promise<boolean>;
  clear?(): Promise<void>;
}

// Redis, DynamoDB, any storage!
const customStorage: StorageBinding = {
  // Your implementation
};

const limiter = RateLimiter.create({ storage: customStorage });
```

## Sync vs Async - When to Use What

### ** Async RateLimiter** *(Default - for distributed systems)*
**Storage-native design with configurable backends:**
- **Distributed rate limiting** across multiple processes/servers
- **Network requests** (HTTP APIs, databases, external services)
- **Persistent storage** (Redis, DynamoDB, PostgreSQL)
- **Microservices** and cloud-native applications

```typescript
// Perfect for API gateway rate limiting
const result = await limiter.consume({
  clientId: request.userId,
  resource: request.endpoint
});

if (result.allowed) {
  return await processApiRequest(request);
} else {
  return rateLimitResponse(result.retryAfter);
}
```

### ** Sync RateLimiter** *(High-performance local scenarios)*
**Memory-only design for zero-latency operations:**
- **In-memory rate limiting** within single process
- **CPU-bound operations** (image processing, computation)
- **High-frequency operations** (event processing, caching)
- **Local resource protection** (file handles, memory pools)

```typescript
// Perfect for CPU-intensive batch processing
const syncResult = syncLimiter.consume({ clientId: 'batch-worker' });
if (syncResult.allowed) {
  processImageBatch();  // Synchronous operation
}
```

## Core Features

### ** Pure Function Token Bucket**
- **Storage-native algorithm** with plain object buckets
- **Gradual refill** with precise timing (tokens per millisecond)
- **Burst allowance** for handling traffic spikes
- **Per-key isolation** with custom key generation

### **Storage Abstraction**
- **StorageBinding interface** for any storage backend
- **Built-in memory storage** for zero-config usage
- **JSON serialization** compatible (no Map/Class complexity)
- **TTL support** for automatic bucket expiration

### **Unit Architecture Compliance**
- **Direct storage injection** (no StateAsync dependency)
- **Teaching contracts** for composition with other units
- **Zero external dependencies** - pure TypeScript
- **Consciousness trinity** (Capabilities + Schema + Validator)

## Installation

```bash
npm install @synet/rate-limiter
```

```typescript
// Import both variants
import { RateLimiter, RateLimiterSync } from '@synet/rate-limiter';

// Or import specific types
import type { 
  RateLimitResult, 
  RateLimitContext, 
  RateLimitStats 
} from '@synet/rate-limiter';
```

## Complete API Reference

### **RateLimiter (Async)**

```typescript
interface RateLimiterConfig {
  requests?: number;      // Max requests (default: 100)
  window?: number;        // Time window in ms (default: 60000)
  burst?: number;         // Burst allowance (default: 10)
  keyGenerator?: (context: RateLimitContext) => string;
  storage?: StorageBinding;  // Optional storage injection
}

// Core methods
await limiter.check(context)     // Check without consuming
await limiter.consume(context)   // Consume if available
await limiter.reset(key)         // Reset specific bucket
await limiter.stats(key?)        // Get statistics
await limiter.cleanup()          // Clean expired buckets
```

### **RateLimiterSync (Sync)**

```typescript
interface RateLimiterConfig {
  requests?: number;      // Max requests (default: 100)
  window?: number;        // Time window in ms (default: 60000)
  burst?: number;         // Burst allowance (default: 10)
  keyGenerator?: (context: RateLimitContext) => string;
  storage?: SyncStorageBinding;  // Optional sync storage
}

// Core methods (all synchronous)
limiter.check(context)     // Check without consuming
limiter.consume(context)   // Consume if available
limiter.reset(key)         // Reset specific bucket
limiter.stats(key?)        // Get statistics
limiter.cleanup()          // Clean expired buckets
```

## API Reference

### Configuration

```typescript
interface RateLimitResult {
  allowed: boolean;    // Whether request is allowed
  remaining: number;   // Tokens remaining in bucket
  resetTime: number;   // Timestamp when bucket fully resets
  retryAfter?: number; // Milliseconds to wait before retry
  key?: string;        // Generated key for this request
}

interface RateLimitContext {
  clientId?: string;   // Client identifier
  resource?: string;   // Resource being accessed
  key?: string;        // Direct key override
  userId?: string;     // User identifier
  ip?: string;         // IP address
  [key: string]: unknown; // Additional context
}
```

## Advanced Usage Patterns

### **Custom Key Generation**
```typescript
const limiter = RateLimiter.create({
  requests: 100,
  window: 60000,
  keyGenerator: (context) => {
    // Complex key generation logic
    const { clientId, resource, ip } = context;
    return `${clientId}:${resource}:${ip}`;
  }
});
```

### **Hierarchical Rate Limiting**
```typescript
// Global rate limiter
const globalLimiter = RateLimiter.create({
  requests: 10000,
  window: 60000,
  keyGenerator: () => 'global'
});

// Per-user rate limiter
const userLimiter = RateLimiter.create({
  requests: 100,
  window: 60000,
  keyGenerator: (ctx) => `user:${ctx.clientId}`
});

// Check both limits
async function checkRateLimit(context) {
  const globalResult = await globalLimiter.check(context);
  if (!globalResult.allowed) return globalResult;
  
  return await userLimiter.consume(context);
}
```

### **Rate Limiter Composition with Network Unit**
```typescript
import { Network } from '@synet/network';

const network = Network.create({
  rateLimiter: RateLimiter.create({
    requests: 100,
    window: 60000,
    storage: myDistributedStorage
  })
});
```

## Real-World Examples

### **API Gateway Rate Limiting (Async)**

```typescript
import { RateLimiter } from '@synet/rate-limiter';
import { KeyValue } from '@synet/kv';

// Create distributed storage for multi-server rate limiting
const kv = KeyValue.create({ 
  adapter: new RedisAdapter(redisConfig),
  namespace: 'api-gateway' 
});

const storage = {
  async get(key) { return await kv.get(key) || null; },
  async set(key, value) { await kv.set(key, value); },
  async delete(key) { return await kv.delete(key); },
  async exists(key) { return await kv.exists(key); }
};

const apiLimiter = RateLimiter.create({
  requests: 1000,    // 1000 requests
  window: 60000,     // per minute
  burst: 100,        // +100 burst for traffic spikes
  storage,           // Distributed across all servers
  keyGenerator: (ctx) => `${ctx.clientId}:${ctx.endpoint}`
});

async function handleApiRequest(request: Request) {
  const result = await apiLimiter.consume({
    clientId: request.headers['x-client-id'],
    endpoint: request.url.pathname
  });
  
  if (!result.allowed) {
    return new Response('Rate limit exceeded', {
      status: 429,
      headers: {
        'Retry-After': Math.ceil(result.retryAfter! / 1000).toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': new Date(result.resetTime).toISOString()
      }
    });
  }
  
  return await processApiRequest(request);
}
```

### **High-Performance Image Processing (Sync)**
```typescript
import { RateLimiterSync } from '@synet/rate-limiter';

// Protect CPU resources with zero-latency rate limiting
const cpuLimiter = RateLimiterSync.create({
  requests: 5,      // 5 concurrent processes
  window: 1000,     // per second
  burst: 2          // allow 2 extra for priority tasks
});

function processImageBatch(images: Image[], priority = false) {
  const context = { 
    clientId: priority ? 'priority-queue' : 'normal-queue'
  };
  
  const result = cpuLimiter.consume(context);
  
  if (!result.allowed) {
    if (priority) {
      // Priority tasks wait briefly and retry
      setTimeout(() => processImageBatch(images, true), result.retryAfter);
      return;
    } else {
      // Normal tasks get queued
      queueForLater(images);
      return;
    }
  }
  
  // Execute CPU-intensive processing synchronously
  return images.map(img => {
    return resizeAndOptimize(img);  // Sync CPU operation
  });
}
```

### **Network Unit Integration**
```typescript
import { Network } from '@synet/network';
import { RateLimiter } from '@synet/rate-limiter';

// Inject rate limiter into Network unit for automatic protection
const network = Network.create({
  rateLimiter: RateLimiter.create({
    requests: 100,
    window: 60000,
    storage: distributedStorage  // Shared across all services
  })
});

// Network automatically applies rate limiting to all requests
const response = await network.request('https://api.external.com/data', {
  context: { clientId: 'service-worker' }
});
```

## Monitoring & Statistics

```typescript
// Get comprehensive rate limiting statistics
const stats = await limiter.stats();
console.log('Rate Limiter Statistics:', {
  totalRequests: stats.totalRequests,
  allowedRequests: stats.allowedRequests, 
  rejectedRequests: stats.rejectedRequests,
  totalKeys: stats.totalKeys,
  bucketsCreated: stats.bucketsCreated
});

// Monitor specific buckets
const bucketStats = await limiter.stats('user123:/api/data');
console.log('Bucket-specific stats:', bucketStats);

// Administrative operations
await limiter.reset('user123:/api/data');  // Reset specific bucket
await limiter.cleanup();                   // Clean expired buckets
```

## Storage Binding Interface

```typescript
// Implement your own storage backend
interface StorageBinding {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  exists?(key: string): Promise<boolean>;
  clear?(): Promise<void>;
}

// Examples: Redis, DynamoDB, PostgreSQL, etc.
class RedisStorageBinding implements StorageBinding {
  constructor(private redis: RedisClient) {}
  
  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
  }
  
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttl) {
      await this.redis.setex(key, ttl, serialized);
    } else {
      await this.redis.set(key, serialized);
    }
  }
  
  async delete(key: string): Promise<boolean> {
    const result = await this.redis.del(key);
    return result > 0;
  }
}
```

---

## Architecture Benefits

- **Storage-Native**: Direct storage injection, no StateAsync complexity
- **Pure Functions**: Token bucket algorithm with plain objects
- **JSON Compatible**: Perfect serialization for any storage backend  
- **Zero Dependencies**: Pure TypeScript with no external dependencies
- **Unit Architecture**: Teaching contracts and consciousness trinity
- **Flexible**: Sync and async variants for different use cases

---

Built with [Unit Architecture](https://github.com/syntehtism/unit)
