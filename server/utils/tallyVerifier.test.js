/**
 * Unit tests for tally verifier (Agent E).
 */

const {
  normalizeChoice,
  recomputeTallyFromBallots,
  compareTally
} = require('./tallyVerifier');

describe('tallyVerifier', () => {
  describe('normalizeChoice', () => {
    test('PRO and yes map to pro', () => {
      expect(normalizeChoice('PRO')).toBe('pro');
      expect(normalizeChoice('yes')).toBe('pro');
      expect(normalizeChoice('Yes')).toBe('pro');
      expect(normalizeChoice('  pro  ')).toBe('pro');
    });

    test('CONTRA and no map to contra', () => {
      expect(normalizeChoice('CONTRA')).toBe('contra');
      expect(normalizeChoice('no')).toBe('contra');
      expect(normalizeChoice('No')).toBe('contra');
      expect(normalizeChoice('  contra  ')).toBe('contra');
    });

    test('NEUTRAL and abstain map to neutral', () => {
      expect(normalizeChoice('NEUTRAL')).toBe('neutral');
      expect(normalizeChoice('abstain')).toBe('neutral');
      expect(normalizeChoice('Abstain')).toBe('neutral');
      expect(normalizeChoice('  NEUTRAL  ')).toBe('neutral');
    });

    test('unknown or empty returns null', () => {
      expect(normalizeChoice('')).toBe(null);
      expect(normalizeChoice('   ')).toBe(null);
      expect(normalizeChoice('unknown')).toBe(null);
      expect(normalizeChoice('invalid')).toBe(null);
    });

    test('invalid input returns null', () => {
      expect(normalizeChoice(null)).toBe(null);
      expect(normalizeChoice(undefined)).toBe(null);
      expect(normalizeChoice(123)).toBe(null);
    });
  });

  describe('recomputeTallyFromBallots', () => {
    test('fixture-style array yields expected counts', () => {
      const ballots = [
        { choice: 'PRO' },
        { choice: 'CONTRA' },
        { choice: 'yes' }
      ];
      const counts = recomputeTallyFromBallots(ballots);
      expect(counts).toEqual({ pro: 2, contra: 1, neutral: 0, total: 3 });
    });

    test('empty array yields zeros', () => {
      expect(recomputeTallyFromBallots([])).toEqual({ pro: 0, contra: 0, neutral: 0, total: 0 });
    });

    test('non-array yields zeros', () => {
      expect(recomputeTallyFromBallots(null)).toEqual({ pro: 0, contra: 0, neutral: 0, total: 0 });
      expect(recomputeTallyFromBallots(undefined)).toEqual({ pro: 0, contra: 0, neutral: 0, total: 0 });
    });

    test('unknown choice excluded from total', () => {
      const ballots = [
        { choice: 'PRO' },
        { choice: 'invalid' },
        { choice: 'CONTRA' }
      ];
      const counts = recomputeTallyFromBallots(ballots);
      expect(counts).toEqual({ pro: 1, contra: 1, neutral: 0, total: 2 });
    });

    test('all three buckets and mixed case', () => {
      const ballots = [
        { choice: 'pro' },
        { choice: 'no' },
        { choice: 'abstain' }
      ];
      const counts = recomputeTallyFromBallots(ballots);
      expect(counts).toEqual({ pro: 1, contra: 1, neutral: 1, total: 3 });
    });
  });

  describe('compareTally', () => {
    test('computed === announced returns match true', () => {
      const computed = { pro: 2, contra: 1, neutral: 0, total: 3 };
      const announced = { pro: 2, contra: 1, neutral: 0, total: 3 };
      expect(compareTally(computed, announced)).toEqual({ match: true });
    });

    test('mismatch returns match false and diff', () => {
      const computed = { pro: 3, contra: 1, neutral: 0, total: 4 };
      const announced = { pro: 2, contra: 1, neutral: 0, total: 3 };
      const result = compareTally(computed, announced);
      expect(result.match).toBe(false);
      expect(result.diff).toEqual({ pro: 1, contra: 0, neutral: 0, total: 1 });
    });

    test('missing announced returns match true', () => {
      const computed = { pro: 1, contra: 0, neutral: 0, total: 1 };
      expect(compareTally(computed, null)).toEqual({ match: true });
      expect(compareTally(computed, undefined)).toEqual({ match: true });
    });

    test('announced with partial fields uses 0 for missing', () => {
      const computed = { pro: 0, contra: 0, neutral: 0, total: 0 };
      expect(compareTally(computed, {})).toEqual({ match: true });
    });
  });
});
