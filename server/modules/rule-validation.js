/**
 * Rule Validation Functions for Democratic Constitution System
 * Validates rule values, checks dependencies, detects deadlocks, and checks for duplicates
 */

const { logger } = require('../middleware/logger');
const { getRepresentativesCount } = require('./permissions');
const { SYSTEM_MANAGED_FIELDS } = require('../utils/governanceRuleFields');

/**
 * Validate governance rule value format
 * @param {string} ruleField - The rule field name
 * @param {any} proposedValue - The proposed value
 * @returns {{valid: boolean, error?: string}}
 */
function validateGovernanceRuleValue(ruleField, proposedValue) {
  if (SYSTEM_MANAGED_FIELDS.includes(ruleField)) {
    return { valid: false, error: `${ruleField} is a system-managed field and cannot be changed via rule proposals` };
  }

  // Boolean fields
  const booleanFields = [
    'membersCanProposeRules',
    'membersCanCreateDocuments',
    'membersCanInitializeElections',
    'membersCanInviteMembers',
    'membersCanManageRuleProposals',
    'membersCanInitiateMistrustVote',
    'anonymousVotingEnabled',
    'voteChangeAllowed',
    'representativeCanCreateVotes',
    'representativeCanInviteMembers',
    'representativeCanManageDocuments',
    'representativeApprovalRequired',
    'tamperProofEnabled',
    'auditTrailEnabled',
    'defaultStructureProposalsEnabled',
    'defaultVotingAnonymityLocked',
  ];

  if (booleanFields.includes(ruleField)) {
    // Handle type coercion attacks - reject string "true"/"false", numbers, null, undefined
    if (proposedValue === null || proposedValue === undefined) {
      return { valid: false, error: `${ruleField} cannot be null or undefined` };
    }
    
    // Strict boolean check - reject string "true", number 1, etc.
    if (typeof proposedValue !== 'boolean') {
      return { valid: false, error: `${ruleField} must be a boolean value (true or false), received type: ${typeof proposedValue}, value: ${proposedValue}` };
    }
    
    return { valid: true };
  }

  // Percentage fields (0-1 range)
  const percentageFields = [
    'membersCanProposeRulesThreshold',
    'membersCanCreateDocumentsThreshold',
    'membersCanInitializeElectionsThreshold',
    'membersCanInviteMembersThreshold',
    'membersCanManageRuleProposalsThreshold',
    'electionQuorumPercentage',
    'defaultQuorumPercentage',
    'mistrustVoteQuorumPercentage',
    'minimumQuorumPercentage',
    'minimumApprovalThreshold'
  ];

  if (percentageFields.includes(ruleField)) {
    // Handle type coercion attacks - ensure it's actually a number
    if (proposedValue === null || proposedValue === undefined) {
      return { valid: false, error: `${ruleField} cannot be null or undefined` };
    }
    
    // Reject non-numeric types (except numbers and numeric strings)
    if (typeof proposedValue !== 'number' && typeof proposedValue !== 'string') {
      return { valid: false, error: `${ruleField} must be a number, received type: ${typeof proposedValue}` };
    }
    
    const num = typeof proposedValue === 'number' ? proposedValue : parseFloat(String(proposedValue));
    
    // Check for NaN, Infinity, or invalid conversions
    if (isNaN(num) || !isFinite(num)) {
      return { valid: false, error: `${ruleField} must be a valid number, received: ${proposedValue}` };
    }
    
    // Check for negative values
    if (num < 0) {
      return { valid: false, error: `${ruleField} cannot be negative, received: ${num}` };
    }
    
    // Check range
    if (num > 1) {
      return { valid: false, error: `${ruleField} must be between 0 and 1, received: ${num}` };
    }
    
    return { valid: true };
  }

  // Integer fields
  const integerFields = [
    'representativeTermMonths',
    'representativeTermLimits',
    'electionNoticeDays',
    'defaultVotingDeadlineHours',
    'documentProposalPeriodDays',
    'paragraphProposalCutoffDays',
    'minimumVotingPeriodHours'
  ];

  if (integerFields.includes(ruleField)) {
    // Handle type coercion attacks - ensure it's actually a number
    if (proposedValue === null || proposedValue === undefined) {
      return { valid: false, error: `${ruleField} cannot be null or undefined` };
    }
    
    // Reject non-numeric types (except numbers and numeric strings)
    if (typeof proposedValue !== 'number' && typeof proposedValue !== 'string') {
      return { valid: false, error: `${ruleField} must be a number, received type: ${typeof proposedValue}` };
    }
    
    const num = typeof proposedValue === 'number' ? proposedValue : parseInt(String(proposedValue), 10);
    
    // Check for NaN or invalid conversions
    if (isNaN(num) || !isFinite(num)) {
      return { valid: false, error: `${ruleField} must be a valid integer, received: ${proposedValue}` };
    }
    
    // Check for negative values
    if (num < 0) {
      return { valid: false, error: `${ruleField} cannot be negative, received: ${num}` };
    }
    
    // Check if it's actually an integer (not a float)
    if (!Number.isInteger(num)) {
      return { valid: false, error: `${ruleField} must be an integer, received: ${num}` };
    }
    
    // Field-specific range validation
    if (ruleField === 'representativeTermMonths' && (num < 1 || num > 120)) {
      return { valid: false, error: `${ruleField} must be between 1 and 120 months` };
    }
    if (ruleField === 'defaultVotingDeadlineHours' && (num < 1 || num > 720)) {
      return { valid: false, error: `${ruleField} must be between 1 and 720 hours` };
    }
    if (ruleField === 'documentProposalPeriodDays' && (num < 1 || num > 3650)) {
      return { valid: false, error: `${ruleField} must be between 1 and 3650 days` };
    }
    if (ruleField === 'paragraphProposalCutoffDays' && (num < 0 || num > 365)) {
      return { valid: false, error: `${ruleField} must be between 0 and 365 days` };
    }
    if (ruleField === 'minimumVotingPeriodHours' && (num < 1 || num > 720)) {
      return { valid: false, error: `${ruleField} must be between 1 and 720 hours` };
    }
    
    return { valid: true };
  }

  // Percentage fields (0-100 range)
  const percentage100Fields = ['defaultAcceptanceThreshold', 'mistrustVoteThreshold'];
  if (percentage100Fields.includes(ruleField)) {
    // Handle type coercion attacks
    if (proposedValue === null || proposedValue === undefined) {
      return { valid: false, error: `${ruleField} cannot be null or undefined` };
    }
    
    if (typeof proposedValue !== 'number' && typeof proposedValue !== 'string') {
      return { valid: false, error: `${ruleField} must be a number, received type: ${typeof proposedValue}` };
    }
    
    const num = typeof proposedValue === 'number' ? proposedValue : parseFloat(String(proposedValue));
    
    if (isNaN(num) || !isFinite(num)) {
      return { valid: false, error: `${ruleField} must be a valid number, received: ${proposedValue}` };
    }
    
    if (num < 0) {
      return { valid: false, error: `${ruleField} cannot be negative, received: ${num}` };
    }
    
    if (num > 100) {
      return { valid: false, error: `${ruleField} must be between 0 and 100, received: ${num}` };
    }
    
    return { valid: true };
  }

  // Enum fields
  if (ruleField === 'electionVotingMethod') {
    // Handle type coercion - must be a string
    if (proposedValue === null || proposedValue === undefined) {
      return { valid: false, error: `${ruleField} cannot be null or undefined` };
    }
    
    if (typeof proposedValue !== 'string') {
      return { valid: false, error: `${ruleField} must be a string, received type: ${typeof proposedValue}` };
    }
    
    const validMethods = ['simple_majority', 'ranked_choice', 'approval'];
    const normalizedValue = proposedValue.trim().toLowerCase();
    
    // Check against normalized values
    const validNormalized = validMethods.map(m => m.toLowerCase());
    if (!validNormalized.includes(normalizedValue)) {
      return { valid: false, error: `${ruleField} must be one of: ${validMethods.join(', ')}, received: ${proposedValue}` };
    }
    
    return { valid: true };
  }

  if (ruleField === 'thresholdCalculationMethod') {
    // Handle type coercion - must be a string
    if (proposedValue === null || proposedValue === undefined) {
      return { valid: false, error: `${ruleField} cannot be null or undefined` };
    }
    
    if (typeof proposedValue !== 'string') {
      return { valid: false, error: `${ruleField} must be a string, received type: ${typeof proposedValue}` };
    }
    
    const validMethods = ['all_votes', 'all_members'];
    const normalizedValue = proposedValue.trim().toLowerCase();
    
    // Check against normalized values
    const validNormalized = validMethods.map(m => m.toLowerCase());
    if (!validNormalized.includes(normalizedValue)) {
      return { valid: false, error: `${ruleField} must be one of: ${validMethods.join(', ')}, received: ${proposedValue}` };
    }
    
    return { valid: true };
  }

  // Unknown field
  return { valid: false, error: `Unknown rule field: ${ruleField}` };
}

