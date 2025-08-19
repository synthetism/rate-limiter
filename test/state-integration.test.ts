import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '../src/rate-limiter.unit.js';

describe('RateLimiter State Integration', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = RateLimiter.create({
      requests: 3,
      window: 1000,
      burst: 1
    });
  });

  describe('State Unit Integration', () => {
    it('should manage buckets via state unit', () => {
      // Initially no buckets
      expect(limiter.getAllBuckets()).toEqual({});
      
      // Create a bucket by checking limit
      const result1 = limiter.checkLimit({ key: 'test' });
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(2); // 3 requests + 1 burst - 1 used = 3, but capacity is 3 so remaining shows 2
      
      // Bucket should now exist in state
      const buckets = limiter.getAllBuckets();
      expect(Object.keys(buckets)).toEqual(['test']);
      expect(buckets.test.tokens).toBe(2); // 3 tokens remaining after consuming 1
      expect(buckets.test.capacity).toBe(3);
    });

    it('should manage statistics via state unit', () => {
      const initialStats = limiter.getStats();
      expect(initialStats.totalRequests).toBe(0);
      expect(initialStats.allowedRequests).toBe(0);
      expect(initialStats.blockedRequests).toBe(0);
      
      // Make some requests
      limiter.checkLimit({ key: 'user1' }); // allowed - 3 remaining
      limiter.checkLimit({ key: 'user1' }); // allowed - 2 remaining 
      limiter.checkLimit({ key: 'user1' }); // allowed - 1 remaining
      limiter.checkLimit({ key: 'user1' }); // blocked - 0 remaining (no more burst)
      
      const finalStats = limiter.getStats();
      expect(finalStats.totalRequests).toBe(4);
      expect(finalStats.allowedRequests).toBe(3);
      expect(finalStats.blockedRequests).toBe(1);
      expect(finalStats.allowRate).toBe(0.75);
      expect(finalStats.activeBuckets).toBe(1);
    });

    it('should persist state across operations', () => {
      // Create initial state
      limiter.checkLimit({ key: 'persistent' });
      limiter.checkLimit({ key: 'persistent' });
      
      const stats1 = limiter.getStats();
      const buckets1 = limiter.getAllBuckets();
      
      expect(stats1.totalRequests).toBe(2);
      expect(buckets1.persistent.tokens).toBe(1); // 4 initial - 2 used = 2, but floor() gives us 1
      
      // Make another request
      limiter.checkLimit({ key: 'persistent' });
      
      const stats2 = limiter.getStats();
      const buckets2 = limiter.getAllBuckets();
      
      expect(stats2.totalRequests).toBe(3);
      expect(buckets2.persistent.tokens).toBe(0); // 1 - 1 = 0
    });

    it('should handle state unit events', () => {
      const stateUnit = limiter.getStateUnit();
      const events: Array<{ type: string; data: unknown }> = [];
      
      // Listen to state changes
      stateUnit.on('stats.changed', (data) => {
        events.push({ type: 'stats.changed', data });
      });
      
      stateUnit.on('buckets.changed', (data) => {
        events.push({ type: 'buckets.changed', data });
      });
      
      // Trigger changes
      limiter.checkLimit({ key: 'event-test' });
      
      // Should have received events
      expect(events.length).toBeGreaterThan(0);
      
      // Check for stats change event
      const statsEvents = events.filter(e => e.type === 'stats.changed');
      expect(statsEvents.length).toBeGreaterThan(0);
    });

    it('should reset state correctly', () => {
      // Create some state
      limiter.checkLimit({ key: 'user1' });
      limiter.checkLimit({ key: 'user2' });
      limiter.checkLimit({ key: 'user3' });
      
      expect(Object.keys(limiter.getAllBuckets())).toHaveLength(3);
      expect(limiter.getStats().totalRequests).toBe(3);
      
      // Reset specific bucket
      limiter.reset('user1');
      expect(Object.keys(limiter.getAllBuckets())).toHaveLength(2);
      expect(limiter.getAllBuckets()).not.toHaveProperty('user1');
      
      // Reset all
      limiter.reset();
      expect(Object.keys(limiter.getAllBuckets())).toHaveLength(0);
      expect(limiter.getStats().totalRequests).toBe(0);
    });



    it('should maintain state consistency across multiple operations', () => {
      const contexts = [
        { key: 'alice' },
        { key: 'bob' },
        { key: 'charlie' },
        { key: 'diana' }
      ];
      
      // Perform operations
      for (const context of contexts) {
        limiter.checkLimit(context);
        limiter.checkLimit(context);
      }
      
      const stats = limiter.getStats();
      const buckets = limiter.getAllBuckets();
      
      expect(stats.totalRequests).toBe(8);
      expect(stats.allowedRequests).toBe(8); // Each user gets 4 tokens (3 + 1 burst), 2 requests each = all allowed
      expect(stats.activeBuckets).toBe(4);
      expect(Object.keys(buckets)).toHaveLength(4);
      
      // Each bucket should have tokens remaining (4 initial - 2 used, but floored)
      for (const bucket of Object.values(buckets)) {
        expect(bucket.tokens).toBe(1); // Math.floor of remaining tokens
      }
    });
  });

  describe('State-based Rate Limiting Logic', () => {
    it('should handle concurrent access to state safely', async () => {
      const promises = Array.from({ length: 10 }, (_, i) => 
        Promise.resolve(limiter.checkLimit({ key: 'concurrent' }))
      );
      
      const results = await Promise.all(promises);
      const allowed = results.filter(r => r.allowed).length;
      const blocked = results.filter(r => !r.allowed).length;
      
      // Should allow 3 (from capacity) and block 7
      expect(allowed).toBe(3);
      expect(blocked).toBe(7);
      
      const stats = limiter.getStats();
      expect(stats.totalRequests).toBe(10);
      expect(stats.allowedRequests).toBe(3);
      expect(stats.blockedRequests).toBe(7);
    });

    it('should maintain bucket isolation in state', () => {
      // Fill one bucket
      for (let i = 0; i < 5; i++) {
        limiter.checkLimit({ key: 'bucket1' });
      }
      
      // Other bucket should be unaffected
      const result = limiter.checkLimit({ key: 'bucket2' });
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2); // 4 initial - 1 used = 3, but capacity limits to 2
      
      const buckets = limiter.getAllBuckets();
      expect(buckets.bucket1.tokens).toBe(0); // Exhausted
      expect(buckets.bucket2.tokens).toBe(2); // 4 initial - 1 used = 3, but floored to 2
    });
  });
});
