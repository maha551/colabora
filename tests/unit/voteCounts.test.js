const {
  calculateVoteCounts,
  validateVoteCounts,
  normalizeVoteValue,
  convertVoteCountsFormat
} = require('../../server/utils/voteCounts');

describe('voteCounts utilities', () => {
  describe('calculateVoteCounts', () => {
    it('returns zeroed counts when input is not an array', () => {
      expect(calculateVoteCounts(null)).toEqual({ pro: 0, contra: 0, neutral: 0, total: 0 });
      expect(calculateVoteCounts(undefined)).toEqual({ pro: 0, contra: 0, neutral: 0, total: 0 });
      expect(calculateVoteCounts('nope')).toEqual({ pro: 0, contra: 0, neutral: 0, total: 0 });
    });

    it('counts PRO/CONTRA/NEUTRAL votes', () => {
      const votes = [
        { vote: 'PRO' },
        { vote: 'PRO' },
        { vote: 'CONTRA' },
        { vote: 'NEUTRAL' }
      ];
      expect(calculateVoteCounts(votes)).toEqual({ pro: 2, contra: 1, neutral: 1, total: 4 });
    });

    it('counts yes/no/abstain aliases and the voteChoice field', () => {
      const votes = [
        { voteChoice: 'yes' },
        { vote: 'no' },
        { vote: 'abstain' }
      ];
      expect(calculateVoteCounts(votes)).toEqual({ pro: 1, contra: 1, neutral: 1, total: 3 });
    });

    it('excludes unknown vote values from the total', () => {
      const votes = [
        { vote: 'PRO' },
        { vote: 'MAYBE', id: 'x' },
        { id: 'y' }
      ];
      expect(calculateVoteCounts(votes)).toEqual({ pro: 1, contra: 0, neutral: 0, total: 1 });
    });
  });

  describe('validateVoteCounts', () => {
    const votes = [{ vote: 'PRO' }, { vote: 'CONTRA' }, { vote: 'NEUTRAL' }];

    it('rejects non-object vote counts', () => {
      expect(validateVoteCounts(null, votes).isValid).toBe(false);
      expect(validateVoteCounts('x', votes).error).toMatch(/not an object/);
    });

    it('rejects non-array votes', () => {
      const res = validateVoteCounts({ total: 0 }, 'nope');
      expect(res.isValid).toBe(false);
      expect(res.error).toMatch(/not an array/);
    });

    it('fails on total mismatch', () => {
      const res = validateVoteCounts({ pro: 1, contra: 1, neutral: 1, total: 99 }, votes);
      expect(res.isValid).toBe(false);
      expect(res.error).toMatch(/total mismatch/);
    });

    it('passes when counts match exactly', () => {
      const res = validateVoteCounts({ pro: 1, contra: 1, neutral: 1, total: 3 }, votes);
      expect(res.isValid).toBe(true);
      expect(res.warning).toBeUndefined();
    });

    it('passes with a warning for minor (within-threshold) differences', () => {
      // total still matches (3) but pro/contra differ by 1 each
      const res = validateVoteCounts({ pro: 2, contra: 0, neutral: 1, total: 3 }, votes);
      expect(res.isValid).toBe(true);
      expect(res.warning).toMatch(/minor mismatches/);
    });
  });

  describe('normalizeVoteValue', () => {
    it('returns null for empty or non-string input', () => {
      expect(normalizeVoteValue('')).toBeNull();
      expect(normalizeVoteValue(null)).toBeNull();
      expect(normalizeVoteValue(42)).toBeNull();
    });

    it('normalizes yes/no/abstain to PRO/CONTRA/NEUTRAL', () => {
      expect(normalizeVoteValue(' yes ')).toBe('PRO');
      expect(normalizeVoteValue('No')).toBe('CONTRA');
      expect(normalizeVoteValue('abstain')).toBe('NEUTRAL');
    });

    it('passes through already-normalized values', () => {
      expect(normalizeVoteValue('pro')).toBe('PRO');
      expect(normalizeVoteValue('CONTRA')).toBe('CONTRA');
    });

    it('returns null for unknown formats', () => {
      expect(normalizeVoteValue('maybe')).toBeNull();
    });
  });

  describe('convertVoteCountsFormat', () => {
    it('returns the input unchanged when formats match', () => {
      const counts = { pro: 1 };
      expect(convertVoteCountsFormat(counts, 'pro_contra_neutral', 'pro_contra_neutral')).toBe(counts);
    });

    it('converts yes_no_abstain to pro_contra_neutral', () => {
      const res = convertVoteCountsFormat({ yes: 3, no: 2, abstain: 1 }, 'yes_no_abstain', 'pro_contra_neutral');
      expect(res).toEqual({ pro: 3, contra: 2, neutral: 1, total: 6 });
    });

    it('converts pro_contra_neutral to yes_no_abstain', () => {
      const res = convertVoteCountsFormat({ pro: 3, contra: 2, neutral: 1 }, 'pro_contra_neutral', 'yes_no_abstain');
      expect(res).toEqual({ yes: 3, no: 2, abstain: 1, total: 6 });
    });

    it('returns the input unchanged for unsupported conversions', () => {
      const counts = { pro: 1 };
      expect(convertVoteCountsFormat(counts, 'weird', 'other')).toBe(counts);
    });
  });
});
