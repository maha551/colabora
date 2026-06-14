process.env.NODE_ENV = 'test';

const GovernanceRulesService = require('../../server/services/governance/GovernanceRulesService');
const ElectionService = require('../../server/services/ElectionService');
const RuleProposalService = require('../../server/services/governance/RuleProposalService');
const governance = require('../../server/services/governance');

describe('GovernanceRulesService', () => {
  test('exports core rules functions', () => {
    expect(typeof GovernanceRulesService.getGovernanceRules).toBe('function');
    expect(typeof GovernanceRulesService.createDefaultGovernanceRules).toBe('function');
    expect(typeof GovernanceRulesService.updateGovernanceRules).toBe('function');
    expect(typeof GovernanceRulesService.getBootstrapStatus).toBe('function');
    expect(typeof GovernanceRulesService.completeBootstrap).toBe('function');
  });

  test('getGovernanceRules uses column fallback when paragraph_proposal_cutoff_days is missing', async () => {
    const orgId = 'org-fallback-test';
    const rowWithoutCutoff = { organization_id: orgId, default_quorum_percentage: 0.5 };
    const db = {
      query: jest.fn()
        .mockRejectedValueOnce(new Error('column paragraph_proposal_cutoff_days does not exist'))
        .mockResolvedValueOnce(rowWithoutCutoff)
    };

    const TransactionManager = require('../../server/database/services/TransactionManager');
    const originalQuery = TransactionManager.query;
    TransactionManager.query = jest.fn()
      .mockRejectedValueOnce(new Error('column paragraph_proposal_cutoff_days does not exist'))
      .mockResolvedValueOnce(rowWithoutCutoff);

    try {
      const rules = await GovernanceRulesService.getGovernanceRules(db, orgId);
      expect(rules).toEqual(expect.objectContaining({
        organization_id: orgId,
        paragraph_proposal_cutoff_days: 7
      }));
    } finally {
      TransactionManager.query = originalQuery;
    }
  });
});

describe('ElectionService election results', () => {
  test('calculateRankedChoiceWinners picks majority winner from public ballots', async () => {
    const electionId = 'election-1';
    const candidates = [
      { id: 'cand-a', user_id: 'user-a' },
      { id: 'cand-b', user_id: 'user-b' }
    ];
    const db = {};
    const queryAll = jest.fn().mockResolvedValue([
      { user_id: 'voter-1', candidate_id: 'cand-a', vote_rank: 1 },
      { user_id: 'voter-2', candidate_id: 'cand-a', vote_rank: 1 },
      { user_id: 'voter-3', candidate_id: 'cand-b', vote_rank: 1 }
    ]);
    const TransactionManager = require('../../server/database/services/TransactionManager');
    const originalQueryAll = TransactionManager.queryAll;
    TransactionManager.queryAll = queryAll;

    try {
      const winners = await ElectionService.calculateRankedChoiceWinners(
        db, electionId, candidates, 1, { anonymousVoting: false }
      );
      expect(winners).toHaveLength(1);
      expect(winners[0].id).toBe('cand-a');
    } finally {
      TransactionManager.queryAll = originalQueryAll;
    }
  });

  test('processElectionResults cancels when quorum is not met', async () => {
    const trx = {};
    const execute = jest.fn().mockResolvedValue(undefined);
    const TransactionManager = require('../../server/database/services/TransactionManager');
    const originalQuery = TransactionManager.query;
    const originalExecute = TransactionManager.execute;
    TransactionManager.query = jest.fn().mockResolvedValue({
      status: 'voting',
      positions_available: 1,
      votes_cast: 0,
      quorum_required: 5,
      anonymous_voting: 0
    });
    TransactionManager.execute = execute;

    try {
      const result = await ElectionService.processElectionResults(
        trx, 'org-1', 'election-1', 'user-1', {}
      );
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/quorum/i);
      expect(execute).toHaveBeenCalledWith(
        trx,
        expect.stringContaining('cancelled'),
        ['election-1']
      );
    } finally {
      TransactionManager.query = originalQuery;
      TransactionManager.execute = originalExecute;
    }
  });
});

describe('RuleProposalService', () => {
  test('exports proposal lifecycle functions', () => {
    expect(typeof RuleProposalService.completeRuleProposal).toBe('function');
    expect(typeof RuleProposalService.createRuleProposal).toBe('function');
    expect(typeof RuleProposalService.updateRuleProposalVoteCounts).toBe('function');
  });

  test('completeRuleProposal rejects when quorum is not met', async () => {
    const db = {};
    const proposal = {
      id: 'prop-1',
      organization_id: 'org-1',
      title: 'Test',
      current_rule_field: 'defaultQuorumPercentage',
      current_rule_value: '0.5',
      proposed_rule_value: '0.6',
      status: 'active',
      snapshot_rules: null,
      threshold_percentage: 75
    };
    const TransactionManager = require('../../server/database/services/TransactionManager');
    const UnifiedVotingService = require('../../server/modules/unified-voting');
    const originalQuery = TransactionManager.query;
    const originalCheckApproval = UnifiedVotingService.checkApproval;

    TransactionManager.query = jest.fn().mockResolvedValue(proposal);
    UnifiedVotingService.checkApproval = jest.fn().mockResolvedValue({
      approved: false,
      quorumMet: false,
      quorumRequired: 10,
      approvalPercentage: 0
    });
    jest.spyOn(UnifiedVotingService, 'aggregateVotes').mockResolvedValue({ proVotes: 0, totalVotes: 1 });
    jest.spyOn(UnifiedVotingService, 'aggregateLegacyVotes').mockResolvedValue({});
    jest.spyOn(UnifiedVotingService, 'combineVoteCounts').mockReturnValue({
      votesYes: 0, votesNo: 0, votesAbstain: 0, totalVotes: 1
    });
    jest.spyOn(UnifiedVotingService, 'getEligibleVoterCount').mockResolvedValue(20);
    jest.spyOn(UnifiedVotingService, 'getGovernanceRules').mockResolvedValue({ defaultQuorumPercentage: 0.5 });

    try {
      await expect(
        RuleProposalService.completeRuleProposal(db, 'org-1', 'prop-1', 'user-1')
      ).rejects.toMatchObject({ code: 'QUORUM_NOT_MET' });
    } finally {
      TransactionManager.query = originalQuery;
      UnifiedVotingService.checkApproval = originalCheckApproval;
      jest.restoreAllMocks();
    }
  });
});

describe('governance barrel and facade', () => {
  test('governance index re-exports domain services', () => {
    expect(typeof governance.getGovernanceRules).toBe('function');
    expect(typeof governance.getPublicAuditLogs).toBe('function');
    expect(typeof governance.completeRuleProposal).toBe('function');
    expect(typeof governance.resignRepresentative).toBe('function');
  });

  test('GovernanceService facade re-exports domain API', () => {
    const GovernanceService = require('../../server/services/GovernanceService');
    expect(typeof GovernanceService.getGovernanceRules).toBe('function');
    expect(typeof GovernanceService.processElectionResults).toBe('function');
    expect(typeof GovernanceService.resignRepresentative).toBe('function');
  });

  test('domain modules load without circular dependency errors', () => {
    expect(() => require('../../server/services/governance')).not.toThrow();
    expect(() => require('../../server/services/GovernanceService')).not.toThrow();
  });
});
