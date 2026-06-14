const {
  safeJsonParse,
  safeJsonParseArray,
  safeJsonParseObject,
  safeJsonStringify
} = require('../../server/utils/jsonUtils');

describe('jsonUtils', () => {
  describe('safeJsonParse', () => {
    it('returns the default for null/undefined', () => {
      expect(safeJsonParse(null)).toBeNull();
      expect(safeJsonParse(undefined, 'fallback')).toBe('fallback');
    });

    it('returns already-parsed objects/arrays as-is', () => {
      const obj = { a: 1 };
      const arr = [1, 2];
      expect(safeJsonParse(obj)).toBe(obj);
      expect(safeJsonParse(arr)).toBe(arr);
    });

    it('returns the default for non-string, non-object values', () => {
      expect(safeJsonParse(42, 'def')).toBe('def');
      expect(safeJsonParse(true, 'def')).toBe('def');
    });

    it('returns the default for empty/whitespace strings', () => {
      expect(safeJsonParse('   ', 'def')).toBe('def');
      expect(safeJsonParse('', 'def')).toBe('def');
    });

    it('parses valid JSON strings', () => {
      expect(safeJsonParse('{"x":1}')).toEqual({ x: 1 });
      expect(safeJsonParse('[1,2,3]')).toEqual([1, 2, 3]);
    });

    it('returns the default for invalid JSON', () => {
      expect(safeJsonParse('{not json', 'def')).toBe('def');
      expect(safeJsonParse('oops')).toBeNull();
    });
  });

  describe('safeJsonParseArray', () => {
    it('returns an array for valid JSON arrays', () => {
      expect(safeJsonParseArray('[1,2]')).toEqual([1, 2]);
    });

    it('returns an empty array for non-array results', () => {
      expect(safeJsonParseArray('{"x":1}')).toEqual([]);
      expect(safeJsonParseArray('bad')).toEqual([]);
      expect(safeJsonParseArray(null)).toEqual([]);
    });
  });

  describe('safeJsonParseObject', () => {
    it('returns an object for valid JSON objects', () => {
      expect(safeJsonParseObject('{"x":1}')).toEqual({ x: 1 });
    });

    it('returns an empty object for arrays/null/invalid', () => {
      expect(safeJsonParseObject('[1,2]')).toEqual({});
      expect(safeJsonParseObject('null')).toEqual({});
      expect(safeJsonParseObject('bad')).toEqual({});
    });
  });

  describe('safeJsonStringify', () => {
    it('stringifies plain objects', () => {
      expect(safeJsonStringify({ x: 1 })).toBe('{"x":1}');
    });

    it('returns the default on circular references', () => {
      const circular = {};
      circular.self = circular;
      expect(safeJsonStringify(circular)).toBe('{}');
      expect(safeJsonStringify(circular, '[]')).toBe('[]');
    });
  });
});
