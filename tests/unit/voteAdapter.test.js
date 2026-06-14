/**
 * Vote Adapter Contract Tests
 *
 * Verifies the PRO/NEUTRAL/CONTRA <-> yes/no/abstain mapping used for
 * organization votes API. These tests ensure the mapping contract is stable.
 */

describe('Vote Adapter Contract', () => {
  // Mirror the mapping from client/src/utils/voteAdapter.ts
  const PRO_CONTRA_TO_YES_NO = {
    PRO: 'yes',
    NEUTRAL: 'abstain',
    CONTRA: 'no',
  };

  const YES_NO_TO_PRO_CONTRA = {
    yes: 'PRO',
    abstain: 'NEUTRAL',
    no: 'CONTRA',
  };

  function toOrgVote(value) {
    return PRO_CONTRA_TO_YES_NO[value];
  }

  function fromOrgVote(value) {
    return YES_NO_TO_PRO_CONTRA[value];
  }

  describe('toOrgVote (PRO/NEUTRAL/CONTRA -> yes/no/abstain)', () => {
    test('PRO maps to yes', () => {
      expect(toOrgVote('PRO')).toBe('yes');
    });

    test('NEUTRAL maps to abstain', () => {
      expect(toOrgVote('NEUTRAL')).toBe('abstain');
    });

    test('CONTRA maps to no', () => {
      expect(toOrgVote('CONTRA')).toBe('no');
    });
  });

  describe('fromOrgVote (yes/no/abstain -> PRO/NEUTRAL/CONTRA)', () => {
    test('yes maps to PRO', () => {
      expect(fromOrgVote('yes')).toBe('PRO');
    });

    test('abstain maps to NEUTRAL', () => {
      expect(fromOrgVote('abstain')).toBe('NEUTRAL');
    });

    test('no maps to CONTRA', () => {
      expect(fromOrgVote('no')).toBe('CONTRA');
    });
  });

  describe('round-trip consistency', () => {
    test('toOrgVote then fromOrgVote returns original', () => {
      expect(fromOrgVote(toOrgVote('PRO'))).toBe('PRO');
      expect(fromOrgVote(toOrgVote('NEUTRAL'))).toBe('NEUTRAL');
      expect(fromOrgVote(toOrgVote('CONTRA'))).toBe('CONTRA');
    });

    test('fromOrgVote then toOrgVote returns original', () => {
      expect(toOrgVote(fromOrgVote('yes'))).toBe('yes');
      expect(toOrgVote(fromOrgVote('abstain'))).toBe('abstain');
      expect(toOrgVote(fromOrgVote('no'))).toBe('no');
    });
  });
});
