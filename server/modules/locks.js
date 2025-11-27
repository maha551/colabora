// Document-level locking to prevent race conditions during agreed view updates
const { logger } = require('../middleware/logger');

class DocumentLockManager {
  constructor() {
    this.locks = new Map(); // documentId -> { promise, resolve, timeout }
    this.maxLockTime = 30000; // 30 seconds max lock time
  }

  /**
   * Acquire a lock for a document
   * Returns a promise that resolves when the lock is acquired
   */
  async acquireLock(documentId) {
    const lockKey = `doc_${documentId}`;

    // Check if lock already exists
    if (this.locks.has(lockKey)) {
      logger.debug('Waiting for existing lock on document', { documentId });
      await this.locks.get(lockKey).promise;
      // Lock was released, now try to acquire it again
      return this.acquireLock(documentId);
    }

    // Create new lock
    let resolve;
    const promise = new Promise(r => { resolve = r; });

    const timeout = setTimeout(() => {
      logger.warn('Lock timeout for document, forcing release', { documentId });
      this.releaseLock(documentId);
    }, this.maxLockTime);

    this.locks.set(lockKey, { promise, resolve, timeout });

    logger.debug('Acquired lock for document', { documentId });
    return promise;
  }

  /**
   * Release a lock for a document
   */
  releaseLock(documentId) {
    const lockKey = `doc_${documentId}`;
    const lock = this.locks.get(lockKey);

    if (lock) {
      clearTimeout(lock.timeout);
      lock.resolve();
      this.locks.delete(lockKey);
      logger.debug('Released lock for document', { documentId });
    }
  }

  /**
   * Execute a function with document-level locking
   */
  async withLock(documentId, fn) {
    await this.acquireLock(documentId);
    try {
      return await fn();
    } finally {
      this.releaseLock(documentId);
    }
  }
}

// Singleton instance
const documentLockManager = new DocumentLockManager();

module.exports = documentLockManager;
