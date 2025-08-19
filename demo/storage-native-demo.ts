#!/usr/bin/env tsx
/**
 * Storage-Native Rate Limiter Demo
 * 
 * NEW ARCHITECTURE: Direct StorageBinding injection!
 * 1. @synet/kv KeyValue unit with MemoryAdapter
 * 2. Create StorageBinding from real KV unit  
 * 3. Inject StorageBinding DIRECTLY into RateLimiter
 * 
 * No StateAsync complexity - pure storage-native design!
 */

import { RateLimiter } from '../src/rate-limiter-async.unit.js';
import { KeyValue, MemoryAdapter } from '@synet/kv';


// StorageBinding interface that RateLimiter expects
interface StorageBinding {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  exists?(key: string): Promise<boolean>;
  clear?(): Promise<void>;
}

// Adapter to convert KV unit to StorageBinding
class KVStorageBinding implements StorageBinding {
  constructor(private kv: any) {}

  async get<T>(key: string): Promise<T | null> {
    const result = await this.kv.get(key);
    return result || null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.kv.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return await this.kv.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return await this.kv.exists(key);
  }

  async clear(): Promise<void> {
    if (this.kv.clear) {
      await this.kv.clear();
    }
  }
}

async function demo() {
  console.log('🚀 STORAGE-NATIVE RATE LIMITER - Direct KV Injection');
  console.log('=====================================================');
  console.log();

  // 1. Create real KV unit with memory adapter
  console.log('1️⃣ Creating KeyValue unit with MemoryAdapter...');
  const adapter = new MemoryAdapter();
  const kv = KeyValue.create({ 
    adapter,
    namespace: 'rate-limiter' 
  });
  
  // 2. Create StorageBinding from KV unit
  console.log('2️⃣ Creating StorageBinding from KV unit...');
  const storage = new KVStorageBinding(kv);
  
  // 3. Create RateLimiter with DIRECT storage injection
  console.log('3️⃣ Creating RateLimiter with direct storage injection...');
  const limiter = RateLimiter.create({
    requests: 5,    // 5 requests
    window: 10000,  // per 10 seconds
    burst: 2,       // +2 burst
    storage         // Direct injection!
  });

  console.log('✅ Storage-native RateLimiter created!');
  console.log(`   Configuration: ${limiter.whoami()}`);
  console.log();

  // 4. Test rate limiting with real storage
  console.log('4️⃣ Testing rate limiting with distributed storage...');
  
  const testContext = {
    clientId: 'user123',
    resource: '/api/data'
  };

  // Rapid-fire requests to test rate limiting
  for (let i = 1; i <= 10; i++) {
    const result = await limiter.consume(testContext);
    
    console.log(`Request ${i}: ${result.allowed ? '✅ ALLOWED' : '❌ DENIED'} (${result.remaining} remaining)`);
    
    if (!result.allowed && result.retryAfter) {
      console.log(`   → Retry after ${result.retryAfter}ms`);
    }
  }

  console.log();

  // 5. Verify data persisted in storage
  console.log('5️⃣ Verifying bucket data persisted in storage...');
  const bucketKey = 'user123:/api/data';
  const bucketData = await storage.get(bucketKey);
  console.log('Raw bucket data in storage:', JSON.stringify(bucketData, null, 2));

  console.log();

  // 6. Test stats
  console.log('6️⃣ Getting rate limit statistics...');
  const stats = await limiter.stats(bucketKey);
  console.log('Stats:', JSON.stringify(stats, null, 2));

  console.log();

  // 7. Reset and test again
  console.log('7️⃣ Resetting bucket and testing again...');
  await limiter.reset(bucketKey);
  
  const afterReset = await limiter.check(testContext);
  console.log(`After reset: ${afterReset.allowed ? '✅ ALLOWED' : '❌ DENIED'} (${afterReset.remaining} remaining)`);

  console.log();
  console.log('🎉 Demo completed! Architecture:');
  console.log('   RateLimiter → StorageBinding → KV → MemoryAdapter');
  console.log('   ✓ No StateAsync complexity');
  console.log('   ✓ Direct storage injection');
  console.log('   ✓ Storage-native BucketData objects');
  console.log('   ✓ Pure function token bucket algorithm');
  
  // Explicitly exit
  process.exit(0);
}

// Run the demo
demo().catch((error) => {
  console.error('Demo failed:', error);
  process.exit(1);
});