/**
 * Rule dependencies configuration
 */
const ruleDependencies = {
  membersCanCreateDocuments: {
    requires: [
      {
        condition: 'or',
        rules: [
          { field: 'membersCanCreateDocuments', value: true },
          { field: 'representativeCanManageDocuments', value: true }
        ]
      }
    ],
    error: 'At least one group (members or representatives) must be able to create documents'
  },
  membersCanProposeRules: {
    requires: [
      {
        condition: 'or',
        rules: [
          { field: 'membersCanProposeRules', value: true },
          { field: 'atLeastOneRepresentative', value: true }
        ]
      }
    ],
    error: 'Either members must be able to propose rules, or at least one representative must exist'
  },
  membersCanManageRuleProposals: {
    requires: [
      {
        condition: 'or',
        rules: [
          { field: 'membersCanManageRuleProposals', value: true },
          { field: 'atLeastOneRepresentative', value: true }
        ]
      }
    ],
    error: 'Either members must be able to manage rule proposals, or at least one representative must exist'
  }
};

/**
 * Check rule dependencies
 * @param {Object} db - Database connection
 * @param {string} organizationId - Organization ID
 * @param {string} ruleField - Rule field being changed
 * @param {any} proposedValue - Proposed value
 * @returns {Promise<{valid: boolean, error?: string, details?: any}>}
 */
