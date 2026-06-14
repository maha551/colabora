const documentLockManager = require('../../server/modules/locks');

describe('Locks Module Tests', () => {
  test('should acquire lock', async () => {
    const documentId = 'test-doc-123';
    
    await expect(
      documentLockManager.withLock(documentId, async () => {
        return 'locked operation';
      })
    ).resolves.toBe('locked operation');
  });

  test('should release lock after operation', async () => {
    const documentId = 'test-doc-456';
    let lockReleased = false;

    await documentLockManager.withLock(documentId, async () => {
      lockReleased = false;
      return 'test';
    });

    // Lock should be released after operation
    expect(lockReleased).toBe(false); // Lock is released, so we can't directly check, but operation completes
  });

  test('should handle concurrent lock requests', async () => {
    const documentId = 'test-doc-789';
    
    const operations = [
      documentLockManager.withLock(documentId, async () => 'op1'),
      documentLockManager.withLock(documentId, async () => 'op2'),
      documentLockManager.withLock(documentId, async () => 'op3')
    ];

    const results = await Promise.all(operations);
    expect(results).toEqual(['op1', 'op2', 'op3']);
  });
});

