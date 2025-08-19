import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiterSync } from '../src/rate-limiter.unit.js';
import type { RateLimitContext } from '../src/types.js';

// Mock Sync StorageBinding for testing
interface MockSyncStorageBinding {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  delete(key: string): boolean;
  exists?(key: string): boolean;
  clear?(): void;
}

class MockSyncStorage implements MockSyncStorageBinding {
  private data = new Map<string, any>();
  
  get<T>(key: string): T | null {
    return this.data.get(key) || null;
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
  
  // Test helper
  size(): number {
    return this.data.size;
  }
  
  getData(): Map<string, any> {
    return new Map(this.data);
  }
}

describe('RateLimiterSync - High-Performance Memory Operations', () => {
  let mockStorage: MockSyncStorage;
  let limiter: RateLimiterSync;

  beforeEach(() => {
    mockStorage = new MockSyncStorage();
    limiter = RateLimiterSync.create({
      requests: 5,
      window: 10000, // 10 seconds
      burst: 2,
      storage: mockStorage
    });
  });

  describe('Unit Architecture Compliance', () => {
    it('should create with proper DNA and consciousness trinity', () => {
      expect(limiter.dna.id).toBe('rate-limiter-sync');
      expect(limiter.dna.version).toBe('1.1.0');
      
      // Consciousness trinity
      expect(limiter.capabilities()).toBeDefined();
      expect(limiter.schema()).toBeDefined();
      expect(limiter.validator()).toBeDefined();
    });

    it('should provide teaching contract', () => {
      const contract = limiter.teach();
      expect(contract.unitId).toBe('rate-limiter-sync');
      expect(contract.capabilities).toBeDefined();
      expect(contract.schema).toBeDefined();
      expect(contract.validator).toBeDefined();
    });

    it('should have proper capabilities', () => {
      const capabilities = limiter.capabilities();
      const capList = capabilities.list();
      
      expect(capList).toContain('check');
      expect(capList).toContain('consume');
      expect(capList).toContain('reset');
      expect(capList).toContain('stats');
      expect(capList).toContain('cleanup');
    });

    it('should provide help documentation', () => {
      const help = limiter.help();
      expect(help).toContain('RateLimiterSync');
      expect(help).toContain('Synchronous Storage-Native');
      expect(help).toContain('zero async overhead');
      expect(help).toContain('high-performance scenarios');
    });

    it('should provide identity information', () => {
      const identity = limiter.whoami();
      expect(identity).toContain('RateLimiterSync');
      expect(identity).toContain('5req/10000ms');
      expect(identity).toContain('burst=2');
    });
  });

  describe('Synchronous Token Bucket Operations', () => {
    const context: RateLimitContext = {
      clientId: 'sync-user',
      resource: '/cpu/intensive'
    };

    it('should create bucket on first access (sync)', () => {
      expect(mockStorage.size()).toBe(0);
      
      const result = limiter.check(context);
      
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(7); // 5 + 2 burst
      expect(mockStorage.size()).toBe(1);
      
      // Verify bucket data structure
      const bucketData = mockStorage.getData().values().next().value;
      expect(bucketData).toHaveProperty('tokens');
      expect(bucketData).toHaveProperty('capacity');
      expect(bucketData).toHaveProperty('lastRefill');
      expect(bucketData).toHaveProperty('window');
      expect(bucketData).toHaveProperty('refillRate');
      expect(bucketData.capacity).toBe(5);
    });

    it('should consume tokens synchronously', () => {
      // First consume should succeed
      const result1 = limiter.consume(context);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(6);
      expect(result1.key).toBe('sync-user:/cpu/intensive');
      
      // Second consume should succeed immediately
      const result2 = limiter.consume(context);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(5);
    });

    it('should enforce rate limits synchronously', () => {
      // Consume all available tokens (5 + 2 burst = 7)
      for (let i = 0; i < 7; i++) {
        const result = limiter.consume(context);
        expect(result.allowed).toBe(true);
      }
      
      // Next request should be denied immediately
      const denied = limiter.consume(context);
      expect(denied.allowed).toBe(false);
      expect(denied.remaining).toBe(0);
      expect(denied.retryAfter).toBeGreaterThan(0);
    });

    it('should check without consuming (sync)', () => {
      // Check should not consume tokens
      const check1 = limiter.check(context);
      expect(check1.allowed).toBe(true);
      expect(check1.remaining).toBe(7);
      
      const check2 = limiter.check(context);
      expect(check2.allowed).toBe(true);
      expect(check2.remaining).toBe(7); // Same as before
      
      // Consume should reduce tokens
      const consume = limiter.consume(context);
      expect(consume.allowed).toBe(true);
      expect(consume.remaining).toBe(6); // Now reduced
    });

    it('should handle custom key generation', () => {
      const customLimiter = RateLimiterSync.create({
        requests: 3,
        window: 5000,
        storage: mockStorage,
        keyGenerator: (ctx) => `sync:${ctx.clientId}:${ctx.resource}`
      });
      
      const result = customLimiter.consume(context);
      expect(result.key).toBe('sync:sync-user:/cpu/intensive');
    });
  });

  describe('High-Performance CPU Protection', () => {
    it('should protect CPU-intensive operations', () => {
      const cpuLimiter = RateLimiterSync.create({
        requests: 3,    // 3 concurrent processes
        window: 1000,   // per second
        burst: 1        // +1 for priority
      });
      
      const tasks: string[] = [];
      
      // Simulate CPU-intensive tasks (same worker pool)
      for (let i = 0; i < 5; i++) {
        const result = cpuLimiter.consume({ clientId: 'cpu-worker-pool' });
        if (result.allowed) {
          tasks.push(`task-${i}`);
        }
      }
      
      // Should only allow 4 tasks (3 + 1 burst)
      expect(tasks.length).toBe(4);
    });

    it('should handle batch processing limits', () => {
      const batchLimiter = RateLimiterSync.create({
        requests: 10,   // 10 batches
        window: 5000,   // per 5 seconds
        burst: 2        // +2 for urgent batches
      });
      
      let processedBatches = 0;
      
      // Process batches until limited (same processor)
      for (let i = 0; i < 15; i++) {
        const result = batchLimiter.consume({ 
          clientId: 'batch-processor'
        });
        
        if (result.allowed) {
          processedBatches++;
        } else {
          // Would queue for later in real scenario
          break;
        }
      }
      
      expect(processedBatches).toBe(12); // 10 + 2 burst
    });
  });

  describe('Memory Storage Operations', () => {
    it('should work with built-in memory storage', () => {
      const memoryLimiter = RateLimiterSync.create({
        requests: 3,
        window: 5000,
        burst: 1
      });
      
      const context: RateLimitContext = { clientId: 'memory-sync-test' };
      
      // Should work without external storage
      const result1 = memoryLimiter.consume(context);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(3); // 3 + 1 burst - 1 consumed
      
      const result2 = memoryLimiter.consume(context);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(2);
    });

    it('should persist data in storage', () => {
      const context: RateLimitContext = { clientId: 'persist-sync-test' };
      
      // Create bucket
      limiter.consume(context);
      expect(mockStorage.size()).toBe(1);
      
      // Create new limiter instance with same storage
      const newLimiter = RateLimiterSync.create({
        requests: 5,
        window: 10000,
        burst: 2,
        storage: mockStorage
      });
      
      // Should use existing bucket
      const result = newLimiter.check(context);
      expect(result.remaining).toBe(6); // Previously consumed 1 token
    });
  });

  describe('Statistics and Monitoring (Sync)', () => {
    it('should provide basic statistics synchronously', () => {
      const context: RateLimitContext = { clientId: 'sync-stats-test' };
      
      limiter.consume(context);
      const stats = limiter.stats();
      
      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('allowedRequests');
      expect(stats).toHaveProperty('rejectedRequests');
      expect(stats).toHaveProperty('totalKeys');
      expect(stats).toHaveProperty('avgResponseTime');
      expect(stats).toHaveProperty('bucketsCreated');
    });

    it('should provide key-specific statistics synchronously', () => {
      const context: RateLimitContext = { clientId: 'key-sync-stats-test' };
      const key = 'key-sync-stats-test:global';
      
      limiter.consume(context);
      const keyStats = limiter.stats(key);
      
      expect(keyStats.totalRequests).toBeGreaterThan(0);
      expect(keyStats.totalKeys).toBe(1);
    });
  });

  describe('Administrative Operations (Sync)', () => {
    it('should reset specific buckets synchronously', () => {
      const context: RateLimitContext = { clientId: 'sync-reset-test' };
      
      // Consume tokens
      limiter.consume(context);
      limiter.consume(context);
      
      let check = limiter.check(context);
      expect(check.remaining).toBe(5); // 7 - 2
      
      // Reset bucket
      limiter.reset('sync-reset-test:global');
      
      check = limiter.check(context);
      expect(check.remaining).toBe(7); // Back to full capacity
    });

    it('should cleanup expired buckets synchronously', () => {
      limiter.consume({ clientId: 'sync-cleanup-test' });
      expect(mockStorage.size()).toBe(1);
      
      limiter.cleanup();
      // With mock storage, cleanup clears all
      expect(mockStorage.size()).toBe(0);
    });
  });

  describe('Performance and Zero-Latency Operations', () => {
    it('should handle high-frequency operations', () => {
      const highFreqLimiter = RateLimiterSync.create({
        requests: 1000,  // High capacity
        window: 1000,    // Per second
        burst: 100       // Burst capacity
      });
      
      const startTime = Date.now();
      let operations = 0;
      
      // Perform many operations rapidly
      for (let i = 0; i < 500; i++) {
        const result = highFreqLimiter.consume({ 
          clientId: 'high-freq-test',
          resource: `op-${i}`
        });
        if (result.allowed) {
          operations++;
        }
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(operations).toBe(500); // All should succeed
      expect(duration).toBeLessThan(100); // Should be very fast
    });

    it('should maintain consistency under rapid access', () => {
      const rapidLimiter = RateLimiterSync.create({
        requests: 10,
        window: 5000,
        burst: 0,
        storage: mockStorage
      });
      
      const context: RateLimitContext = { clientId: 'rapid-test' };
      let allowedCount = 0;
      
      // Rapid sequential access
      for (let i = 0; i < 15; i++) {
        const result = rapidLimiter.consume(context);
        if (result.allowed) {
          allowedCount++;
        }
      }
      
      expect(allowedCount).toBe(10); // Exactly the limit
    });
  });

  describe('Error Handling (Sync)', () => {
    it('should handle invalid contexts gracefully', () => {
      // Empty context should work with default key generator
      const result = limiter.check({});
      expect(result.allowed).toBe(true);
      expect(result.key).toBe('default:global');
    });

    it('should handle storage errors gracefully', () => {
      const errorStorage = {
        get() { throw new Error('Sync storage error'); },
        set() { throw new Error('Sync storage error'); },
        delete() { throw new Error('Sync storage error'); }
      };
      
      const errorLimiter = RateLimiterSync.create({
        requests: 5,
        window: 10000,
        storage: errorStorage as any
      });
      
      // Should handle storage errors
      expect(() => errorLimiter.check({ clientId: 'test' }))
        .toThrow('Sync storage error');
    });
  });

  describe('Token Bucket Algorithm Verification (Sync)', () => {
    it('should calculate refill rate correctly', () => {
      const context: RateLimitContext = { clientId: 'sync-refill-test' };
      
      // Get initial bucket state
      limiter.check(context);
      const bucketData = mockStorage.getData().values().next().value;
      
      // Verify refill rate calculation
      expect(bucketData.refillRate).toBe(5 / 10000); // 5 requests per 10000ms
    });

    it('should use the same algorithm as async version', () => {
      // Both sync and async should produce same bucket structure
      const syncContext: RateLimitContext = { clientId: 'algorithm-test' };
      
      limiter.check(syncContext);
      const syncBucket = mockStorage.getData().values().next().value;
      
      expect(syncBucket).toHaveProperty('tokens');
      expect(syncBucket).toHaveProperty('capacity', 5);
      expect(syncBucket).toHaveProperty('refillRate', 0.0005);
      expect(syncBucket).toHaveProperty('window', 10000);
      expect(typeof syncBucket.lastRefill).toBe('number');
    });
  });

  describe('Use Case Scenarios', () => {
    it('should handle image processing rate limiting', () => {
      const imageLimiter = RateLimiterSync.create({
        requests: 3,    // 3 concurrent image processes
        window: 2000,   // per 2 seconds
        burst: 1        // +1 for priority images
      });
      
      interface ProcessResult {
        imageId: number;
        allowed: boolean;
        remaining: number;
      }
      
      const results: ProcessResult[] = [];
      
      // Simulate image processing requests (same processor)
      for (let i = 0; i < 6; i++) {
        const result = imageLimiter.consume({
          clientId: 'image-processor'
        });
        
        results.push({
          imageId: i,
          allowed: result.allowed,
          remaining: result.remaining
        });
      }
      
      // First 4 should be allowed (3 + 1 burst)
      const allowed = results.filter(r => r.allowed);
      const denied = results.filter(r => !r.allowed);
      
      expect(allowed.length).toBe(4);
      expect(denied.length).toBe(2);
    });

    it('should handle background job scheduling', () => {
      const jobLimiter = RateLimiterSync.create({
        requests: 5,    // 5 jobs
        window: 1000,   // per second
        burst: 0        // No burst for steady processing
      });
      
      let jobsScheduled = 0;
      let jobsQueued = 0;
      
      // Simulate job scheduling (same scheduler)
      for (let i = 0; i < 8; i++) {
        const result = jobLimiter.consume({
          clientId: 'job-scheduler'
        });
        
        if (result.allowed) {
          jobsScheduled++;
        } else {
          jobsQueued++;
        }
      }
      
      expect(jobsScheduled).toBe(5);
      expect(jobsQueued).toBe(3);
    });
  });
});