async function checkRuleDependencies(db, organizationId, ruleField, proposedValue) {
  const dependencies = ruleDependencies[ruleField];
  if (!dependencies) {
    return { valid: true };
  }

  // Get current rules
  const result = await db.raw(`SELECT id, organization_id, representative_term_months, representative_term_limits, 
    election_voting_method, election_quorum_percentage, election_notice_days, 
    default_voting_deadline_hours, default_quorum_percentage, document_proposal_period_days, 
    threshold_calculation_method, default_acceptance_threshold, anonymous_voting_enabled, 
    vote_change_allowed, default_structure_proposals_enabled, default_voting_anonymity_locked, 
    representative_can_create_votes, representative_can_invite_members, representative_can_manage_documents, 
    representative_approval_required, tamper_proof_enabled, audit_trail_enabled, 
    created_at, updated_at
    FROM organization_governance_rules WHERE organization_id = ?`, [organizationId]);
  const currentRules = result.rows?.[0] || result[0] || null;

  if (!currentRules) {
    return { valid: true }; // No rules exist yet, allow
  }

  // Transform to camelCase for easier access
  const rules = {
    membersCanCreateDocuments: currentRules.members_can_create_documents === 1,
    membersCanProposeRules: currentRules.members_can_propose_rules === 1,
    membersCanManageRuleProposals: currentRules.members_can_manage_rule_proposals === 1,
    representativeCanManageDocuments: currentRules.representative_can_manage_documents === 1
  };

  // Get representatives count
  const representativesCount = await getRepresentativesCount(db, organizationId);
  const hasRepresentatives = representativesCount > 0;

  // Create test rules object with proposed change
  const testRules = { ...rules };
  if (ruleField === 'membersCanCreateDocuments') {
    testRules.membersCanCreateDocuments = proposedValue;
  } else if (ruleField === 'membersCanProposeRules') {
    testRules.membersCanProposeRules = proposedValue;
  } else if (ruleField === 'membersCanManageRuleProposals') {
    testRules.membersCanManageRuleProposals = proposedValue;
  }

  // Check each requirement
  for (const requirement of dependencies.requires) {
    let requirementMet = false;

    if (requirement.condition === 'or') {
      requirementMet = requirement.rules.some(rule => {
        if (rule.field === 'atLeastOneRepresentative') {
          return hasRepresentatives === rule.value;
        }
        return testRules[rule.field] === rule.value;
      });
    } else if (requirement.condition === 'and') {
      requirementMet = requirement.rules.every(rule => {
        if (rule.field === 'atLeastOneRepresentative') {
          return hasRepresentatives === rule.value;
        }
        return testRules[rule.field] === rule.value;
      });
    }

    if (requirementMet) {
      return { valid: true };
    }
  }

  return {
    valid: false,
    error: dependencies.error,
    details: {
      ruleField,
      proposedValue,
      currentRules: rules,
      hasRepresentatives
    }
  };
}

/**
 * Check for deadlock conditions
 * @param {string} ruleField - Rule field being changed
 * @param {any} proposedValue - Proposed value
 * @returns {{isDeadlock: boolean, message?: string, details?: any}}
 */
