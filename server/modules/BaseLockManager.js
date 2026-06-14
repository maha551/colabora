/**
 * Base Lock Manager
 * Provides shared locking functionality for different resource types
 * Extended by DocumentLockManager and VotingLockManager
 */

const { logger } = require('../middleware/logger');
const { ApiError } = require('../middleware/errorHandler');

class BaseLockManager {
  constructor(options = {}) {
    this.locks = new Map();
    this.maxLockTime = options.maxLockTime || 30000; // 30 seconds default
    this.lockAcquisitionTimeout = options.lockAcquisitionTimeout || 60000; // 60 seconds default
    this.lockOrder = new Map();
    this.lockKeyPrefix = options.lockKeyPrefix || '';
    /** Set of lock keys that were force-released by timeout; avoids "release non-existent lock" warning when holder releases later */
    this.forceReleasedKeys = new Set();
  }

  /**
   * Generate lock key from resource ID
   * Override in subclasses for custom key generation
   * @param {string} resourceId - Resource ID
   * @returns {string} Lock key
   */
  getLockKey(resourceId) {
    return this.lockKeyPrefix ? `${this.lockKeyPrefix}_${resourceId}` : resourceId;
  }

  /**
   * Acquire a lock for a resource
   * @param {string} resourceId - Resource ID
   * @param {number} timeout - Optional timeout override
   * @returns {Promise<void>} Resolves when lock is acquired
   * @throws {ApiError} If lock acquisition times out
   */
  async acquireLock(resourceId, timeout = this.lockAcquisitionTimeout) {
    const lockKey = this.getLockKey(resourceId);
    const startTime = Date.now();

    // Check if lock already exists
    if (this.locks.has(lockKey)) {
      const elapsed = Date.now() - startTime;
      if (elapsed > timeout) {
        logger.error('Lock acquisition timeout', { resourceId, elapsed, timeout });
        throw ApiError.rateLimit(
          'Resource is currently locked. Please try again in a moment.',
          null,
          'LOCK_TIMEOUT'
        );
      }

      logger.debug('Waiting for existing lock', { resourceId, elapsed });
      
      try {
        await Promise.race([
          this.locks.get(lockKey).promise,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Lock wait timeout')), timeout - elapsed)
          )
        ]);
      } catch (waitError) {
        if (waitError.message === 'Lock wait timeout') {
          logger.error('Lock wait timeout', { resourceId, elapsed });
          throw ApiError.rateLimit(
            'Resource is currently locked. Please try again in a moment.',
            null,
            'LOCK_TIMEOUT'
          );
        }
        throw waitError;
      }
      
      // Lock was released, now try to acquire it again (recursive with remaining time)
      return this.acquireLock(resourceId, timeout - (Date.now() - startTime));
    }

