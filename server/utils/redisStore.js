/**
 * Redis Store for Rate Limiting
 * Provides shared rate limiting across multiple server instances
 */

const { logger } = require('../middleware/logger');

class RedisStore {
  constructor(redisClient, prefix = 'rl:') {
    this.client = redisClient;
    this.prefix = prefix;
    this.isConnected = false;
  }

  /**
   * Initialize Redis connection
   */
  async connect() {
    if (!this.client) {
      logger.warn('Redis client not provided, rate limiting will use in-memory store');
      return false;
    }

    try {
      if (this.client.status === 'ready') {
        this.isConnected = true;
        logger.info('Redis store connected (already ready)');
        return true;
      }

      // For ioredis, wait for ready event
      if (this.client.on) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Redis connection timeout'));
          }, 5000);

          if (this.client.status === 'ready') {
            clearTimeout(timeout);
            resolve();
            return;
          }

          this.client.once('ready', () => {
            clearTimeout(timeout);
            resolve();
          });

          this.client.once('error', (err) => {
            clearTimeout(timeout);
            reject(err);
          });
        });
      }

      this.isConnected = true;
      logger.info('Redis store connected successfully');
      return true;
    } catch (error) {
      logger.warn('Redis store connection failed, falling back to in-memory store', {
        error: error.message
      });
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Increment counter for a key
   * express-rate-limit v8 uses Promise-based store interface
   * @param {string} key - Rate limit key
   * @returns {Promise<{totalHits: number, resetTime: Date}>}
   */
  async increment(key) {
    if (!this.isConnected || !this.client) {
      // Fallback: return a value that won't trigger rate limit
      return { totalHits: 0, resetTime: new Date(Date.now() + 60000) };
    }

    try {
      const fullKey = `${this.prefix}${key}`;
      const now = Date.now();
      
      // Use Redis pipeline for atomic operations
      const multi = this.client.multi();
      multi.incr(fullKey);
      multi.pexpire(fullKey, 900000); // 15 minutes default window
      
      const results = await multi.exec();
      const totalHits = results && results[0] && results[0][1] ? results[0][1] : 0;
      
      // Get TTL to calculate reset time
      const ttl = await this.client.pttl(fullKey);
      const resetTime = new Date(now + (ttl > 0 ? ttl : 900000));

      return { totalHits, resetTime };
    } catch (error) {
      logger.warn('Redis increment failed, falling back', { error: error.message });
      return { totalHits: 0, resetTime: new Date(Date.now() + 60000) };
    }
  }

  /**
   * Decrement counter for a key (optional, for cleanup)
   */
  async decrement(key) {
    if (!this.isConnected || !this.client) {
      return;
    }

    try {
      const fullKey = `${this.prefix}${key}`;
      await this.client.decr(fullKey);
    } catch (error) {
      logger.warn('Redis decrement failed', { error: error.message });
    }
  }

  /**
   * Reset counter for a key
   */
  async resetKey(key) {
    if (!this.isConnected || !this.client) {
      return;
    }

    try {
      const fullKey = `${this.prefix}${key}`;
      await this.client.del(fullKey);
    } catch (error) {
      logger.warn('Redis resetKey failed', { error: error.message });
    }
  }

  /**
   * Shutdown Redis connection
   */
  async shutdown() {
    if (this.client && this.client.quit) {
      try {
        await this.client.quit();
        this.isConnected = false;
        logger.info('Redis store disconnected');
      } catch (error) {
        logger.warn('Error disconnecting Redis store', { error: error.message });
      }
    }
  }
}

/**
 * Create Redis client if REDIS_URL is configured
 * @returns {Object|null} Redis client or null
 */
function createRedisClient() {
  const redisUrl = process.env.REDIS_URL;
  
  if (!redisUrl) {
    logger.info('REDIS_URL not configured, rate limiting will use in-memory store');
    return null;
  }

  try {
    const Redis = require('ioredis');
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          logger.error('Redis connection failed after 3 retries');
          return null; // Stop retrying
        }
        return Math.min(times * 200, 2000);
      },
      enableReadyCheck: true,
      enableOfflineQueue: false, // Don't queue commands when offline
      lazyConnect: false
    });

    client.on('error', (err) => {
      logger.warn('Redis client error', { error: err.message });
    });

    client.on('connect', () => {
      logger.info('Redis client connecting...');
    });

    client.on('ready', () => {
      logger.info('Redis client ready');
    });

    client.on('close', () => {
      logger.warn('Redis client connection closed');
    });

    return client;
  } catch (error) {
    logger.warn('Failed to create Redis client, rate limiting will use in-memory store', {
      error: error.message
    });
    return null;
  }
}

module.exports = {
  RedisStore,
  createRedisClient
};

