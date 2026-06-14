/**
 * Canonical classification of organization_governance_rules fields.
 * Single source of truth for which fields are democratically proposable vs platform-managed.
 */

const { GOVERNANCE_FIELD_MAPPING } = require('./governanceFieldMapping');

/** Fields updated by the platform (bootstrap, recovery, safety telemetry) — not voter-editable */
const SYSTEM_MANAGED_FIELDS = [
  'bootstrapMode',
  'bootstrapCompletedAt',
  'recoveryMode',
  'recoveryModeEnteredAt',
  'recoveryModeReason',
  'lastSuccessfulVoteAt',
  'failedProposalsCount',
  'lastFailedProposalAt',
  'ruleChangesThisMonth',
  'lastRuleChangeAt',
];

/** Metadata columns — never proposal-able */
const METADATA_FIELDS = [
  'id',
  'organizationId',
  'createdAt',
  'updatedAt',
];

/** All governance policy fields that organizations may change via rule proposals */
const PROPOSABLE_POLICY_FIELDS = Object.keys(GOVERNANCE_FIELD_MAPPING);

/** Snake_case DB column names for proposable policy fields */
const PROPOSABLE_POLICY_DB_FIELDS = Object.values(GOVERNANCE_FIELD_MAPPING);

function isProposablePolicyField(fieldName) {
  return PROPOSABLE_POLICY_FIELDS.includes(fieldName);
}

function isSystemManagedField(fieldName) {
  return SYSTEM_MANAGED_FIELDS.includes(fieldName);
}

module.exports = {
  SYSTEM_MANAGED_FIELDS,
  METADATA_FIELDS,
  PROPOSABLE_POLICY_FIELDS,
  PROPOSABLE_POLICY_DB_FIELDS,
  isProposablePolicyField,
  isSystemManagedField,
};
