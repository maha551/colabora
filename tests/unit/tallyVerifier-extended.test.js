/**
 * Unit tests for tally verifier (election + meeting option paths).
 */

const {
  recomputeTallyFromBallots,
  compareTally,
  recomputeMeetingOptionCounts,
  compareMeetingOptionCounts,
} = require('../../server/utils/tallyVerifier');

describe('tallyVerifier extended', () => {
  test('recomputeMeetingOptionCounts aggregates by option id', () => {
    const result = recomputeMeetingOptionCounts([
      { choice: 'opt-a' },
      { choice: 'opt-a' },
      { choice: 'opt-b' },
    ]);
    expect(result.total).toBe(3);
    expect(result.optionCounts).toEqual({ 'opt-a': 2, 'opt-b': 1 });
  });

  test('compareMeetingOptionCounts detects mismatch', () => {
    const computed = recomputeMeetingOptionCounts([{ choice: 'opt-a' }, { choice: 'opt-a' }]);
    const match = compareMeetingOptionCounts(computed, { 'opt-a': 1 });
    expect(match.match).toBe(false);
  });

  test('candidate id choices excluded from pro/contra tally', () => {
    const counts = recomputeTallyFromBallots([
      { choice: 'candidate-uuid-1' },
      { choice: 'candidate-uuid-2' },
    ]);
    expect(counts.total).toBe(0);
  });

  test('compareTally still works for pro/contra', () => {
    const computed = recomputeTallyFromBallots([{ choice: 'PRO' }, { choice: 'CONTRA' }]);
    expect(compareTally(computed, { pro: 1, contra: 1, neutral: 0, total: 2 }).match).toBe(true);
  });
});
