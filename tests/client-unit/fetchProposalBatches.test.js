jest.mock('../../client/src/lib/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), log: jest.fn() },
}));
jest.mock('../../client/src/lib/api/governance/rule-proposals', () => ({
  ruleProposalsApi: { getRuleProposals: jest.fn() },
}));
jest.mock('../../client/src/lib/api/governance/elections', () => ({
  electionsApi: { getUserElectionVoteStatus: jest.fn() },
}));
jest.mock('../../client/src/lib/api/organizations', () => ({
  organizationsApi: { getOrganizationVotes: jest.fn() },
}));
jest.mock('../../client/src/lib/api/structure-proposals', () => ({
  structureProposalsApi: { getStructureProposals: jest.fn() },
}));
jest.mock('../../client/src/lib/api/document-tree-proposals', () => ({
  documentTreeProposalsApi: { getProposals: jest.fn() },
}));
jest.mock('../../client/src/lib/api/documents', () => ({
  documentsApi: { getDocuments: jest.fn(), getDocument: jest.fn() },
}));

const { ruleProposalsApi } = require('../../client/src/lib/api/governance/rule-proposals');
const { fetchRuleProposalsForOrgs } = require('../../client/src/lib/proposals/fetchProposalBatches');

describe('fetchProposalBatches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('fetchRuleProposalsForOrgs batches one request per distinct org', async () => {
    ruleProposalsApi.getRuleProposals.mockImplementation(async (orgId) => ({
      ruleProposals: [
        { id: `rule-a-${orgId}`, title: 'A', votes: [{ userId: 'u1' }] },
        { id: `rule-b-${orgId}`, title: 'B', votes: [] },
      ],
    }));

    const orgA = 'org-aaa';
    const orgB = 'org-bbb';
    const map = await fetchRuleProposalsForOrgs([orgA, orgA, orgB]);

    expect(ruleProposalsApi.getRuleProposals).toHaveBeenCalledTimes(2);
    expect(ruleProposalsApi.getRuleProposals).toHaveBeenCalledWith(orgA);
    expect(ruleProposalsApi.getRuleProposals).toHaveBeenCalledWith(orgB);

    expect(map.get(`rule-a-${orgA}`)?.votes).toEqual([{ userId: 'u1' }]);
    expect(map.get(`rule-b-${orgB}`)).toBeDefined();
  });

  test('fetchRuleProposalsForOrgs returns empty map for no orgs', async () => {
    const map = await fetchRuleProposalsForOrgs([]);
    expect(map.size).toBe(0);
    expect(ruleProposalsApi.getRuleProposals).not.toHaveBeenCalled();
  });
});
