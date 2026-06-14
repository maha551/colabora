/**
 * Unit tests for ballot export utilities (Agent B).
 * Tests anonymization and announced result from ballots.
 */

const {
  VOTE_TYPES,
  mapRowToBallot,
  getAnnouncedResult
} = require('./ballotExport');

describe('ballotExport', () => {
  describe('VOTE_TYPES', () => {
    test('includes all eight vote types', () => {
      expect(VOTE_TYPES).toContain('paragraph');
      expect(VOTE_TYPES).toContain('document');
      expect(VOTE_TYPES).toContain('document_deletion');
      expect(VOTE_TYPES).toContain('document_tree');
      expect(VOTE_TYPES).toContain('structure');
      expect(VOTE_TYPES).toContain('governance_rule');
      expect(VOTE_TYPES).toContain('organization');
      expect(VOTE_TYPES).toContain('representative_election');
      expect(VOTE_TYPES).toHaveLength(8);
    });
  });

  describe('mapRowToBallot', () => {
    test('anonymous: no user_id, user_name, user_email in output', () => {
      const row = {
        id: '1',
        proposal_id: 'p1',
        user_id: 'u1',
        vote: 'PRO',
        created_at: new Date('2025-01-01T12:00:00Z')
      };
      const ballot = mapRowToBallot(row, 'paragraph', 'p1', true);
      expect(ballot).toMatchObject({ contestId: 'p1', choice: 'PRO', createdAt: expect.any(String) });
      expect(ballot).not.toHaveProperty('user_id');
      expect(ballot).not.toHaveProperty('user_name');
      expect(ballot).not.toHaveProperty('user_email');
      expect(ballot).not.toHaveProperty('anonymous_token');
      expect(ballot).not.toHaveProperty('voter_token');
    });

    test('non-anonymous: may include userId', () => {
      const row = {
        id: '1',
        vote_id: 'v1',
        user_id: 'u1',
        vote_choice: 'yes',
        created_at: new Date('2025-01-01T12:00:00Z')
      };
      const ballot = mapRowToBallot(row, 'organization', 'v1', false);
      expect(ballot).toHaveProperty('userId', 'u1');
      expect(ballot).toMatchObject({ contestId: 'v1', choice: 'yes' });
    });

    test('includes voteHash when present', () => {
      const row = {
        id: '1',
        voting_session_id: 's1',
        vote_choice: 'no',
        voted_at: new Date(),
        vote_hash: 'abc123'
      };
      const ballot = mapRowToBallot(row, 'representative_election', 's1', true);
      expect(ballot.voteHash).toBe('abc123');
    });
  });

  describe('getAnnouncedResult (from ballots array)', () => {
    test('computes pro/contra/neutral/total from ballot choices', async () => {
      const ballots = [
        { choice: 'PRO' },
        { choice: 'yes' },
        { choice: 'CONTRA' },
        { choice: 'abstain' }
      ];
      const result = await getAnnouncedResult(null, 'paragraph', 'p1', ballots);
      expect(result).toEqual({ pro: 2, contra: 1, neutral: 1, total: 4 });
    });

    test('empty ballots yields zeros', async () => {
      const result = await getAnnouncedResult(null, 'paragraph', 'p1', []);
      expect(result).toEqual({ pro: 0, contra: 0, neutral: 0, total: 0 });
    });
  });

});
