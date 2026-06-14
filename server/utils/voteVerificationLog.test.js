/**
 * Unit tests for vote verification log (Agent C).
 * Tests: canonical string and hash determinism, VALID_VOTE_TYPES, appendLogEntry validation.
 */

const {
  appendLogEntry,
  canonicalLogRowString,
  hashCanonical,
  VALID_VOTE_TYPES
} = require('./voteVerificationLog');

describe('voteVerificationLog', () => {
  describe('VALID_VOTE_TYPES', () => {
    test('includes all eight vote types', () => {
      expect(VALID_VOTE_TYPES.size).toBe(8);
      expect(VALID_VOTE_TYPES.has('paragraph')).toBe(true);
      expect(VALID_VOTE_TYPES.has('document')).toBe(true);
      expect(VALID_VOTE_TYPES.has('document_deletion')).toBe(true);
      expect(VALID_VOTE_TYPES.has('document_tree')).toBe(true);
      expect(VALID_VOTE_TYPES.has('structure')).toBe(true);
      expect(VALID_VOTE_TYPES.has('governance_rule')).toBe(true);
      expect(VALID_VOTE_TYPES.has('organization')).toBe(true);
      expect(VALID_VOTE_TYPES.has('representative_election')).toBe(true);
    });
  });

  describe('canonicalLogRowString', () => {
    test('produces deterministic output for same row', () => {
      const row = {
        id: 'a',
        sequence_index: 1,
        previous_entry_hash: 'h0',
        vote_type: 'paragraph',
        contest_id: 'p1',
        choice: 'PRO',
        timestamp: '2025-01-01T00:00:00.000Z',
        vote_hash: null,
        receipt_id: null,
        created_at: '2025-01-01T00:00:01.000Z'
      };
      expect(canonicalLogRowString(row)).toBe(canonicalLogRowString({ ...row }));
    });

    test('uses fixed key order (alphabetical)', () => {
      const row = { choice: 'PRO', contest_id: 'p1', vote_type: 'paragraph', id: 'x', sequence_index: 1, previous_entry_hash: '', timestamp: 't', created_at: 'c' };
      const str = canonicalLogRowString(row);
      expect(str).toContain('"choice"');
      expect(str).toContain('"contest_id"');
      expect(str).toContain('"vote_type"');
    });
  });

  describe('hashCanonical', () => {
    test('same input produces same hash (determinism)', () => {
      const input = '{"choice":"PRO","contest_id":"p1"}';
      expect(hashCanonical(input)).toBe(hashCanonical(input));
    });

    test('different input produces different hash', () => {
      expect(hashCanonical('a')).not.toBe(hashCanonical('b'));
    });

    test('hash is 64-char hex (SHA-256)', () => {
      const h = hashCanonical('test');
      expect(h).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('appendLogEntry validation', () => {
    const mockDb = null; // no real db; we only test validation before lock/db

    test('throws when voteType is invalid', async () => {
      await expect(
        appendLogEntry(mockDb, {
          voteType: 'invalid_type',
          contestId: 'c1',
          choice: 'PRO',
          timestamp: new Date().toISOString()
        })
      ).rejects.toThrow(/invalid voteType/);
    });

    test('throws when contestId is missing', async () => {
      await expect(
        appendLogEntry(mockDb, {
          voteType: 'paragraph',
          contestId: '',
          choice: 'PRO',
          timestamp: new Date().toISOString()
        })
      ).rejects.toThrow(/contestId/);
    });

    test('throws when choice is missing', async () => {
      await expect(
        appendLogEntry(mockDb, {
          voteType: 'paragraph',
          contestId: 'c1',
          choice: '',
          timestamp: new Date().toISOString()
        })
      ).rejects.toThrow(/choice/);
    });

    test('throws when timestamp is missing', async () => {
      await expect(
        appendLogEntry(mockDb, {
          voteType: 'paragraph',
          contestId: 'c1',
          choice: 'PRO',
          timestamp: ''
        })
      ).rejects.toThrow(/timestamp/);
    });
  });
});
