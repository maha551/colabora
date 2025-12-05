/**
 * Rule Validation Functions for Democratic Constitution System
 * Validates rule values, checks dependencies, detects deadlocks, and checks for duplicates
 */

const { logger } = require('../middleware/logger');

/**
 * Validate governance rule value format
 * @param {string} ruleField - The rule field name
 * @param {any} proposedValue - The proposed value
 * @returns {{valid: boolean, error?: string}}
 */
function validateGovernanceRuleValue(ruleField, proposedValue) {
  // Boolean fields
  const booleanFields = [
    'membersCanProposeRules',
    'membersCanCreateDocuments',
    'membersCanInitializeElections',
    'membersCanInviteMembers',
    'membersCanManageRuleProposals',
    'anonymousVotingEnabled',
    'voteChangeAllowed',
    'representativeCanCreateVotes',
    'representativeCanInviteMembers',
    'representativeCanManageDocuments',
    'representativeApprovalRequired',
    'tamperProofEnabled',
    'auditTrailEnabled'
  ];

  if (booleanFields.includes(ruleField)) {
    if (typeof proposedValue !== 'boolean') {
      return { valid: false, error: `${ruleField} must be a boolean value` };
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
    'minimumQuorumPercentage',
    'minimumApprovalThreshold'
  ];

  if (percentageFields.includes(ruleField)) {
    const num = typeof proposedValue === 'number' ? proposedValue : parseFloat(proposedValue);
    if (isNaN(num) || num < 0 || num > 1) {
      return { valid: false, error: `${ruleField} must be a number between 0 and 1` };
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
    'minimumVotingPeriodHours'
  ];

  if (integerFields.includes(ruleField)) {
    const num = typeof proposedValue === 'number' ? proposedValue : parseInt(proposedValue);
    if (isNaN(num) || num < 0 || !Number.isInteger(num)) {
      return { valid: false, error: `${ruleField} must be a positive integer` };
    }
    return { valid: true };
  }

  // Percentage fields (0-100 range)
  if (ruleField === 'defaultAcceptanceThreshold') {
    const num = typeof proposedValue === 'number' ? proposedValue : parseFloat(proposedValue);
    if (isNaN(num) || num < 0 || num > 100) {
      return { valid: false, error: `${ruleField} must be a number between 0 and 100` };
    }
    return { valid: true };
  }

  // Enum fields
  if (ruleField === 'electionVotingMethod') {
    const validMethods = ['simple_majority', 'ranked_choice', 'approval'];
    if (!validMethods.includes(proposedValue)) {
      return { valid: false, error: `${ruleField} must be one of: ${validMethods.join(', ')}` };
    }
    return { valid: true };
  }

  if (ruleField === 'thresholdCalculationMethod') {
    const validMethods = ['all_votes', 'all_members'];
    if (!validMethods.includes(proposedValue)) {
      return { valid: false, error: `${ruleField} must be one of: ${validMethods.join(', ')}` };
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
 * Get representatives count for organization
 */
function getRepresentativesCount(db, organizationId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT representatives FROM organizations WHERE id = ?', [organizationId], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve(0);

      try {
        const representatives = JSON.parse(row.representatives || '[]');
        resolve(representatives.length);
      } catch (e) {
        resolve(0);
      }
    });
  });
}

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
  const currentRules = await new Promise((resolve, reject) => {
    db.get('SELECT * FROM organization_governance_rules WHERE organization_id = ?', [organizationId], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });

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
 * @returns {Promise<{exists: boolean, message?: string, details?: any}>}
 */
async function checkDuplicateProposal(db, organizationId, ruleField) {
  // Check for active or draft proposals
  const existing = await new Promise((resolve, reject) => {
    db.get(`
      SELECT id, status, created_at 
      FROM governance_rule_proposals
      WHERE organization_id = ? 
        AND current_rule_field = ?
        AND status IN ('draft', 'active')
      ORDER BY created_at DESC
      LIMIT 1
    `, [organizationId, ruleField], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });

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
  const recent = await new Promise((resolve, reject) => {
    db.get(`
      SELECT id, implemented_at, cooldown_until
      FROM governance_rule_proposals
      WHERE organization_id = ?
        AND current_rule_field = ?
        AND status = 'approved'
        AND implemented_at IS NOT NULL
      ORDER BY implemented_at DESC
      LIMIT 1
    `, [organizationId, ruleField], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });

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

