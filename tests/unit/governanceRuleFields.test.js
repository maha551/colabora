const {
  PROPOSABLE_POLICY_FIELDS,
  SYSTEM_MANAGED_FIELDS,
  PROPOSABLE_POLICY_DB_FIELDS,
  isProposablePolicyField,
  isSystemManagedField,
} = require('../../server/utils/governanceRuleFields');
const { getDatabaseFieldName, isValidGovernanceField } = require('../../server/utils/governanceFieldMapping');
const { getFieldWhitelist } = require('../../server/utils/fieldValidation');

describe('governance rule field registry', () => {
  test('includes newly proposable policy fields', () => {
    const expectedNewFields = [
      'minimumVotingPeriodHours',
      'minimumQuorumPercentage',
      'minimumApprovalThreshold',
      'defaultStructureProposalsEnabled',
      'defaultVotingAnonymityLocked',
      'membersCanInitiateMistrustVote',
      'mistrustVoteThreshold',
      'mistrustVoteQuorumPercentage',
    ];
    expectedNewFields.forEach((field) => {
      expect(PROPOSABLE_POLICY_FIELDS).toContain(field);
      expect(isProposablePolicyField(field)).toBe(true);
      expect(isValidGovernanceField(field)).toBe(true);
      expect(getDatabaseFieldName(field)).toBeTruthy();
    });
  });

  test('keeps platform-managed fields out of proposable list', () => {
    SYSTEM_MANAGED_FIELDS.forEach((field) => {
      expect(PROPOSABLE_POLICY_FIELDS).not.toContain(field);
      expect(isSystemManagedField(field)).toBe(true);
    });
  });

  test('field validation whitelist covers all proposable policy DB fields', () => {
    const whitelist = getFieldWhitelist('organization_governance_rules');
    PROPOSABLE_POLICY_DB_FIELDS.forEach((dbField) => {
      expect(whitelist).toContain(dbField);
    });
  });
});
