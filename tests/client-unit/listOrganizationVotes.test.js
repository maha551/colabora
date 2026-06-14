jest.mock('../../server/database/services/TransactionManager', () => ({
  queryAll: jest.fn(),
  query: jest.fn(),
  execute: jest.fn(),
  executeInTransaction: jest.fn(),
}));

const TransactionManager = require('../../server/database/services/TransactionManager');
const OrganizationService = require('../../server/services/OrganizationService');

describe('listOrganizationVotes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('maps user vote choice from ballot join', async () => {
    TransactionManager.queryAll.mockResolvedValue([
      {
        id: 'vote-1',
        organization_id: 'org-1',
        title: 'Policy vote',
        description: null,
        vote_type: 'policy',
        proposed_by_user_id: 'user-a',
        approved_by_rep_id: null,
        threshold: 0.5,
        status: 'approved',
        voting_starts_at: null,
        voting_ends_at: null,
        target_document_id: null,
        result_yes: 1,
        result_no: 0,
        result_abstain: 0,
        created_at: '2026-01-01T00:00:00.000Z',
        user_vote_choice: 'yes',
      },
    ]);

    const result = await OrganizationService.listOrganizationVotes({}, 'org-1', 'user-b');

    expect(TransactionManager.queryAll).toHaveBeenCalledWith(
      {},
      expect.stringContaining('vote_ballots'),
      ['user-b', 'org-1']
    );
    expect(result.votes).toHaveLength(1);
    expect(result.votes[0].userVoteChoice).toBe('yes');
    expect(result.votes[0].organizationId).toBe('org-1');
    expect(result.votes[0].resultYes).toBe(1);
  });
});
