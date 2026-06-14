const {
  validateGovernanceRuleValue,
  checkRuleDependencies,
  checkDeadlockConditions,
  checkDuplicateProposal,
} = require('../../server/modules/rule-validation');

describe('Rule Validation Module Tests', () => {
  test('should validate governance rule value', () => {
    expect(typeof validateGovernanceRuleValue).toBe('function');

    const result = validateGovernanceRuleValue('defaultQuorumPercentage', 0.5);
    expect(result).toHaveProperty('valid');
    expect(result.valid).toBe(true);
  });

  test('accepts newly proposable policy fields', () => {
    expect(validateGovernanceRuleValue('minimumVotingPeriodHours', 24).valid).toBe(true);
    expect(validateGovernanceRuleValue('minimumQuorumPercentage', 0.1).valid).toBe(true);
    expect(validateGovernanceRuleValue('minimumApprovalThreshold', 0.5).valid).toBe(true);
    expect(validateGovernanceRuleValue('defaultStructureProposalsEnabled', true).valid).toBe(true);
    expect(validateGovernanceRuleValue('defaultVotingAnonymityLocked', false).valid).toBe(true);
    expect(validateGovernanceRuleValue('membersCanInitiateMistrustVote', true).valid).toBe(true);
    expect(validateGovernanceRuleValue('mistrustVoteThreshold', 75).valid).toBe(true);
    expect(validateGovernanceRuleValue('mistrustVoteQuorumPercentage', 0.5).valid).toBe(true);
    expect(validateGovernanceRuleValue('anonymousVotingEnabled', false).valid).toBe(true);
  });

  test('rejects platform-managed fields', () => {
    const systemFields = [
      'bootstrapMode',
      'recoveryMode',
      'lastSuccessfulVoteAt',
      'failedProposalsCount',
    ];
    systemFields.forEach((field) => {
      const result = validateGovernanceRuleValue(field, true);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/system-managed field/i);
    });
  });

  test('should check rule dependencies', () => {
    expect(typeof checkRuleDependencies).toBe('function');
  });

  test('should check deadlock conditions', () => {
    expect(typeof checkDeadlockConditions).toBe('function');

    const result = checkDeadlockConditions('defaultQuorumPercentage', 1.0);
    expect(result.isDeadlock).toBe(true);
  });

  test('should check duplicate proposal', async () => {
    expect(typeof checkDuplicateProposal).toBe('function');

    const mockDb = {
      raw: async () => ({ rows: [] }),
    };

    const result = await checkDuplicateProposal(mockDb, 'org-id', 'minimumVotingPeriodHours');
    expect(result).toHaveProperty('exists');
  });
});
