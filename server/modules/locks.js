// Document-level locking to prevent race conditions during agreed view updates
const BaseLockManager = require('./BaseLockManager');

class DocumentLockManager extends BaseLockManager {
  constructor() {
    super({
      maxLockTime: 15000, // 15 seconds max lock time
      lockAcquisitionTimeout: 60000, // 60 seconds max wait time for lock acquisition
      lockKeyPrefix: 'doc'
    });
  }

  /**
   * Get lock key for document
   * @param {string} documentId - Document ID
   * @returns {string} Lock key
   */
  getLockKey(documentId) {
    return super.getLockKey(documentId);
  }
}

// Singleton instance
const documentLockManager = new DocumentLockManager();

// Clean up stale locks every 5 minutes
setInterval(() => {
  const cleaned = documentLockManager.cleanupStaleLocks();
  if (cleaned > 0) {
    logger.info('Cleaned up stale document locks', { count: cleaned });
  }
}, 5 * 60 * 1000);

module.exports = documentLockManager;
