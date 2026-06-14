/**
 * Voting Lock Manager
 * Provides locking for voting operations to prevent race conditions
 * Supports different resource types: 'document', 'proposal', 'election', 'organization'
 */

const BaseLockManager = require('../modules/BaseLockManager');
const documentLockManager = require('../modules/locks');
const { logger } = require('../middleware/logger');

class VotingLockManager extends BaseLockManager {
  constructor() {
    super({
      maxLockTime: 15000, // 15 seconds max hold (fail fast; avoids idle-in-transaction and "connection not queryable")
      lockAcquisitionTimeout: 12000 // 12 seconds wait (must be < PG_IDLE_TRANSACTION_TIMEOUT so connection is not killed while waiting)
    });
  }

  /**
   * Generate lock key from resource type and ID
   * @param {string} resourceType - Type of resource ('document', 'proposal', 'election', 'organization')
   * @param {string} resourceId - Resource ID
   * @returns {string} Lock key
   */
  getLockKeyForResource(resourceType, resourceId) {
    // For documents, delegate to document lock manager (it uses 'doc_' prefix)
    // For other resources, use resourceType_resourceId format
    return resourceType === 'document' ? `doc_${resourceId}` : `${resourceType}_${resourceId}`;
  }

  /**
   * Acquire a lock for a voting resource
   * @param {string} resourceType - Type of resource
   * @param {string} resourceId - Resource ID
   * @returns {Promise<void>} Resolves when lock is acquired
   * @throws {ApiError} If lock acquisition times out
   */
  async acquireLock(resourceType, resourceId) {
    // Validate inputs
    if (!resourceType || !resourceId) {
      throw new Error(`Invalid lock parameters: resourceType=${resourceType}, resourceId=${resourceId}`);
    }

    // For documents, use the existing document lock manager
    if (resourceType === 'document') {
      return documentLockManager.acquireLock(resourceId);
    }

    // For other resource types, use base class implementation with composite key
    const compositeId = `${resourceType}_${resourceId}`;
    await super.acquireLock(compositeId);
    
    // Store resourceType and resourceId separately for cleanup
    const lockKey = super.getLockKey(compositeId);
    const lock = this.locks.get(lockKey);
    if (lock) {
      lock.resourceType = resourceType;
      lock.originalResourceId = resourceId;
      // Also store compositeId for timeout handler
      lock.compositeId = compositeId;
    }
  }

  /**
   * Release a lock for a voting resource
   * Handles both two-parameter calls (resourceType, resourceId) and single-parameter calls (compositeId from base class)
   * @param {string} resourceType - Type of resource, or compositeId if resourceId is undefined
   * @param {string} resourceId - Resource ID (optional, if undefined, resourceType is treated as compositeId)
   */
  releaseLock(resourceType, resourceId) {
    // Handle single-parameter call from base class timeout handler (compositeId passed as resourceType)
    if (resourceId === undefined) {
      // resourceType is actually a compositeId from base class
      return super.releaseLock(resourceType);
    }

    // For documents, use the existing document lock manager
    if (resourceType === 'document') {
      return documentLockManager.releaseLock(resourceId);
    }

    // For other resource types, use base class implementation
    const compositeId = `${resourceType}_${resourceId}`;
    return super.releaseLock(compositeId);
  }

