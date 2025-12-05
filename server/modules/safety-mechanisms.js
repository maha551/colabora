/**
 * Safety Mechanism Functions for Democratic Constitution System
 * Handles dynamic quorum calculation, recovery mode, and safety tracking
 */

const { logger } = require('../middleware/logger');
const { v4: uuidv4 } = require('uuid');

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
function getActiveMemberCount(db, organizationId) {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT COUNT(*) as count 
      FROM organization_members 
      WHERE organization_id = ? AND status = 'active'
    `, [organizationId], (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.count : 0);
    });
  });
}

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
 * Check if recovery mode conditions are met
 * @param {Object} db - Database connection
 * @param {string} organizationId - Organization ID
 * @returns {Promise<{shouldActivate: boolean, reason?: string, details?: string}>}
 */
async function checkRecoveryModeConditions(db, organizationId) {
  const rules = await new Promise((resolve, reject) => {
    db.get('SELECT * FROM organization_governance_rules WHERE organization_id = ?', [organizationId], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });

  if (!rules) {
    return { shouldActivate: false };
  }

  // Already in recovery mode
  if (rules.recovery_mode === 1) {
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
async function activateRecoveryMode(db, organizationId, reason, details) {
  const now = new Date().toISOString();
  
  return new Promise((resolve, reject) => {
    db.run(`
      UPDATE organization_governance_rules SET
        recovery_mode = 1,
        recovery_mode_entered_at = ?,
        recovery_mode_reason = ?,
        updated_at = ?
      WHERE organization_id = ?
    `, [now, reason, now, organizationId], function(err) {
      if (err) {
        logger.error('Error activating recovery mode', { error: err.message, organizationId });
        return reject(err);
      }

      // Log audit event (if audit logging function exists)
      logger.info('Recovery mode activated', {
        organizationId,
        reason,
        details,
        activatedAt: now
      });

      resolve();
    });
  });
}

/**
 * Update safety tracking after proposal completion
 * @param {Object} db - Database connection
 * @param {string} organizationId - Organization ID
 * @param {boolean} success - Whether the proposal was approved
 * @returns {Promise<void>}
 */
async function updateSafetyTracking(db, organizationId, success) {
  const now = new Date().toISOString();
  
  if (success) {
    // Update successful vote tracking
    return new Promise((resolve, reject) => {
      db.run(`
        UPDATE organization_governance_rules SET
          last_successful_vote_at = ?,
          rule_changes_this_month = rule_changes_this_month + 1,
          last_rule_change_at = ?,
          failed_proposals_count = 0,
          updated_at = ?
        WHERE organization_id = ?
      `, [now, now, now, organizationId], function(err) {
        if (err) {
          logger.error('Error updating safety tracking (success)', { error: err.message, organizationId });
          return reject(err);
        }
        resolve();
      });
    });
  } else {
    // Update failed proposal tracking
    return new Promise((resolve, reject) => {
      db.run(`
        UPDATE organization_governance_rules SET
          failed_proposals_count = failed_proposals_count + 1,
          last_failed_proposal_at = ?,
          updated_at = ?
        WHERE organization_id = ?
      `, [now, now, organizationId], function(err) {
        if (err) {
          logger.error('Error updating safety tracking (failure)', { error: err.message, organizationId });
          return reject(err);
        }
        resolve();
      });
    });
  }
}

/**
 * Reset monthly rule change counter (call at start of each month)
 * @param {Object} db - Database connection
 * @param {string} organizationId - Organization ID
 * @returns {Promise<void>}
 */
async function resetMonthlyRuleChangeCounter(db, organizationId) {
  return new Promise((resolve, reject) => {
    db.run(`
      UPDATE organization_governance_rules SET
        rule_changes_this_month = 0,
        updated_at = ?
      WHERE organization_id = ?
    `, [new Date().toISOString(), organizationId], function(err) {
      if (err) {
        logger.error('Error resetting monthly counter', { error: err.message, organizationId });
        return reject(err);
      }
      resolve();
    });
  });
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

