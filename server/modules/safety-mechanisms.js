/**
 * Safety Mechanism Functions for Democratic Constitution System
 * Handles dynamic quorum calculation, recovery mode, and safety tracking
 */

const { logger } = require('../middleware/logger');
const { v4: uuidv4 } = require('uuid');
const { getRepresentativesCount } = require('./permissions');

/**
 * Calculate minimum quorum based on organization size
 * @param {number} activeMemberCount - Number of active members
 * @returns {number} Minimum number of votes required
 */
function calculateMinimumQuorum(activeMemberCount) {
  if (activeMemberCount <= 5) {
    return Math.max(1, Math.ceil(activeMemberCount * 0.5)); // 50% for tiny orgs
  } else if (activeMemberCount <= 20) {
    return Math.max(2, Math.ceil(activeMemberCount * 0.3)); // 30% for small orgs
  } else {
    return Math.max(5, Math.ceil(activeMemberCount * 0.1)); // 10% for larger orgs
  }
}

/**
 * Get effective quorum for an organization
 * @param {Object} db - Database connection
 * @param {string} organizationId - Organization ID
 * @param {Object} governanceRules - Governance rules (transformed to camelCase)
 * @param {number} activeMemberCount - Number of active members
 * @returns {Promise<{percentage: number, minimumVotes: number, activeMemberCount: number}>}
 */
async function getEffectiveQuorum(db, organizationId, governanceRules, activeMemberCount) {
  const configuredQuorum = governanceRules?.defaultQuorumPercentage || 0.5;
  const minQuorum = governanceRules?.minimumQuorumPercentage || 0.1;
  
  // Calculate minimum based on organization size
  const dynamicMin = calculateMinimumQuorum(activeMemberCount);
  const dynamicMinPercent = dynamicMin / activeMemberCount;
  
  // Use the highest of: configured, system minimum, dynamic minimum
  const effectiveQuorum = Math.max(
    configuredQuorum,
    minQuorum,
    dynamicMinPercent
  );
  
  return {
    percentage: effectiveQuorum,
    minimumVotes: Math.ceil(activeMemberCount * effectiveQuorum),
    activeMemberCount
  };
}

/**
 * Get active member count for organization
 */
async function getActiveMemberCount(knex, organizationId) {
  try {
    const result = await knex.raw(`
      SELECT COUNT(*) as count 
      FROM organization_members 
      WHERE organization_id = ? AND status = 'active'
    `, [organizationId]);
    const row = (result.rows && result.rows[0]) || result[0] || null;
    return row ? Number(row.count) : 0;
  } catch (error) {
    throw error;
  }
}

/**
 * Check if recovery mode conditions are met
 * @param {Object} db - Database connection
 * @param {string} organizationId - Organization ID
 * @returns {Promise<{shouldActivate: boolean, reason?: string, details?: string}>}
 */
async function checkRecoveryModeConditions(knex, organizationId) {
  const rulesResult = await knex.raw(`SELECT id, organization_id, representative_term_months, representative_term_limits, 
    election_voting_method, election_quorum_percentage, election_notice_days, 
    default_voting_deadline_hours, default_quorum_percentage, document_proposal_period_days, 
    threshold_calculation_method, default_acceptance_threshold, anonymous_voting_enabled, 
    vote_change_allowed, default_structure_proposals_enabled, default_voting_anonymity_locked, 
    representative_can_create_votes, representative_can_invite_members, representative_can_manage_documents, 
    representative_approval_required, tamper_proof_enabled, audit_trail_enabled, 
    created_at, updated_at
    FROM organization_governance_rules WHERE organization_id = ?`, [organizationId]);
  const rules = (rulesResult.rows && rulesResult.rows[0]) || rulesResult[0] || null;

  if (!rules) {
    return { shouldActivate: false };
  }

  // Already in recovery mode
  if (rules.recovery_mode === true) {
    return { 
      shouldActivate: false,
      inRecovery: true,
      reason: rules.recovery_mode_reason || 'unknown'
    };
  }

  const representativesCount = await getRepresentativesCount(db, organizationId);
  const hasRepresentatives = representativesCount > 0;
  const membersCanManage = rules.members_can_manage_rule_proposals === 1;

  // Condition 1: No representatives AND members can't manage
  if (!hasRepresentatives && !membersCanManage) {
    return {
      shouldActivate: true,
      reason: 'no_representatives_and_members_cannot_manage',
      details: 'Organization has no representatives and members cannot manage rule proposals'
    };
  }

  // Condition 2: No successful votes in 60 days
  const lastVote = rules.last_successful_vote_at;
  if (lastVote) {
    const daysSince = (Date.now() - new Date(lastVote).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 60) {
      return {
        shouldActivate: true,
        reason: 'no_successful_votes_60_days',
        details: `No successful votes in ${Math.floor(daysSince)} days`
      };
    }
  }

  // Condition 3: Quorum consistently unmet
  const failedCount = rules.failed_proposals_count || 0;
  if (failedCount >= 5) {
    const lastFailed = rules.last_failed_proposal_at;
    if (lastFailed) {
      const daysSince = (Date.now() - new Date(lastFailed).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 30) {
        return {
          shouldActivate: true,
          reason: 'quorum_consistently_unmet',
          details: `${failedCount} failed proposals in last 30 days due to quorum`
        };
      }
    }
  }

  return { shouldActivate: false };
}

