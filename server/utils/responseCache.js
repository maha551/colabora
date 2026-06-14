/**
 * Optional response cache: Redis-backed when REDIS_URL is set, otherwise in-memory BoundedCache.
 * Used for hot read endpoints (e.g. org list, governance rules) to reduce DB load.
 * Prefix: colabora:cache:
 */

const { logger } = require('../middleware/logger');
const BoundedCache = require('./BoundedCache');

const PREFIX = 'colabora:cache:';
const DEFAULT_MEMORY_MAX = 500;

/**
 * @param {Object|null} redisClient - Redis client (e.g. app.locals.redisClient) or null for in-memory
 * @returns {{ get: Function, set: Function, del: Function }}
 */
function createResponseCache(redisClient) {
  const useRedis = redisClient && redisClient.status === 'ready';

  if (useRedis) {
    return {
      async get(key) {
        try {
          const raw = await redisClient.get(PREFIX + key);
          if (raw == null) return undefined;
          return JSON.parse(raw);
        } catch (err) {
          logger.warn('Response cache get error', { key, error: err.message });
          return undefined;
        }
      },
      async set(key, value, ttlMs) {
        try {
          const k = PREFIX + key;
          const v = JSON.stringify(value);
          if (ttlMs > 0) {
            await redisClient.set(k, v, 'PX', ttlMs);
          } else {
            await redisClient.set(k, v);
          }
        } catch (err) {
          logger.warn('Response cache set error', { key, error: err.message });
        }
      },
      async del(key) {
        try {
          await redisClient.del(PREFIX + key);
        } catch (err) {
          logger.warn('Response cache del error', { key, error: err.message });
        }
      }
    };
  }

  const memory = new BoundedCache({ maxSize: DEFAULT_MEMORY_MAX });
  return {
    async get(key) {
      return memory.get(key);
    },
    async set(key, value, ttlMs) {
      if (ttlMs > 0) memory.set(key, value, ttlMs);
    },
    async del(key) {
      memory.delete(key);
    }
  };
}

/** TTLs in ms */
const TTL = {
  ORG_LIST_MS: 90 * 1000,
  GOV_RULES_MS: 60 * 1000
};

module.exports = {
  createResponseCache,
  TTL,
  PREFIX
};
