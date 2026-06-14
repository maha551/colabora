/**
 * BoundedCache - Map-like cache with max size and per-entry TTL.
 * Evicts by LRU when at capacity and returns undefined for expired entries on get.
 */

class BoundedCache {
  /**
   * @param {Object} options
   * @param {number} [options.maxSize=1000] - Maximum number of entries; LRU eviction when exceeded.
   */
  constructor(options = {}) {
    this._maxSize = options.maxSize ?? 1000;
    /** @type {Map<string, { value: *, expiresAt: number }>} */
    this._map = new Map();
  }

  /**
   * @param {string} key
   * @returns {*|undefined} Stored value or undefined if missing/expired. Updates LRU order on hit.
   */
  get(key) {
    const entry = this._map.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this._map.delete(key);
      return undefined;
    }
    // Move to end (most recently used)
    this._map.delete(key);
    this._map.set(key, entry);
    return entry.value;
  }

  /**
   * @param {string} key
   * @param {*} value
   * @param {number} ttlMs - Time-to-live in milliseconds.
   */
  set(key, value, ttlMs) {
    if (ttlMs <= 0) return;
    if (this._map.has(key)) this._map.delete(key);
    while (this._map.size >= this._maxSize) {
      const firstKey = this._map.keys().next().value;
      if (firstKey === undefined) break;
      this._map.delete(firstKey);
    }
    const expiresAt = Date.now() + ttlMs;
    this._map.set(key, { value, expiresAt });
  }

  /**
   * Remove one entry.
   * @param {string} key
   */
  invalidate(key) {
    this._map.delete(key);
  }

  /**
   * Remove all entries.
   */
  invalidateAll() {
    this._map.clear();
  }

  /**
   * Map compatibility: same as invalidate(key).
   * @param {string} key
   * @returns {boolean}
   */
  delete(key) {
    const had = this._map.has(key);
    this._map.delete(key);
    return had;
  }

  /**
   * Current number of entries (may include expired until next get evicts them).
   */
  get size() {
    return this._map.size;
  }

  /**
   * Iterator of [key, value] for non-expired entries (value is user-facing value).
   * Used by permissions.js for pattern-based invalidation.
   */
  *entries() {
    const now = Date.now();
    for (const [key, entry] of this._map) {
      if (now >= entry.expiresAt) continue;
      yield [key, entry.value];
    }
  }
}

module.exports = BoundedCache;
