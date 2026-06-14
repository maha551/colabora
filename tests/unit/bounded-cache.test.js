/**
 * Unit tests for BoundedCache (TTL, LRU eviction, invalidation, entries).
 * TTL tests use jest.useFakeTimers() for stability.
 */

const BoundedCache = require('../../server/utils/BoundedCache');

describe('BoundedCache', () => {
  describe('insertion and retrieval', () => {
    test('set and get return same value', () => {
      const cache = new BoundedCache({ maxSize: 10 });
      cache.set('a', { count: 1 }, 60000);
      expect(cache.get('a')).toEqual({ count: 1 });
    });

    test('multiple keys and size', () => {
      const cache = new BoundedCache({ maxSize: 10 });
      cache.set('a', 1, 60000);
      cache.set('b', 2, 60000);
      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBe(2);
      expect(cache.size).toBe(2);
    });
  });

  describe('TTL expiry', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    test('get returns undefined after TTL', () => {
      const cache = new BoundedCache({ maxSize: 10 });
      cache.set('a', 42, 50);
      expect(cache.get('a')).toBe(42);
      jest.advanceTimersByTime(60);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.size).toBe(0);
    });
  });

  describe('LRU eviction', () => {
    test('evicts oldest when over capacity', () => {
      const cache = new BoundedCache({ maxSize: 2 });
      cache.set('k1', 'v1', 60000);
      cache.set('k2', 'v2', 60000);
      cache.set('k3', 'v3', 60000);
      expect(cache.get('k1')).toBeUndefined();
      expect(cache.get('k2')).toBe('v2');
      expect(cache.get('k3')).toBe('v3');
    });

    test('get updates LRU order; next set evicts the other', () => {
      const cache = new BoundedCache({ maxSize: 2 });
      cache.set('k1', 'v1', 60000);
      cache.set('k2', 'v2', 60000);
      cache.get('k1'); // k1 becomes most recently used
      cache.set('k3', 'v3', 60000); // evict k2 (least recent)
      expect(cache.get('k1')).toBe('v1');
      expect(cache.get('k2')).toBeUndefined();
      expect(cache.get('k3')).toBe('v3');
    });
  });

  describe('size never exceeds maxSize', () => {
    test('after 10 sets with maxSize 3, size <= 3', () => {
      const cache = new BoundedCache({ maxSize: 3 });
      for (let i = 0; i < 10; i++) {
        cache.set(`key${i}`, i, 60000);
        expect(cache.size).toBeLessThanOrEqual(3);
      }
    });
  });

  describe('invalidate(key)', () => {
    test('removes one entry', () => {
      const cache = new BoundedCache({ maxSize: 10 });
      cache.set('a', 1, 60000);
      cache.set('b', 2, 60000);
      cache.invalidate('a');
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
      expect(cache.size).toBe(1);
    });
  });

  describe('invalidateAll()', () => {
    test('clears all entries', () => {
      const cache = new BoundedCache({ maxSize: 10 });
      cache.set('a', 1, 60000);
      cache.set('b', 2, 60000);
      cache.invalidateAll();
      expect(cache.size).toBe(0);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBeUndefined();
    });
  });

  describe('delete(key) compatibility', () => {
    test('delete removes entry like invalidate', () => {
      const cache = new BoundedCache({ maxSize: 10 });
      cache.set('a', 1, 60000);
      cache.set('b', 2, 60000);
      cache.delete('a');
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
    });
  });

  describe('entries() for pattern invalidation', () => {
    test('iterate keys and delete by pattern', () => {
      const cache = new BoundedCache({ maxSize: 10 });
      cache.set('a:org1:x', 1, 60000);
      cache.set('b:org2:y', 2, 60000);
      cache.set('c:org1:z', 3, 60000);
      const keysToDelete = [];
      for (const [key] of cache.entries()) {
        if (key.includes(':org1:')) keysToDelete.push(key);
      }
      keysToDelete.forEach((k) => cache.delete(k));
      expect(cache.get('a:org1:x')).toBeUndefined();
      expect(cache.get('c:org1:z')).toBeUndefined();
      expect(cache.get('b:org2:y')).toBe(2);
    });
  });
});