  /**
   * Execute a function with voting lock
   * Handles errors, timeouts, and ensures lock is always released
   * @param {string} resourceType - Type of resource
   * @param {string} resourceId - Resource ID
   * @param {Function} fn - Function to execute
   * @returns {Promise<any>} Result of the function
   * @throws {ApiError} If lock acquisition fails or times out
   */
  async withVoteLock(resourceType, resourceId, fn) {
    // Validate inputs
    if (!resourceType || !resourceId) {
      throw new Error(`Invalid lock parameters: resourceType=${resourceType}, resourceId=${resourceId}`);
    }

    // For documents, use document lock manager's withLock
    if (resourceType === 'document') {
      return documentLockManager.withLock(resourceId, fn);
    }

    // For other resource types, implement lock logic directly
    // We can't use super.withLock because it calls this.acquireLock with wrong signature
    const compositeId = `${resourceType}_${resourceId}`;
    let lockAcquired = false;
    
    try {
      // Acquire lock using base class acquireLock with compositeId
      await super.acquireLock(compositeId);
      lockAcquired = true;
      
      // Store resourceType and resourceId for cleanup
      const lockKey = super.getLockKey(compositeId);
      const lock = this.locks.get(lockKey);
      if (lock) {
        lock.resourceType = resourceType;
        lock.originalResourceId = resourceId;
        lock.compositeId = compositeId;
      }
      
      // Execute the function
      return await fn();
    } catch (error) {
      // Handle lock timeout
      if (error.code === 'LOCK_TIMEOUT' || error.message?.includes('timeout')) {
        logger.error('Lock acquisition timeout in withVoteLock', {
          resourceType,
          resourceId,
          compositeId,
          error: error.message
        });
        throw error;
      }
      
      // Re-throw other errors
      throw error;
    } finally {
      // Always release lock if acquired
      if (lockAcquired) {
        try {
          super.releaseLock(compositeId);
        } catch (releaseError) {
          // Log but don't fail - lock will timeout automatically
          logger.error('Error releasing lock in withVoteLock', {
            resourceType,
            resourceId,
            compositeId,
            error: releaseError.message
          });
        }
      }
    }
  }

  /**
   * Check if a resource is currently locked
   * @param {string} resourceType - Type of resource
   * @param {string} resourceId - Resource ID
   * @returns {boolean} True if locked
   */
  isLocked(resourceType, resourceId) {
    if (resourceType === 'document') {
      // Document lock manager doesn't expose this, so we'll assume it's not locked
      // if we can't check (this is a limitation we can live with)
      return false;
    }
    
    const compositeId = `${resourceType}_${resourceId}`;
    return super.isLocked(compositeId);
  }

  /**
   * Clean up stale locks (for health checks)
   * Removes locks that have exceeded max lock time
   */
  cleanupStaleLocks() {
    const now = Date.now();
    const staleLocks = [];
    
    for (const [lockKey, lock] of this.locks.entries()) {
      // Check if lock has been held too long (double the max lock time as safety margin)
      if (lock.acquiredAt && (now - lock.acquiredAt) > (this.maxLockTime * 2)) {
        staleLocks.push({ lockKey, lock });
      }
    }
    
    for (const { lockKey, lock } of staleLocks) {
      logger.warn('Cleaning up stale voting lock', {
        resourceType: lock.resourceType || 'unknown',
        resourceId: lock.originalResourceId || 'unknown',
        lockKey,
        heldTime: now - lock.acquiredAt
      });
      
      // Use releaseLock with resourceType and resourceId if available
      if (lock.resourceType && lock.originalResourceId) {
        this.releaseLock(lock.resourceType, lock.originalResourceId);
      } else {
        // Fallback: extract compositeId from lockKey
        // The lockKey format is: lockKeyPrefix_resourceType_resourceId (if prefix exists)
        // or just resourceType_resourceId (if no prefix)
        let compositeId = lockKey;
        if (this.lockKeyPrefix && lockKey.startsWith(this.lockKeyPrefix + '_')) {
          compositeId = lockKey.substring(this.lockKeyPrefix.length + 1);
        }
        // Remove any trailing _undefined if present (handles malformed lock keys)
        // Also handle cases where _undefined appears multiple times
        compositeId = compositeId.replace(/_undefined(_undefined)*$/, '');
        
        // Only try to release if we have a valid compositeId
        if (compositeId && !compositeId.endsWith('_undefined')) {
          try {
            super.releaseLock(compositeId);
          } catch (releaseError) {
            logger.error('Error releasing lock in cleanup fallback', {
              lockKey,
              compositeId,
              error: releaseError.message
            });
          }
        } else {
          logger.warn('Skipping release of malformed lock key', { lockKey, compositeId });
          // Force delete the lock entry to prevent memory leak
          this.locks.delete(lockKey);
        }
      }
    }
    
    return staleLocks.length;
  }
}

// Singleton instance
const votingLockManager = new VotingLockManager();

// Clean up stale locks every 5 minutes
setInterval(() => {
  const cleaned = votingLockManager.cleanupStaleLocks();
  if (cleaned > 0) {
    logger.info('Cleaned up stale voting locks', { count: cleaned });
  }
}, 5 * 60 * 1000);

module.exports = votingLockManager;

