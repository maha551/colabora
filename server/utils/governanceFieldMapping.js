/**
 * Governance Rule Field Name Mapping
 * Maps camelCase field names (from frontend) to snake_case database field names
 * 
 * This mapping is used in multiple places:
 * - Rule proposal creation
 * - Rule proposal completion
 * - Governance rules updates
 * 
 * Keep this in sync with the database schema in organization_governance_rules table
 */

const GOVERNANCE_FIELD_MAPPING = {
  // Representative Elections
  'representativeTermMonths': 'representative_term_months',
  'representativeTermLimits': 'representative_term_limits',
  'electionVotingMethod': 'election_voting_method',
  'electionQuorumPercentage': 'election_quorum_percentage',
  'electionNoticeDays': 'election_notice_days',
  
  // General Voting Rules
  'defaultVotingDeadlineHours': 'default_voting_deadline_hours',
  'defaultQuorumPercentage': 'default_quorum_percentage',
  'defaultAcceptanceThreshold': 'default_acceptance_threshold',
  'documentProposalPeriodDays': 'document_proposal_period_days',
  'paragraphProposalCutoffDays': 'paragraph_proposal_cutoff_days',
  'thresholdCalculationMethod': 'threshold_calculation_method',
  'anonymousVotingEnabled': 'anonymous_voting_enabled',
  'voteChangeAllowed': 'vote_change_allowed',
  'defaultStructureProposalsEnabled': 'default_structure_proposals_enabled',
  'defaultVotingAnonymityLocked': 'default_voting_anonymity_locked',

  // Minimum safeguards (organization-configurable floors)
  'minimumQuorumPercentage': 'minimum_quorum_percentage',
  'minimumApprovalThreshold': 'minimum_approval_threshold',
  'minimumVotingPeriodHours': 'minimum_voting_period_hours',

  // Representative Powers
  'representativeCanCreateVotes': 'representative_can_create_votes',
  'representativeCanInviteMembers': 'representative_can_invite_members',
  'representativeCanManageDocuments': 'representative_can_manage_documents',
  'representativeApprovalRequired': 'representative_approval_required',
  
  // Audit & Compliance
  'tamperProofEnabled': 'tamper_proof_enabled',
  'auditTrailEnabled': 'audit_trail_enabled',
  
  // Member Permissions
  'membersCanProposeRules': 'members_can_propose_rules',
  'membersCanProposeRulesThreshold': 'members_can_propose_rules_threshold',
  'membersCanCreateDocuments': 'members_can_create_documents',
  'membersCanCreateDocumentsThreshold': 'members_can_create_documents_threshold',
  'membersCanInitializeElections': 'members_can_initialize_elections',
  'membersCanInitializeElectionsThreshold': 'members_can_initialize_elections_threshold',
  'membersCanInviteMembers': 'members_can_invite_members',
  'membersCanInviteMembersThreshold': 'members_can_invite_members_threshold',
  'membersCanManageRuleProposals': 'members_can_manage_rule_proposals',
  'membersCanManageRuleProposalsThreshold': 'members_can_manage_rule_proposals_threshold',

  // Mistrust vote
  'membersCanInitiateMistrustVote': 'members_can_initiate_mistrust_vote',
  'mistrustVoteThreshold': 'mistrust_vote_threshold',
  'mistrustVoteQuorumPercentage': 'mistrust_vote_quorum_percentage',

  // Participation graph (Phase 2+)
  'participationGraphEnabled': 'participation_graph_enabled',
  'subgroupsEnabled': 'subgroups_enabled',
  'subgroupCreationRequiresVote': 'subgroup_creation_requires_vote',
  'membersCanProposeSubgroupCreation': 'members_can_propose_subgroup_creation',
  'maxSubgroupDepth': 'max_subgroup_depth',
  'defaultSubgroupVisibility': 'default_subgroup_visibility',
  'childDissolutionPolicy': 'child_dissolution_policy',
};

/**
 * Get database field name from camelCase field name
 * @param {string} camelCaseField - Field name in camelCase
 * @returns {string|null} Database field name in snake_case, or null if not found
 */
function getDatabaseFieldName(fieldName) {
  if (GOVERNANCE_FIELD_MAPPING[fieldName]) {
    return GOVERNANCE_FIELD_MAPPING[fieldName];
  }
  if (Object.values(GOVERNANCE_FIELD_MAPPING).includes(fieldName)) {
    return fieldName;
  }
  return null;
}

/**
 * Get camelCase field name from database field name
 * @param {string} dbField - Database field name in snake_case
 * @returns {string|null} Field name in camelCase, or null if not found
 */
function getCamelCaseFieldName(dbField) {
  const entry = Object.entries(GOVERNANCE_FIELD_MAPPING).find(([_, value]) => value === dbField);
  return entry ? entry[0] : null;
}

/**
 * Check if a field name is a valid governance rule field
 * @param {string} fieldName - Field name to check (camelCase or snake_case)
 * @returns {boolean} True if field is valid
 */
function isValidGovernanceField(fieldName) {
  // Check camelCase
  if (GOVERNANCE_FIELD_MAPPING[fieldName]) {
    return true;
  }
  // Check snake_case
  return Object.values(GOVERNANCE_FIELD_MAPPING).includes(fieldName);
}

/**
 * Get all valid field names (camelCase)
 * @returns {string[]} Array of valid camelCase field names
 */
function getAllValidFields() {
  return Object.keys(GOVERNANCE_FIELD_MAPPING);
}

/**
 * Transform governance rules from snake_case (database) to camelCase
 * @param {Object} rules - Rules object with snake_case keys
 * @returns {Object} Rules object with camelCase keys
 */
function transformRulesToCamelCase(rules) {
  if (!rules || typeof rules !== 'object') {
    return rules;
  }

  const transformed = {};
  for (const [camelKey, snakeKey] of Object.entries(GOVERNANCE_FIELD_MAPPING)) {
    if (rules.hasOwnProperty(snakeKey)) {
      transformed[camelKey] = rules[snakeKey];
    }
  }
  
  // Also copy any fields that are already in camelCase or don't have a mapping
  for (const key in rules) {
    if (!GOVERNANCE_FIELD_MAPPING[key] && !Object.values(GOVERNANCE_FIELD_MAPPING).includes(key)) {
      transformed[key] = rules[key];
    }
  }

  return transformed;
}

module.exports = {
  GOVERNANCE_FIELD_MAPPING,
  getDatabaseFieldName,
  getCamelCaseFieldName,
  isValidGovernanceField,
  getAllValidFields,
  transformRulesToCamelCase
};

