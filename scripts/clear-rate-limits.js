#!/usr/bin/env node

/**
 * Script to clear rate limits from Redis
 * 
 * Usage:
 *   node scripts/clear-rate-limits.js                    # Clear all rate limits
 *   node scripts/clear-rate-limits.js --ip 1.2.3.4       # Clear rate limits for specific IP
 *   node scripts/clear-rate-limits.js --list             # List all rate limit keys
 *   node scripts/clear-rate-limits.js --pattern "rl:*"   # Clear keys matching pattern
 */

const { createRedisClient } = require('../server/utils/redisStore');
const { logger } = require('../server/middleware/logger');

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  // Parse arguments
  const ipIndex = args.indexOf('--ip');
  const listIndex = args.indexOf('--list');
  const patternIndex = args.indexOf('--pattern');
  
  const ip = ipIndex !== -1 && args[ipIndex + 1] ? args[ipIndex + 1] : null;
  const list = listIndex !== -1;
  const pattern = patternIndex !== -1 && args[patternIndex + 1] ? args[patternIndex + 1] : null;
  
  // Create Redis client
  const redisClient = createRedisClient();
  
  if (!redisClient) {
    console.error('❌ Redis client not available. Make sure REDIS_URL is set in your environment.');
    console.error('   If using in-memory rate limiting, rate limits will reset when the server restarts.');
    process.exit(1);
  }
  
  try {
    // Wait for Redis to be ready
    if (redisClient.status !== 'ready') {
      console.log('⏳ Waiting for Redis connection...');
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Redis connection timeout'));
        }, 5000);
        
        if (redisClient.status === 'ready') {
          clearTimeout(timeout);
          resolve();
          return;
        }
        
        redisClient.once('ready', () => {
          clearTimeout(timeout);
          resolve();
        });
        
        redisClient.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    }
    
    console.log('✅ Connected to Redis\n');
    
    // List rate limit keys
    if (list) {
      const searchPattern = pattern || 'rl:*';
      console.log(`📋 Listing rate limit keys matching: ${searchPattern}\n`);
      
      const keys = await redisClient.keys(searchPattern);
      
      if (keys.length === 0) {
        console.log('   No rate limit keys found.\n');
      } else {
        console.log(`   Found ${keys.length} rate limit key(s):\n`);
        
        for (const key of keys) {
          const value = await redisClient.get(key);
          const ttl = await redisClient.ttl(key);
          const ttlMinutes = Math.ceil(ttl / 60);
          
          console.log(`   • ${key}`);
          console.log(`     Hits: ${value || 0}`);
          console.log(`     TTL: ${ttl} seconds (${ttlMinutes} minutes)\n`);
        }
      }
      
      await redisClient.quit();
      return;
    }
    
    // Clear rate limits
    let keysToDelete = [];
    
    if (ip) {
      // Clear rate limits for specific IP
      // express-rate-limit typically uses format like: rl:auth:1.2.3.4 or rl:api:1.2.3.4
      const ipPatterns = [
        `rl:auth:${ip}`,
        `rl:api:${ip}`,
        `rl:${ip}`,
        `rl:*:${ip}`
      ];
      
      console.log(`🔍 Searching for rate limit keys for IP: ${ip}\n`);
      
      for (const pattern of ipPatterns) {
        const keys = await redisClient.keys(pattern);
        keysToDelete.push(...keys);
      }
      
      if (keysToDelete.length === 0) {
        console.log(`   No rate limit keys found for IP: ${ip}\n`);
        await redisClient.quit();
        return;
      }
      
      console.log(`   Found ${keysToDelete.length} key(s) to delete:\n`);
      keysToDelete.forEach(key => console.log(`   • ${key}`));
      console.log();
    } else if (pattern) {
      // Clear keys matching pattern
      console.log(`🔍 Searching for keys matching pattern: ${pattern}\n`);
      keysToDelete = await redisClient.keys(pattern);
      
      if (keysToDelete.length === 0) {
        console.log(`   No keys found matching pattern: ${pattern}\n`);
        await redisClient.quit();
        return;
      }
      
      console.log(`   Found ${keysToDelete.length} key(s) to delete:\n`);
      keysToDelete.forEach(key => console.log(`   • ${key}`));
      console.log();
    } else {
      // Clear all rate limit keys
      console.log('🔍 Searching for all rate limit keys...\n');
      keysToDelete = await redisClient.keys('rl:*');
      
      if (keysToDelete.length === 0) {
        console.log('   No rate limit keys found.\n');
        await redisClient.quit();
        return;
      }
      
      console.log(`   Found ${keysToDelete.length} rate limit key(s) to delete.\n`);
    }
    
    // Delete keys
    if (keysToDelete.length > 0) {
      const deleted = await redisClient.del(...keysToDelete);
      console.log(`✅ Deleted ${deleted} rate limit key(s).\n`);
    }
    
    await redisClient.quit();
    console.log('✅ Done!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    logger.error('Error clearing rate limits', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Run script
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