/**
 * Activate recovery mode for organization
 * @param {Object} db - Database connection
 * @param {string} organizationId - Organization ID
 * @param {string} reason - Reason code for recovery mode
 * @param {string} details - Detailed description
 * @returns {Promise<void>}
 */
async function activateRecoveryMode(knex, organizationId, reason, details) {
  const now = new Date().toISOString();
  
  try {
    await knex.raw(`
      UPDATE organization_governance_rules SET
        recovery_mode = true,
        recovery_mode_entered_at = ?,
        recovery_mode_reason = ?,
        updated_at = ?
      WHERE organization_id = ?
    `, [now, reason, now, organizationId]);

    // Log audit event (if audit logging function exists)
    logger.info('Recovery mode activated', {
      organizationId,
      reason,
      details,
      activatedAt: now
    });
  } catch (error) {
    logger.error('Error activating recovery mode', { error: error.message, organizationId });
    throw error;
  }
}

/**
 * Update safety tracking after proposal completion
 * @param {Object} db - Database connection
 * @param {string} organizationId - Organization ID
 * @param {boolean} success - Whether the proposal was approved
 * @returns {Promise<void>}
 */
async function updateSafetyTracking(knex, organizationId, success) {
  const now = new Date().toISOString();
  
  try {
    if (success) {
      // Update successful vote tracking
      await knex.raw(`
        UPDATE organization_governance_rules SET
          last_successful_vote_at = ?,
          rule_changes_this_month = rule_changes_this_month + 1,
          last_rule_change_at = ?,
          failed_proposals_count = 0,
          updated_at = ?
        WHERE organization_id = ?
      `, [now, now, now, organizationId]);
    } else {
      // Update failed proposal tracking
      await knex.raw(`
        UPDATE organization_governance_rules SET
          failed_proposals_count = failed_proposals_count + 1,
          last_failed_proposal_at = ?,
          updated_at = ?
        WHERE organization_id = ?
      `, [now, now, organizationId]);
    }
  } catch (error) {
    logger.error('Error updating safety tracking', { 
      error: error.message, 
      organizationId,
      success 
    });
    throw error;
  }
}

/**
 * Reset monthly rule change counter (call at start of each month)
 * @param {Object} db - Database connection
 * @param {string} organizationId - Organization ID
 * @returns {Promise<void>}
 */
async function resetMonthlyRuleChangeCounter(knex, organizationId) {
  try {
    await knex.raw(`
      UPDATE organization_governance_rules SET
        rule_changes_this_month = 0,
        updated_at = ?
      WHERE organization_id = ?
    `, [new Date().toISOString(), organizationId]);
  } catch (error) {
    logger.error('Error resetting monthly counter', { error: error.message, organizationId });
    throw error;
  }
}

module.exports = {
  calculateMinimumQuorum,
  getEffectiveQuorum,
  getActiveMemberCount,
  getRepresentativesCount,
  checkRecoveryModeConditions,
  activateRecoveryMode,
  updateSafetyTracking,
  resetMonthlyRuleChangeCounter
};