    // Create new lock
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });

    const timeoutId = setTimeout(() => {
      logger.warn('Lock timeout, forcing release', { resourceId });
      this.forceReleasedKeys.add(lockKey);
      const lock = this.locks.get(lockKey);
      if (lock) {
        clearTimeout(lock.timeout);
        lock.resolve();
        this.locks.delete(lockKey);
        // Do not call releaseLock so forceReleasedKeys is left set; holder's releaseLock will no-op without warning
      }
    }, this.maxLockTime);

    // Track lock order for deadlock prevention
    const lockOrder = this.lockOrder.get(lockKey) || 0;
    this.lockOrder.set(lockKey, lockOrder + 1);

    this.locks.set(lockKey, { 
      promise, 
      resolve, 
      reject,
      timeout: timeoutId, 
      acquiredAt: Date.now(),
      lockOrder,
      resourceId
    });

    logger.debug('Acquired lock', { resourceId, lockOrder });
    // The lock is now held by this caller. Return immediately — `promise` is the
    // handle that OTHER waiters await (it resolves when this holder releases the
    // lock). Returning `promise` here would make the holder wait for its own
    // release (until the maxLockTime auto-release fires), serializing and slowing
    // every uncontended lock acquisition.
    return;
  }

  /**
   * Release a lock for a resource
   * @param {string} resourceId - Resource ID
   * @returns {boolean} True if lock was released, false if it didn't exist
   */
  releaseLock(resourceId) {
    const lockKey = this.getLockKey(resourceId);
    const lock = this.locks.get(lockKey);

    if (lock) {
      clearTimeout(lock.timeout);
      lock.resolve();
      this.locks.delete(lockKey);
      this.forceReleasedKeys.delete(lockKey);

      const heldTime = Date.now() - lock.acquiredAt;
      if (heldTime > this.maxLockTime * 0.8) {
        logger.warn('Lock held for extended period', { resourceId, heldTime, maxLockTime: this.maxLockTime });
      }

      logger.debug('Released lock', { resourceId, heldTime });
      return true;
    }
    if (this.forceReleasedKeys.has(lockKey)) {
      this.forceReleasedKeys.delete(lockKey);
      logger.debug('Release skipped (lock was already force-released by timeout)', { resourceId });
      return true;
    }
    logger.warn('Attempted to release non-existent lock', { resourceId });
    return false;
  }

  /**
   * Execute a function with resource-level locking
   * Handles errors, timeouts, and ensures lock is always released
   * @param {string} resourceId - Resource ID
   * @param {Function} fn - Function to execute
   * @returns {Promise<any>} Result of the function
   * @throws {ApiError} If lock acquisition fails or times out
   */
  async withLock(resourceId, fn) {
    let lockAcquired = false;
    
    try {
      // Acquire lock with timeout handling
      await this.acquireLock(resourceId);
      lockAcquired = true;
      
      // Execute the function
      return await fn();
    } catch (error) {
      // Handle lock timeout
      if (error.code === 'LOCK_TIMEOUT' || error.message?.includes('timeout')) {
        logger.error('Lock acquisition timeout in withLock', {
          resourceId,
          error: error.message
        });
        throw ApiError.rateLimit(
          'Resource is currently locked. Please try again in a moment.',
          null,
          'LOCK_TIMEOUT'
        );
      }
      
      // Handle lock already held
      if (error.message?.includes('already held') || error.message?.includes('conflict')) {
        logger.warn('Lock already held in withLock', { resourceId });
        throw ApiError.forbidden(
          'Resource is currently being modified by another operation',
          'LOCK_CONFLICT'
        );
      }
      
      // Re-throw other errors
      throw error;
    } finally {
      // Release lock only if still held (timeout may have released it already)
      if (lockAcquired && this.isLocked(resourceId)) {
        try {
          this.releaseLock(resourceId);
        } catch (releaseError) {
          // Log but don't fail - lock will timeout automatically
          logger.error('Error releasing lock in withLock', {
            resourceId,
            error: releaseError.message
          });
        }
      }
    }
  }

  /**
   * Check if a resource is currently locked
   * @param {string} resourceId - Resource ID
   * @returns {boolean} True if locked
   */
  isLocked(resourceId) {
    const lockKey = this.getLockKey(resourceId);
    return this.locks.has(lockKey);
  }

  /**
   * Clean up stale locks (for health checks)
   * Removes locks that have exceeded max lock time
   * @returns {number} Number of locks cleaned up
   */
  cleanupStaleLocks() {
    const now = Date.now();
    const staleLocks = [];
    
    for (const [lockKey, lock] of this.locks.entries()) {
      // Check if lock has been held too long (double the max lock time as safety margin)
      if (lock.acquiredAt && (now - lock.acquiredAt) > (this.maxLockTime * 2)) {
        staleLocks.push(lockKey);
      }
    }
    
    for (const lockKey of staleLocks) {
      const lock = this.locks.get(lockKey);
      if (lock) {
        logger.warn('Cleaning up stale lock', {
          resourceId: lock.resourceId,
          lockKey,
          heldTime: now - lock.acquiredAt
        });
        this.releaseLock(lock.resourceId);
      }
    }
    
    return staleLocks.length;
  }
}

module.exports = BaseLockManager;

