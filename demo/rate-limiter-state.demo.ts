import { RateLimiter, type RateLimitContext } from '../src/rate-limiter.unit.js';

// === 🚦 RATE LIMITER WITH STATE DEMO ===

console.log('🚦 Rate Limiter Unit Demo - Conscious State Management');
console.log('='.repeat(60));

// Create rate limiter with custom config
const limiter = RateLimiter.create({
  requests: 5,      // 5 requests
  window: 10000,    // per 10 seconds
  burst: 2,         // plus 2 burst allowance
  keyGenerator: (context: RateLimitContext) => {
    // Custom key generation logic
    if (context.userId) return `user:${context.userId}`;
    if (context.ip) return `ip:${context.ip}`;
    return context.key || 'default';
  }
});

console.log('\n🧬 Unit Identity:');
console.log(limiter.whoami());

console.log('\n📊 Initial State:');
console.log('Stats:', limiter.getStats());
console.log('Buckets:', limiter.getAllBuckets());

// === DEMO 1: Basic Rate Limiting ===
console.log('\n🎯 DEMO 1: Basic Rate Limiting');
console.log('-'.repeat(40));

async function testBasicLimiting() {
  console.log('\nTesting user "alice" with 7 rapid requests...');
  
  for (let i = 1; i <= 7; i++) {
    const result = limiter.checkLimit({ userId: 'alice' });
    console.log(`Request ${i}: ${result.allowed ? '✅ ALLOWED' : '❌ BLOCKED'} - Remaining: ${result.remaining}`);
    
    if (!result.allowed && result.retryAfter) {
      console.log(`  💤 Retry after: ${result.retryAfter}ms`);
    }
  }
}

await testBasicLimiting();

console.log('\n📊 Stats after basic limiting:');
console.log(limiter.getStats());

// === DEMO 2: Multi-User Rate Limiting ===
console.log('\n🎯 DEMO 2: Multi-User Rate Limiting');
console.log('-'.repeat(40));

async function testMultiUser() {
  console.log('\nTesting multiple users and IPs...');
  
  const users = ['bob', 'charlie', 'diana'];
  const ips = ['192.168.1.1', '192.168.1.2'];
  
  // Test each user
  for (const userId of users) {
    const result = limiter.checkLimit({ userId });
    console.log(`User ${userId}: ${result.allowed ? '✅ ALLOWED' : '❌ BLOCKED'} - Remaining: ${result.remaining}`);
  }
  
  // Test each IP
  for (const ip of ips) {
    const result = limiter.checkLimit({ ip });
    console.log(`IP ${ip}: ${result.allowed ? '✅ ALLOWED' : '❌ BLOCKED'} - Remaining: ${result.remaining}`);
  }
}

await testMultiUser();

console.log('\n📊 Bucket details:');
const buckets = limiter.getAllBuckets();
for (const [key, info] of Object.entries(buckets)) {
  console.log(`${key}: ${info.tokens}/${info.capacity} tokens, last refill: ${new Date(info.lastRefill).toISOString()}`);
}

// === DEMO 3: Async Operations with Rate Limiting ===
console.log('\n🎯 DEMO 3: Async Operations with Rate Limiting');
console.log('-'.repeat(40));

async function simulateApiCall(userId: string, operation: string): Promise<string> {
  // Simulate API work
  await new Promise(resolve => setTimeout(resolve, 50));
  return `${operation} completed for ${userId}`;
}

async function testAsyncLimiting() {
  console.log('\nTesting async operations with rate limiting...');
  
  try {
    // This should work (user eve is new)
    const result1 = await limiter.limit(
      () => simulateApiCall('eve', 'GET /profile'),
      { userId: 'eve' }
    );
    console.log('✅ Success:', result1);
    
    // Exhaust eve's quota
    for (let i = 0; i < 6; i++) {
      try {
        await limiter.limit(
          () => simulateApiCall('eve', `Operation ${i + 1}`),
          { userId: 'eve' }
        );
        console.log(`✅ Operation ${i + 1} succeeded`);
      } catch (error) {
        console.log(`❌ Operation ${i + 1} failed:`, error.message);
        break;
      }
    }
    
  } catch (error) {
    console.log('❌ Async operation failed:', error.message);
  }
}

await testAsyncLimiting();

// === DEMO 4: Retry with Backoff ===
console.log('\n🎯 DEMO 4: Automatic Retry with Backoff');
console.log('-'.repeat(40));

async function testRetryLogic() {
  console.log('\nTesting automatic retry logic...');
  
  // Frank will be rate limited but retries should eventually succeed
  try {
    console.log('Attempting operation with retry for rate-limited user...');
    const startTime = Date.now();
    
    const result = await limiter.limitWithRetry(
      () => simulateApiCall('frank', 'POST /data'),
      { userId: 'frank' },
      2 // max 2 retries
    );
    
    const duration = Date.now() - startTime;
    console.log(`✅ Success after ${duration}ms:`, result);
    
  } catch (error) {
    console.log('❌ Retry failed:', error.message);
  }
}

await testRetryLogic();

// === DEMO 5: State Monitoring & Reset ===
console.log('\n🎯 DEMO 5: State Monitoring & Reset');
console.log('-'.repeat(40));

console.log('\nFinal statistics:');
const finalStats = limiter.getStats();
console.log(`Total Requests: ${finalStats.totalRequests}`);
console.log(`Allowed: ${finalStats.allowedRequests} (${(finalStats.allowRate * 100).toFixed(1)}%)`);
console.log(`Blocked: ${finalStats.blockedRequests}`);
console.log(`Active Buckets: ${finalStats.activeBuckets}`);

console.log('\nResetting specific user bucket...');
limiter.reset('user:alice');
console.log('Alice bucket reset. New buckets:', Object.keys(limiter.getAllBuckets()));

console.log('\nTesting alice again after reset...');
const aliceResult = limiter.checkLimit({ userId: 'alice' });
console.log(`Alice: ${aliceResult.allowed ? '✅ ALLOWED' : '❌ BLOCKED'} - Remaining: ${aliceResult.remaining}`);

// === DEMO 6: Conscious State Integration ===
console.log('\n🎯 DEMO 6: Conscious State Integration');
console.log('-'.repeat(40));

console.log('\nDemonstrating state unit integration...');

// Access the underlying state unit properly
const stateUnit = limiter.getStateUnit();

console.log('State unit identity:', stateUnit.whoami());
console.log('State keys:', Object.keys(stateUnit.getAll()));

// Listen to state changes
stateUnit.on('stats.changed', (data) => {
  console.log('📊 Stats changed:', data);
});

// Trigger a change to see the event
console.log('\nTriggering operation to see state change event...');
limiter.checkLimit({ userId: 'state-demo' });

console.log('\n✨ Rate Limiter Demo Complete!');
console.log('\n💡 Key Features Demonstrated:');
console.log('• Token bucket algorithm with burst allowance');
console.log('• Multi-user/IP rate limiting with custom key generation');
console.log('• Async operation rate limiting with proper error handling');
console.log('• Automatic retry with exponential backoff');
console.log('• Comprehensive statistics and monitoring');
console.log('• Conscious state management via @synet/state integration');
console.log('• Event-driven state change notifications');
console.log('• Selective bucket reset and management');

console.log('\n🎯 Unit Architecture Patterns:');
console.log('• Conscious composition with State unit');
console.log('• Teaching contract for capability sharing');
console.log('• 80/20 principle - simple API, powerful features');
console.log('• Props-based immutable configuration');
console.log('• Event-driven state change awareness');
