/**
 * Unit tests for voteReceipt (Agent D): determinism and anonymity.
 */

const {
  generateReceiptId,
  computeVoteHash,
  verificationCodeFromReceipt,
  canonicalJson,
  NON_ANONYMOUS_VOTE_TYPES
} = require('./voteReceipt');

describe('voteReceipt', () => {
  describe('generateReceiptId', () => {
    it('returns a UUID string', () => {
      const id = generateReceiptId();
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
    it('returns a new value each time', () => {
      const a = generateReceiptId();
      const b = generateReceiptId();
      expect(a).not.toBe(b);
    });
  });

  describe('computeVoteHash', () => {
    const base = {
      contestId: 'c1',
      choice: 'PRO',
      timestamp: '2025-01-15T12:00:00.000Z',
      receiptId: 'r1'
    };

    it('is deterministic: same inputs produce same hash (paragraph)', () => {
      const h1 = computeVoteHash('paragraph', base);
      const h2 = computeVoteHash('paragraph', base);
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic for organization (non-anonymous)', () => {
      const opts = { ...base, userId: 'u1' };
      const h1 = computeVoteHash('organization', opts);
      const h2 = computeVoteHash('organization', opts);
      expect(h1).toBe(h2);
    });

    it('anonymous type: hash does not depend on userId when userId is not in options', () => {
      const h1 = computeVoteHash('paragraph', base);
      const withUserId = { ...base, userId: 'different-user' };
      const h2 = computeVoteHash('paragraph', withUserId);
      expect(h1).toBe(h2);
    });

    it('anonymous type: different contestId/choice/timestamp/receiptId change hash', () => {
      const h1 = computeVoteHash('paragraph', base);
      expect(computeVoteHash('paragraph', { ...base, contestId: 'c2' })).not.toBe(h1);
      expect(computeVoteHash('paragraph', { ...base, choice: 'CONTRA' })).not.toBe(h1);
      expect(computeVoteHash('paragraph', { ...base, timestamp: '2025-01-16T12:00:00.000Z' })).not.toBe(h1);
      expect(computeVoteHash('paragraph', { ...base, receiptId: 'r2' })).not.toBe(h1);
    });

    it('organization: different userId produces different hash', () => {
      const h1 = computeVoteHash('organization', { ...base, userId: 'u1' });
      const h2 = computeVoteHash('organization', { ...base, userId: 'u2' });
      expect(h1).not.toBe(h2);
    });

    it('representative_election (public): deterministic with contestId, userId, choice, timestamp, receiptId', () => {
      const opts = {
        contestId: 'election1',
        userId: 'user1',
        choice: 'candidate1',
        timestamp: '2025-01-15T12:00:00.000Z',
        receiptId: 'r1'
      };
      const h1 = computeVoteHash('representative_election', opts);
      const h2 = computeVoteHash('representative_election', opts);
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('representative_election (public): different userId produces different hash', () => {
      const base = {
        contestId: 'election1',
        choice: 'candidate1',
        timestamp: '2025-01-15T12:00:00.000Z',
        receiptId: 'r1'
      };
      const h1 = computeVoteHash('representative_election', { ...base, userId: 'u1' });
      const h2 = computeVoteHash('representative_election', { ...base, userId: 'u2' });
      expect(h1).not.toBe(h2);
    });

    it('representative_election: deterministic with sessionId, token, ranking, timestamp', () => {
      const opts = {
        contestId: 'sess1',
        sessionId: 'sess1',
        token: 'anon-token',
        ranking: ['cand1', 'cand2'],
        timestamp: '2025-01-15T12:00:00.000Z'
      };
      const h1 = computeVoteHash('representative_election', opts);
      const h2 = computeVoteHash('representative_election', opts);
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('verificationCodeFromReceipt', () => {
    it('returns first 8 chars of receipt without dashes by default', () => {
      const code = verificationCodeFromReceipt('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(code).toBe('a1b2c3d4');
    });
    it('allows custom length', () => {
      expect(verificationCodeFromReceipt('abcdefghij', 4)).toBe('abcd');
    });
    it('returns empty string for empty or non-string', () => {
      expect(verificationCodeFromReceipt('')).toBe('');
      expect(verificationCodeFromReceipt(null)).toBe('');
      expect(verificationCodeFromReceipt(undefined)).toBe('');
    });
  });

  describe('canonicalJson', () => {
    it('sorts keys alphabetically', () => {
      expect(canonicalJson({ z: 1, a: 2, m: 3 })).toBe(JSON.stringify({ a: 2, m: 3, z: 1 }));
    });
  });

  describe('NON_ANONYMOUS_VOTE_TYPES', () => {
    it('contains only organization', () => {
      expect(NON_ANONYMOUS_VOTE_TYPES.has('organization')).toBe(true);
      expect(NON_ANONYMOUS_VOTE_TYPES.has('paragraph')).toBe(false);
      expect(NON_ANONYMOUS_VOTE_TYPES.has('representative_election')).toBe(false);
    });
  });
});