function checkDeadlockConditions(ruleField, proposedValue) {
  // Check for 100% thresholds that would make voting impossible
  const thresholdFields = [
    'membersCanProposeRulesThreshold',
    'membersCanCreateDocumentsThreshold',
    'membersCanInitializeElectionsThreshold',
    'membersCanInviteMembersThreshold',
    'membersCanManageRuleProposalsThreshold',
    'electionQuorumPercentage',
    'defaultQuorumPercentage',
    'minimumQuorumPercentage',
    'minimumApprovalThreshold'
  ];

  if (thresholdFields.includes(ruleField)) {
    if (proposedValue === 1.0 || proposedValue === 100) {
      return {
        isDeadlock: true,
        message: `Setting ${ruleField} to 100% would require unanimous approval, which may be impossible to achieve`,
        details: {
          ruleField,
          proposedValue,
          warning: 'Consider a lower threshold to allow for more flexible decision-making'
        }
      };
    }
  }

  // Check for 0% thresholds that would make voting meaningless
  if (thresholdFields.includes(ruleField)) {
    if (proposedValue === 0 || proposedValue === 0.0) {
      return {
        isDeadlock: false, // Not a deadlock, but a warning
        message: `Setting ${ruleField} to 0% would allow changes with no approval required`,
        details: {
          ruleField,
          proposedValue,
          warning: 'This may not provide adequate protection for important decisions'
        }
      };
    }
  }

  return { isDeadlock: false };
}

/**
 * Check for duplicate proposals (including cooldown)
 * @param {Object} db - Database connection
 * @param {string} organizationId - Organization ID
 * @param {string} ruleField - Rule field
 * @param {string} [excludeProposalId] - Proposal ID to exclude (e.g. when completing that proposal)
 * @returns {Promise<{exists: boolean, message?: string, details?: any}>}
 */
async function checkDuplicateProposal(db, organizationId, ruleField, excludeProposalId = null) {
  // Check for active or draft proposals
  let existing = null;
  try {
    const params = [organizationId, ruleField];
    if (excludeProposalId) params.push(excludeProposalId);
    const excludeClause = excludeProposalId ? ' AND id != ?' : '';
    const result = await db.raw(`
      SELECT id, status, created_at 
      FROM governance_rule_proposals
      WHERE organization_id = ? 
        AND current_rule_field = ?
        AND status IN ('draft', 'active')
        ${excludeClause}
      ORDER BY created_at DESC
      LIMIT 1
    `, params);
    existing = result.rows?.[0] || result[0] || null;
  } catch (err) {
    // If table doesn't exist, treat as no existing proposals
    if (err.code === 'SQLITE_ERROR' && err.message && err.message.includes('no such table')) {
      existing = null;
    } else {
      throw err;
    }
  }

  if (existing) {
    return {
      exists: true,
      message: `A ${existing.status} proposal for this rule already exists`,
      details: {
        proposalId: existing.id,
        status: existing.status,
        createdAt: existing.created_at
      }
    };
  }

  // Check for recent changes (cooldown period: 7 days)
  let recent = null;
  try {
    const result = await db.raw(`
      SELECT id, implemented_at, cooldown_until
      FROM governance_rule_proposals
      WHERE organization_id = ?
        AND current_rule_field = ?
        AND status = 'approved'
        AND implemented_at IS NOT NULL
      ORDER BY implemented_at DESC
      LIMIT 1
    `, [organizationId, ruleField]);
    recent = result.rows?.[0] || result[0] || null;
  } catch (err) {
    // If table doesn't exist, treat as no recent changes
    if (err.code === 'SQLITE_ERROR' && err.message && err.message.includes('no such table')) {
      recent = null;
    } else {
      throw err;
    }
  }

  if (recent) {
    const implemented = new Date(recent.implemented_at);
    const now = new Date();
    const daysSince = (now.getTime() - implemented.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSince < 7) {
      const daysRemaining = Math.ceil(7 - daysSince);
      return {
        exists: true,
        message: `This rule was changed ${Math.floor(daysSince)} days ago. Please wait ${daysRemaining} more day(s) before proposing another change (7-day cooldown period).`,
        details: {
          proposalId: recent.id,
          implementedAt: recent.implemented_at,
          daysSince: Math.floor(daysSince),
          daysRemaining
        }
      };
    }
  }

  return { exists: false };
}

module.exports = {
  validateGovernanceRuleValue,
  checkRuleDependencies,
  checkDeadlockConditions,
  checkDuplicateProposal
};

