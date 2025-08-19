import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter } from '../src/rate-limiter-async.unit.js';
import type { RateLimitContext, RateLimitResult } from '../src/types.js';

// Mock StorageBinding for testing
interface MockStorageBinding {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  exists?(key: string): Promise<boolean>;
  clear?(): Promise<void>;
}

class MockStorage implements MockStorageBinding {
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
  
  // Test helper
  size(): number {
    return this.data.size;
  }
  
  getData(): Map<string, any> {
    return new Map(this.data);
  }
}

describe('RateLimiter (Async) - Storage-Native Architecture', () => {
  let mockStorage: MockStorage;
  let limiter: RateLimiter;

  beforeEach(() => {
    mockStorage = new MockStorage();
    limiter = RateLimiter.create({
      requests: 5,
      window: 10000, // 10 seconds
      burst: 2,
      storage: mockStorage
    });
  });

  describe('Unit Architecture Compliance', () => {
    it('should create with proper DNA and consciousness trinity', () => {
      expect(limiter.dna.id).toBe('rate-limiter');
      expect(limiter.dna.version).toBe('1.1.0');
      
      // Consciousness trinity
      expect(limiter.capabilities()).toBeDefined();
      expect(limiter.schema()).toBeDefined();
      expect(limiter.validator()).toBeDefined();
    });

    it('should provide teaching contract', () => {
      const contract = limiter.teach();
      expect(contract.unitId).toBe('rate-limiter');
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
      expect(help).toContain('Storage-Native Rate Limiting');
      expect(help).toContain('check(context)');
      expect(help).toContain('consume(context)');
      expect(help).toContain('StorageBinding');
    });

    it('should provide identity information', () => {
      const identity = limiter.whoami();
      expect(identity).toContain('RateLimiter');
      expect(identity).toContain('5req/10000ms');
      expect(identity).toContain('burst=2');
    });
  });

  describe('Storage-Native Token Bucket Operations', () => {
    const context: RateLimitContext = {
      clientId: 'test-user',
      resource: '/api/test'
    };

    it('should create bucket on first access', async () => {
      expect(mockStorage.size()).toBe(0);
      
      const result = await limiter.check(context);
      
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

    it('should consume tokens correctly', async () => {
      // First consume should succeed
      const result1 = await limiter.consume(context);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(6);
      expect(result1.key).toBe('test-user:/api/test');
      
      // Second consume should succeed
      const result2 = await limiter.consume(context);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(5);
    });

    it('should enforce rate limits', async () => {
      // Consume all available tokens (5 + 2 burst = 7)
      for (let i = 0; i < 7; i++) {
        const result = await limiter.consume(context);
        expect(result.allowed).toBe(true);
      }
      
      // Next request should be denied
      const denied = await limiter.consume(context);
      expect(denied.allowed).toBe(false);
      expect(denied.remaining).toBe(0);
      expect(denied.retryAfter).toBeGreaterThan(0);
    });

    it('should check without consuming', async () => {
      // Check should not consume tokens
      const check1 = await limiter.check(context);
      expect(check1.allowed).toBe(true);
      expect(check1.remaining).toBe(7);
      
      const check2 = await limiter.check(context);
      expect(check2.allowed).toBe(true);
      expect(check2.remaining).toBe(7); // Same as before
      
      // Consume should reduce tokens
      const consume = await limiter.consume(context);
      expect(consume.allowed).toBe(true);
      expect(consume.remaining).toBe(6); // Now reduced
    });

    it('should handle custom key generation', async () => {
      const customLimiter = RateLimiter.create({
        requests: 3,
        window: 5000,
        storage: mockStorage,
        keyGenerator: (ctx) => `custom:${ctx.clientId}:${ctx.resource}`
      });
      
      const result = await customLimiter.consume(context);
      expect(result.key).toBe('custom:test-user:/api/test');
    });
  });

  describe('Storage Integration', () => {
    it('should persist bucket data across operations', async () => {
      const context: RateLimitContext = { clientId: 'persist-test' };
      
      // Create bucket
      await limiter.consume(context);
      expect(mockStorage.size()).toBe(1);
      
      // Create new limiter instance with same storage
      const newLimiter = RateLimiter.create({
        requests: 5,
        window: 10000,
        burst: 2,
        storage: mockStorage
      });
      
      // Should use existing bucket
      const result = await newLimiter.check(context);
      expect(result.remaining).toBe(6); // Previously consumed 1 token
    });

    it('should handle storage errors gracefully', async () => {
      const errorStorage = {
        async get() { throw new Error('Storage error'); },
        async set() { throw new Error('Storage error'); },
        async delete() { throw new Error('Storage error'); }
      };
      
      const errorLimiter = RateLimiter.create({
        requests: 5,
        window: 10000,
        storage: errorStorage as any
      });
      
      // Should handle storage errors
      await expect(errorLimiter.check({ clientId: 'test' }))
        .rejects.toThrow('Storage error');
    });

    it('should work with different storage backends', async () => {
      // Test with Map-based storage
      const mapStorage = new MockStorage();
      const mapLimiter = RateLimiter.create({
        requests: 3,
        window: 5000,
        storage: mapStorage
      });
      
      await mapLimiter.consume({ clientId: 'map-test' });
      expect(mapStorage.size()).toBe(1);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide basic statistics', async () => {
      const context: RateLimitContext = { clientId: 'stats-test' };
      
      await limiter.consume(context);
      const stats = await limiter.stats();
      
      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('allowedRequests');
      expect(stats).toHaveProperty('rejectedRequests');
      expect(stats).toHaveProperty('totalKeys');
      expect(stats).toHaveProperty('avgResponseTime');
      expect(stats).toHaveProperty('bucketsCreated');
    });

    it('should provide key-specific statistics', async () => {
      const context: RateLimitContext = { clientId: 'key-stats-test' };
      const key = 'key-stats-test:global';
      
      await limiter.consume(context);
      const keyStats = await limiter.stats(key);
      
      expect(keyStats.totalRequests).toBeGreaterThan(0);
      expect(keyStats.totalKeys).toBe(1);
    });
  });

  describe('Administrative Operations', () => {
    it('should reset specific buckets', async () => {
      const context: RateLimitContext = { clientId: 'reset-test' };
      
      // Consume tokens
      await limiter.consume(context);
      await limiter.consume(context);
      
      let check = await limiter.check(context);
      expect(check.remaining).toBe(5); // 7 - 2
      
      // Reset bucket
      await limiter.reset('reset-test:global');
      
      check = await limiter.check(context);
      expect(check.remaining).toBe(7); // Back to full capacity
    });

    it('should cleanup expired buckets', async () => {
      await limiter.consume({ clientId: 'cleanup-test' });
      expect(mockStorage.size()).toBe(1);
      
      await limiter.cleanup();
      // With mock storage, cleanup clears all
      expect(mockStorage.size()).toBe(0);
    });
  });

  describe('Memory Storage (Default)', () => {
    it('should work with built-in memory storage', async () => {
      const memoryLimiter = RateLimiter.create({
        requests: 3,
        window: 5000,
        burst: 1
      });
      
      const context: RateLimitContext = { clientId: 'memory-test' };
      
      // Should work without external storage
      const result1 = await memoryLimiter.consume(context);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(3); // 3 + 1 burst - 1 consumed
      
      const result2 = await memoryLimiter.consume(context);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid contexts gracefully', async () => {
      // Empty context should work with default key generator
      const result = await limiter.check({});
      expect(result.allowed).toBe(true);
      expect(result.key).toBe('default:global');
    });

    it('should handle sequential high-frequency access', async () => {
      const context: RateLimitContext = { clientId: 'sequential-test' };
      
      // Simulate high-frequency sequential requests 
      const results: RateLimitResult[] = [];
      for (let i = 0; i < 6; i++) {
        const result = await limiter.consume(context);
        results.push(result);
      }
      
      // First 7 should succeed (5 + 2 burst), 6th should have 1 remaining
      expect(results[0].allowed).toBe(true);
      expect(results[0].remaining).toBe(6);
      expect(results[5].allowed).toBe(true);
      expect(results[5].remaining).toBe(1);
      
      // 7th request should succeed with 0 remaining
      const seventhResult = await limiter.consume(context);
      expect(seventhResult.allowed).toBe(true);
      expect(seventhResult.remaining).toBe(0);
      
      // 8th request should be denied
      const eighthResult = await limiter.consume(context);
      expect(eighthResult.allowed).toBe(false);
      expect(eighthResult.remaining).toBe(0);
    });
  });

  describe('Token Bucket Algorithm Verification', () => {
    it('should calculate refill rate correctly', async () => {
      const context: RateLimitContext = { clientId: 'refill-test' };
      
      // Get initial bucket state
      await limiter.check(context);
      const bucketData = mockStorage.getData().values().next().value;
      
      // Verify refill rate calculation
      expect(bucketData.refillRate).toBe(5 / 10000); // 5 requests per 10000ms
    });

    it('should handle time-based refilling', async () => {
      const fastLimiter = RateLimiter.create({
        requests: 2,
        window: 100, // Very short window for testing
        burst: 0,
        storage: mockStorage
      });
      
      const context: RateLimitContext = { clientId: 'time-test' };
      
      // Consume all tokens
      await fastLimiter.consume(context);
      await fastLimiter.consume(context);
      
      // Should be limited
      const limited = await fastLimiter.consume(context);
      expect(limited.allowed).toBe(false);
      
      // Wait for refill (in real test, we'd mock time)
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should have tokens again
      const afterWait = await fastLimiter.check(context);
      expect(afterWait.remaining).toBeGreaterThan(0);
    });
  });
});
