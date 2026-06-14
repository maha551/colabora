/**
 * RuleProposalService - governance rule proposal lifecycle.
 */

const { v4: uuidv4 } = require('uuid');
const TransactionManager = require('../../database/services/TransactionManager');
const { logger } = require('../../middleware/logger');
const { ApiError } = require('../../middleware/errorHandler');
const UnifiedVotingService = require('../../modules/unified-voting');
const { safeJsonParse } = require('../../utils/jsonUtils');
const votingLockManager = require('../../utils/votingLocks');
const voteVerificationLog = require('../../utils/voteVerificationLog');
const { generateReceiptId, computeVoteHash } = require('../../utils/voteReceipt');
const { isActiveMember, canManageRuleProposals } = require('../../modules/permissions');
const { getUserOrganizationStatus } = require('../../utils/permissionUtils');
const { broadcastOrganizationUpdate } = require('../../utils/websocketBroadcast');
const { validateStatusTransition, getStatusInfo } = require('../../utils/governanceStatus');
const { calculateVoteCounts, validateVoteCounts, normalizeVoteValue } = require('../../utils/voteCounts');
const { logAudit } = require('../../utils/auditLog');

const GovernanceRulesService = require('./GovernanceRulesService');

async function getGovernanceRules(db, organizationId) {
  return GovernanceRulesService.getGovernanceRules(db, organizationId);
}

async function completeRuleProposal(db, organizationId, proposalId, userId) {
  const proposal = await TransactionManager.query(db, `
    SELECT id, organization_id, title, description, current_rule_field, current_rule_value,
      proposed_rule_value, status, snapshot_rules, created_by, created_at
    FROM governance_rule_proposals
    WHERE id = ? AND organization_id = ? AND status = 'active'
  `, [proposalId, organizationId]);

  if (!proposal) {
    throw ApiError.notFound('Proposal not found or not active');
  }

  let governanceRules = null;
  try {
    if (proposal.snapshot_rules) {
      const snapshotRulesRaw = safeJsonParse(proposal.snapshot_rules, null);
      if (snapshotRulesRaw) {
        const { transformRulesToCamelCase } = require('../../utils/governanceFieldMapping');
        governanceRules = transformRulesToCamelCase(snapshotRulesRaw);
      }
    }
    if (!governanceRules) {
      governanceRules = await UnifiedVotingService.getGovernanceRules(db, organizationId);
    }
  } catch (rulesErr) {
    logger.warn('Error getting governance rules for completion', { error: rulesErr.message, proposalId, organizationId });
  }

  const voteAggregation = await UnifiedVotingService.aggregateVotes(db, 'governance_rule_proposal_votes', 'proposal_id', proposalId);
  const legacyCounts = await UnifiedVotingService.aggregateLegacyVotes(db, 'governance_rule_proposal_votes', 'proposal_id', proposalId);
  const { votesYes, votesNo, votesAbstain, totalVotes } = UnifiedVotingService.combineVoteCounts(voteAggregation, legacyCounts);
  const totalVoters = proposal.total_voters || await UnifiedVotingService.getEligibleVoterCount(db, organizationId, 'organization');
  const threshold = proposal.threshold_percentage || 75.0;

  const approvalResult = await UnifiedVotingService.checkApproval({
    db,
    proposalId,
    organizationId,
    proVotes: votesYes,
    totalVotes,
    totalEligible: totalVoters,
    acceptanceThreshold: threshold,
    calculationMethod: governanceRules?.thresholdCalculationMethod || null,
    quorumPercentage: governanceRules?.defaultQuorumPercentage !== undefined ? governanceRules.defaultQuorumPercentage : null
  });

  const completionTime = new Date();
  const approvalRate = approvalResult.approvalPercentage;

  if (!approvalResult.quorumMet) {
    throw ApiError.validation('Minimum quorum not met', {
      message: `Required: ${approvalResult.quorumRequired} votes, Actual: ${totalVotes} votes`,
      quorumMet: false,
      quorumRequired: approvalResult.quorumRequired,
      actualVotes: totalVotes
    }, 'QUORUM_NOT_MET');
  }

  if (!approvalResult.approved) {
    await TransactionManager.query(db, `
      UPDATE governance_rule_proposals SET status = 'rejected', updated_at = ?
      WHERE id = ? AND organization_id = ?
    `, [completionTime.toISOString(), proposalId, organizationId]);
    return { approved: false, proposal, approvalResult, threshold, approvalRate, completionTime };
  }

  const currentRules = await getGovernanceRules(db, organizationId);
    const fieldName = proposal.current_rule_field;
    const { getDatabaseFieldName, isValidGovernanceField, transformRulesToCamelCase } = require('../../utils/governanceFieldMapping');
    let currentRulesCamel = currentRules;
    if (currentRules && !currentRules.defaultAcceptanceThreshold && currentRules.default_acceptance_threshold !== undefined) {
      currentRulesCamel = transformRulesToCamelCase(currentRules);
    }
    const snapshotRulesParsed = proposal.snapshot_rules ? safeJsonParse(proposal.snapshot_rules, null) : null;
    const snapshotRulesCamel = snapshotRulesParsed ? transformRulesToCamelCase(snapshotRulesParsed) : null;
    const snapshotValue = snapshotRulesCamel ? snapshotRulesCamel[fieldName] : null;
    const currentValue = currentRulesCamel ? currentRulesCamel[fieldName] : null;
    const normalizeValue = (val) => {
      if (val === 1 || val === true) return true;
      if (val === 0 || val === false) return false;
      return val;
    };
    if (JSON.stringify(normalizeValue(snapshotValue)) !== JSON.stringify(normalizeValue(currentValue))) {
      throw ApiError.conflict('Rule has changed since proposal was created', {
        message: `The ${fieldName} rule was modified after this proposal was created.`,
        field: fieldName
      }, 'RULE_CHANGED');
    }

    const { validateRuleChange } = require('../../utils/ruleValidation');
    const proposedValue = safeJsonParse(proposal.proposed_rule_value, null);
    await validateRuleChange(db, organizationId, proposal.current_rule_field, proposedValue, { mode: 'throw', excludeProposalId: proposalId });

    if (!isValidGovernanceField(fieldName)) {
      throw ApiError.validation(`Field "${fieldName}" is not a valid proposal-able governance rule`);
    }
    const dbFieldName = getDatabaseFieldName(fieldName);
    const updates = {};
    updates[dbFieldName] = typeof proposedValue === 'boolean' ? (proposedValue ? 1 : 0) : proposedValue;
    const { validateFieldNames, getFieldWhitelist } = require('../../utils/fieldValidation');
    validateFieldNames(Object.keys(updates), getFieldWhitelist('organization_governance_rules'));
    const updateFields = Object.keys(updates);
    const updateValues = Object.values(updates);
    const setClause = updateFields.map(f => `${f} = ?`).join(', ');

    await votingLockManager.withVoteLock('proposal', proposalId, async () => {
      await TransactionManager.executeInTransaction(db, async (trx) => {
        const checkRow = await TransactionManager.query(trx, `SELECT status FROM governance_rule_proposals WHERE id = ? AND organization_id = ? AND status = 'active'`, [proposalId, organizationId]);
        if (!checkRow) throw new Error('Proposal is no longer active or has already been completed');

        await TransactionManager.query(trx, `UPDATE organization_governance_rules SET ${setClause}, updated_at = ? WHERE organization_id = ?`, [...updateValues, completionTime.toISOString(), organizationId]);

        const historyId = uuidv4();
        await TransactionManager.query(trx, `
          INSERT INTO governance_rule_history (id, organization_id, rule_field, old_value, new_value, changed_by_proposal_id, changed_by_user_id, changed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [historyId, organizationId, proposal.current_rule_field, proposal.current_rule_value, proposal.proposed_rule_value, proposalId, userId, completionTime.toISOString()]);

        const cooldownUntil = new Date(completionTime.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
        await TransactionManager.query(trx, `
          UPDATE governance_rule_proposals SET status = 'approved', approved_at = ?, implemented_at = ?, cooldown_until = ?, updated_at = ?
          WHERE id = ? AND status = 'active'
        `, [completionTime.toISOString(), completionTime.toISOString(), cooldownUntil, completionTime.toISOString(), proposalId]);
      });
    });

    const newRuleValue = safeJsonParse(proposal.proposed_rule_value, proposal.proposed_rule_value);
    return { approved: true, proposal, approvalResult, threshold, approvalRate, newRuleValue, completionTime };
}

/**
 * Update rule proposal vote counts (aggregate from votes table, update proposal row).
 * @param {Object} db - Knex/db instance
 * @param {string} proposalId - Rule proposal ID
 */
async function updateRuleProposalVoteCounts(db, proposalId) {
  try {
    const aggregation = await UnifiedVotingService.aggregateVotes(
      db,
      'governance_rule_proposal_votes',
      'proposal_id',
      proposalId
    );
    const legacyCounts = await UnifiedVotingService.aggregateLegacyVotes(
      db,
      'governance_rule_proposal_votes',
      'proposal_id',
      proposalId
    );
    const { votesYes, votesNo, votesAbstain } = UnifiedVotingService.combineVoteCounts(
      aggregation,
      legacyCounts
    );
    await TransactionManager.execute(db, `
      UPDATE governance_rule_proposals SET
        votes_yes = ?,
        votes_no = ?,
        votes_abstain = ?,
        votes_cast = ?,
        updated_at = ?
      WHERE id = ?
    `, [
      votesYes,
      votesNo,
      votesAbstain,
      aggregation.totalVotes,
      new Date().toISOString(),
      proposalId
    ]);
    try {
      await TransactionManager.execute(db, `
        UPDATE governance_rule_proposal_options SET
          votes_received = (
            SELECT COUNT(*) FROM governance_rule_proposal_votes
            WHERE proposal_id = ? AND selected_option_id = governance_rule_proposal_options.id
          )
        WHERE proposal_id = ?
      `, [proposalId, proposalId]);
    } catch (optionErr) {
      logger.error('Error updating option vote counts', { error: optionErr.message, proposalId });
    }
  } catch (error) {
    logger.error('Error updating rule proposal vote counts', { error: error.message, proposalId });
    throw error;
  }
}

/**
 * Create a rule proposal (validation, insert proposal, insert options). Optionally audit, broadcast, and notify.
 * Caller must enforce permission (e.g. canProposeRules).
 * @param {Object} db - Knex/db instance
 * @param {string} organizationId
 * @param {string} userId
 * @param {{ title: string, description: string, ruleField: string, proposedValue: *, options?: Array }} params
 * @param {{ auditContext?: Object, broadcast?: boolean, notify?: boolean }} opts - Optional. auditContext (e.g. req) for logAudit; broadcast/notify default true if auditContext provided
 * @returns {Promise<{ proposalId: string, title: string, description: string, ruleField: string, proposedValue: *, optionCount?: number }>}
 */
async function createRuleProposal(db, organizationId, userId, params, opts = {}) {
  const { title, description, ruleField, proposedValue, options } = params;
  const { auditContext, broadcast = !!opts.auditContext, notify = !!opts.auditContext } = opts;
  const { validateRuleChange } = require('../../utils/ruleValidation');
  await validateRuleChange(db, organizationId, ruleField, proposedValue, { mode: 'throw' });

  const proposalId = uuidv4();
  const now = new Date();

  const currentRules = await TransactionManager.query(db, `SELECT id, organization_id, representative_term_months, representative_term_limits,
    election_voting_method, election_quorum_percentage, election_notice_days,
    default_voting_deadline_hours, default_quorum_percentage, document_proposal_period_days,
    threshold_calculation_method, default_acceptance_threshold, anonymous_voting_enabled,
    vote_change_allowed, default_structure_proposals_enabled, default_voting_anonymity_locked,
    representative_can_create_votes, representative_can_invite_members, representative_can_manage_documents,
    representative_approval_required, tamper_proof_enabled, audit_trail_enabled,
    created_at, updated_at
    FROM organization_governance_rules WHERE organization_id = ?`,
  [organizationId]);

  let snakeCaseField = ruleField;
  if (ruleField && /[A-Z]/.test(ruleField)) {
    snakeCaseField = ruleField.replace(/([A-Z])/g, '_$1').toLowerCase();
  }
  const currentValue = currentRules ? JSON.stringify(currentRules[snakeCaseField] || currentRules[ruleField]) : null;

  await TransactionManager.query(db, `
    INSERT INTO governance_rule_proposals (
      id, organization_id, title, description, current_rule_field,
      current_rule_value, proposed_rule_value, created_by, created_at, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
  `, [
    proposalId, organizationId, title, description, ruleField,
    currentValue, JSON.stringify(proposedValue), userId, now.toISOString()
  ]);

  let optionCount = 0;
  if (options && Array.isArray(options) && options.length > 0) {
    for (const option of options) {
      const optionId = uuidv4();
      await TransactionManager.query(db, `
        INSERT INTO governance_rule_proposal_options (
          id, proposal_id, option_title, option_description, proposed_value
        ) VALUES (?, ?, ?, ?, ?)
      `, [
        optionId, proposalId, option.optionTitle, option.optionDescription,
        JSON.stringify(option.proposedValue)
      ]);
      optionCount++;
    }
  }

  const hasOptions = optionCount > 0;
  if (auditContext) {
    await logAudit(db, organizationId, 'rule_proposal_created', userId, null, {
      proposalId,
      ruleField,
      hasOptions,
      optionCount
    }, auditContext);
  }
  if (broadcast) {
    broadcastOrganizationUpdate(organizationId, 'rule-proposal-created', {
      organizationId,
      proposalId,
      ruleField,
      title,
      hasOptions,
      optionCount
    });
  }
  if (notify) {
    (async () => {
      try {
        const notificationService = require('../modules/notifications');
        const config = require('../config');
        const frontendUrl = config.FRONTEND_URL || 'http://localhost:3001';
        const members = await TransactionManager.queryAll(db, `
          SELECT u.id as user_id FROM organization_members om
          JOIN users u ON om.user_id = u.id
          WHERE om.organization_id = ? AND om.status = 'active' AND om.user_id NOT IN (SELECT id FROM organizations)
        `, [organizationId]);
        if (members && members.length > 0) {
          const { extractUserIds } = require('../../utils/memberUtils');
          const userIds = extractUserIds(members);
          const orgRow = await TransactionManager.query(db, 'SELECT name FROM organizations WHERE id = ?', [organizationId]);
          const eventData = {
            title: `New Rule Proposal: ${title}`,
            message: `A new rule proposal "${title}" was created`,
            link: require('../../emails/urls').orgTab(organizationId, 'governance'),
            organizationName: orgRow?.name
          };
          await notificationService.notifyUsers(db, userIds, 'rule_proposal_created', eventData, false);
        }
      } catch (err) {
        logger.error('Error queueing rule proposal creation for digest', { error: err.message, proposalId });
      }
    })();
  }

  return {
    proposalId,
    title,
    description,
    ruleField,
    proposedValue,
    ...(optionCount > 0 && { optionCount })
  };
}

/**
 * Start voting on a draft rule proposal. Caller must enforce canManageRuleProposals.
 * @param {Object} db - Knex/db instance
 * @param {string} organizationId - Organization ID
 * @param {string} proposalId - Rule proposal ID
 * @param {string} userId - User ID
 * @param {{ auditContext?: Object }} options - Optional { auditContext } (e.g. Express req for logAudit)
 * @returns {Promise<{ success: true, votingEndsAt: string }>}
 */
async function startRuleProposalVoting(db, organizationId, proposalId, userId, options = {}) {
  const { auditContext = {} } = options;
  const rules = await getGovernanceRules(db, organizationId);

  const proposalCheck = await TransactionManager.query(db, `
    SELECT id, status, title, created_by FROM governance_rule_proposals
    WHERE id = ? AND organization_id = ?
  `, [proposalId, organizationId]);

  if (!proposalCheck) {
    throw ApiError.notFound('Proposal', {
      message: `Proposal ${proposalId} does not exist in organization ${organizationId}`,
      proposalId,
      organizationId
    });
  }

  const statusValidation = validateStatusTransition(proposalCheck.status, 'active');
  if (!statusValidation.valid) {
    const statusInfo = getStatusInfo(proposalCheck.status);
    throw ApiError.validation(
      'Proposal is not in draft status',
      {
        message: `Proposal "${proposalCheck.title}" is currently ${proposalCheck.status}. Only draft proposals can be started.`,
        currentStatus: proposalCheck.status,
        currentStatusInfo: statusInfo,
        requiredStatus: 'draft',
        explanation: statusInfo.description,
        proposalId,
        title: proposalCheck.title,
        ...statusValidation.details
      },
      'STATUS_INVALID'
    );
  }

  const proposal = await TransactionManager.query(db, `
    SELECT id, organization_id, title, current_rule_field, status
    FROM governance_rule_proposals
    WHERE id = ? AND organization_id = ? AND status = 'draft'
  `, [proposalId, organizationId]);

  if (!proposal) {
    throw ApiError.notFound('Proposal', {
      proposalId,
      organizationId,
      requiredStatus: 'draft',
      message: 'Proposal not found or not in draft status'
    }, 'PROPOSAL_NOT_FOUND');
  }

  const currentRules = await getGovernanceRules(db, organizationId);
  const snapshotRules = JSON.stringify(currentRules);
  const minPeriod = rules?.minimumVotingPeriodHours || 24;
  const defaultPeriod = 14 * 24;
  const votingPeriodHours = Math.max(minPeriod, defaultPeriod);
  const now = new Date();
  const votingEnd = new Date(now.getTime() + votingPeriodHours * 60 * 60 * 1000);
  const resultRow = await TransactionManager.query(db,
    'SELECT COUNT(*) as total FROM organization_members WHERE organization_id = ? AND status = ?',
    [organizationId, 'active']);
  const totalVoters = resultRow?.total ?? 0;

  const updateResult = await TransactionManager.execute(db, `
    UPDATE governance_rule_proposals SET
      status = 'active',
      voting_starts_at = ?,
      voting_ends_at = ?,
      snapshot_rules = ?,
      total_voters = ?,
      updated_at = ?
    WHERE id = ? AND organization_id = ? AND status = 'draft'
  `, [
    now.toISOString(),
    votingEnd.toISOString(),
    snapshotRules,
    totalVoters,
    now.toISOString(),
    proposalId,
    organizationId
  ]);

  const rowsAffected = updateResult?.changes ?? 0;
  if (rowsAffected === 0) {
    const checkRow = await TransactionManager.query(db, `
      SELECT status, title FROM governance_rule_proposals WHERE id = ? AND organization_id = ?
    `, [proposalId, organizationId]);
    if (!checkRow) {
      throw ApiError.notFound('Proposal', { proposalId, organizationId, message: 'The proposal may have been deleted.' }, 'PROPOSAL_NOT_FOUND');
    }
    const statusInfo = getStatusInfo(checkRow.status);
    throw ApiError.validation('Proposal status changed', {
      proposalId,
      organizationId,
      currentStatus: checkRow.status,
      currentStatusInfo: statusInfo,
      requiredStatus: 'draft',
      message: `The proposal "${checkRow.title || proposalId}" status changed to ${checkRow.status} while you were starting voting. This may have been started by another user.`,
      explanation: statusInfo.description,
      suggestion: checkRow.status === 'active'
        ? 'Voting has already been started for this proposal. Refresh the page to see the current status.'
        : `The proposal is now ${checkRow.status}. Refresh the page to see the current status.`
    }, 'STATUS_INVALID');
  }

  await logAudit(db, organizationId, 'rule_proposal_voting_started', userId, null, { proposalId, totalVoters }, auditContext);

  (async () => {
    try {
      const notificationService = require('../modules/notifications');
      const config = require('../config');
      const frontendUrl = config.FRONTEND_URL || 'http://localhost:3001';
      const members = await TransactionManager.queryAll(db, `
        SELECT u.id as user_id FROM organization_members om
        JOIN users u ON om.user_id = u.id
        WHERE om.organization_id = ? AND om.status = 'active' AND om.user_id NOT IN (SELECT id FROM organizations)
      `, [organizationId]);
      if (members && members.length > 0) {
        const { extractUserIds } = require('../../utils/memberUtils');
        const userIds = extractUserIds(members);
        const orgRow = await TransactionManager.query(db, 'SELECT name FROM organizations WHERE id = ?', [organizationId]);
        const eventData = {
          title: proposal.title || 'Rule Proposal',
          votingDeadline: votingEnd.toISOString(),
          link: require('../../emails/urls').orgTab(organizationId, 'governance'),
          organizationName: orgRow?.name,
          votingType: 'rule_proposal'
        };
        await notificationService.notifyUsers(db, userIds, 'voting_started', eventData, true);
      }
    } catch (err) {
      logger.error('Error sending voting started notifications', { error: err.message, proposalId });
    }
  })();

  try {
    broadcastOrganizationUpdate(organizationId, 'rule-proposal-voting-started', {
      organizationId,
      proposalId,
      title: proposal.title,
      ruleField: proposal.current_rule_field,
      votingEndsAt: votingEnd.toISOString(),
      totalVoters
    });
  } catch (wsErr) {
    logger.warn('Failed to broadcast voting started update', { error: wsErr.message, proposalId, organizationId });
  }

  return { success: true, votingEndsAt: votingEnd.toISOString() };
}

/**
 * Get full status for a rule proposal (voting counts, approval, permissions). Caller must enforce requireOrganizationMember.
 * @param {Object} db - Knex/db instance
 * @param {string} organizationId - Organization ID
 * @param {string} proposalId - Rule proposal ID
 * @param {string} userId - User ID
 * @param {string} userRole - User role (e.g. req.user.role)
 * @returns {Promise<{ success: true, status: Object, voting: Object, proposal: Object, permissions: Object }>}
 */
async function getRuleProposalStatus(db, organizationId, proposalId, userId, userRole) {
  const proposal = await TransactionManager.query(db, `
    SELECT grp.id, grp.organization_id, grp.title, grp.description, grp.current_rule_field, grp.current_rule_value,
      grp.proposed_rule_value, grp.status, grp.voting_starts_at, grp.voting_ends_at, grp.threshold_percentage,
      grp.anonymous_voting, grp.votes_yes, grp.votes_no, grp.votes_abstain, grp.total_voters, grp.votes_cast,
      grp.snapshot_rules, grp.created_by, grp.approved_at, grp.implemented_at, grp.created_at, grp.updated_at, u.name as created_by_name
    FROM governance_rule_proposals grp
    LEFT JOIN users u ON grp.created_by = u.id
    WHERE grp.id = ? AND grp.organization_id = ?
  `, [proposalId, organizationId]);

  if (!proposal) {
    throw ApiError.notFound('Proposal', { proposalId, organizationId }, 'PROPOSAL_NOT_FOUND');
  }

  const statusInfo = getStatusInfo(proposal.status);
  const userVote = await TransactionManager.query(db, `
    SELECT id, proposal_id, user_id, selected_option_id, vote, voted_at
    FROM governance_rule_proposal_votes WHERE proposal_id = ? AND user_id = ?
  `, [proposalId, userId]);

  let governanceRules = null;
  try {
    if (proposal.snapshot_rules) {
      const snapshotRulesRaw = safeJsonParse(proposal.snapshot_rules, null);
      if (snapshotRulesRaw) {
        const { transformRulesToCamelCase } = require('../../utils/governanceFieldMapping');
        governanceRules = transformRulesToCamelCase(snapshotRulesRaw);
      }
    }
    if (!governanceRules) {
      governanceRules = await UnifiedVotingService.getGovernanceRules(db, organizationId);
    }
  } catch (rulesErr) {
    logger.warn('Error getting governance rules for status, using defaults', { error: rulesErr.message, proposalId, organizationId });
    governanceRules = null;
  }

  const voteAggregation = await UnifiedVotingService.aggregateVotes(db, 'governance_rule_proposal_votes', 'proposal_id', proposalId);
  const legacyCounts = await UnifiedVotingService.aggregateLegacyVotes(db, 'governance_rule_proposal_votes', 'proposal_id', proposalId);
  const { votesYes, votesNo, votesAbstain, totalVotes } = UnifiedVotingService.combineVoteCounts(voteAggregation, legacyCounts);
  const totalVoters = proposal.total_voters || await UnifiedVotingService.getEligibleVoterCount(db, organizationId, 'organization');
  const threshold = proposal.threshold_percentage || 75.0;
  const approvalResult = await UnifiedVotingService.checkApproval({
    db,
    proposalId,
    organizationId,
    proVotes: votesYes,
    totalVotes: totalVotes,
    totalEligible: totalVoters,
    acceptanceThreshold: threshold,
    calculationMethod: governanceRules?.thresholdCalculationMethod || null,
    quorumPercentage: governanceRules?.defaultQuorumPercentage !== undefined ? governanceRules.defaultQuorumPercentage : null
  });
  const approvalPercentage = approvalResult.approvalPercentage;
  const status = await getUserOrganizationStatus(db, userId, organizationId, userRole);
  const isRep = status.isRepresentative;
  const isMember = status.isActiveMember;
  const rules = await getGovernanceRules(db, organizationId);
  const canManage = await canManageRuleProposals(db, userId, organizationId, rules, userRole);
  const canVote = isMember && proposal.status === 'active' && !userVote;
  const canStartVoting = canManage && proposal.status === 'draft';
  const now = new Date();
  const votingEndsAt = proposal.voting_ends_at ? new Date(proposal.voting_ends_at) : null;
  const isExpired = votingEndsAt && votingEndsAt < now;
  const timeRemaining = votingEndsAt ? Math.max(0, votingEndsAt.getTime() - now.getTime()) : null;

  return {
    success: true,
    status: {
      current: proposal.status,
      info: statusInfo,
      votingEndsAt: proposal.voting_ends_at,
      isExpired,
      timeRemaining: timeRemaining ? Math.floor(timeRemaining / 1000) : null,
      canStartVoting,
      canVote,
      hasVoted: !!userVote,
      userVote: userVote ? {
        vote: userVote.vote || (userVote.vote_choice === 'yes' ? 'PRO' : userVote.vote_choice === 'no' ? 'CONTRA' : userVote.vote_choice === 'abstain' ? 'NEUTRAL' : null),
        voteChoice: userVote.vote || (userVote.vote_choice === 'yes' ? 'PRO' : userVote.vote_choice === 'no' ? 'CONTRA' : userVote.vote_choice === 'abstain' ? 'NEUTRAL' : null),
        selectedOptionId: userVote.selected_option_id,
        votedAt: userVote.voted_at
      } : null
    },
    voting: {
      totalVotes: totalVotes,
      votesYes: votesYes,
      votesNo: votesNo,
      votesAbstain: votesAbstain,
      totalVoters,
      approvalPercentage: Math.round(approvalPercentage * 100) / 100,
      threshold,
      meetsThreshold: approvalResult.approved,
      quorumMet: approvalResult.quorumMet,
      quorumRequired: approvalResult.quorumRequired,
      calculationMethod: approvalResult.details.calculationMethod
    },
    proposal: {
      id: proposal.id,
      title: proposal.title,
      ruleField: proposal.current_rule_field,
      createdAt: proposal.created_at,
      createdBy: { id: proposal.created_by, name: proposal.created_by_name }
    },
    permissions: { isRepresentative: isRep, isActiveMember: isMember, canManage, canVote, canStartVoting }
  };
}

/**
 * Cast or update a vote on a rule proposal. Runs inside voting lock.
 * @param {Object} db - Knex/db instance
 * @param {string} organizationId - Organization ID
 * @param {string} proposalId - Rule proposal ID
 * @param {string} userId - User ID
 * @param {Object} params - { voteChoice, selectedOptionId? }
 * @returns {Promise<{ action: 'cast'|'updated', receiptId: string, votedAt: string, normalizedVote: string }>}
 */
async function castRuleProposalVote(db, organizationId, proposalId, userId, params) {
  const { voteChoice: rawVoteChoice, selectedOptionId } = params || {};

  const isMember = await isActiveMember(db, userId, organizationId);
  if (!isMember) {
    throw ApiError.forbidden(
      'Only active members can vote on rule proposals',
      {
        reason: 'You are not an active member of this organization',
        suggestion: 'You must be an active member to vote on rule proposals. Contact your organization representative if you believe this is an error.',
        organizationId
      },
      'PERMISSION_DENIED'
    );
  }

  const now = new Date().toISOString();
  let proposal = await TransactionManager.query(db, `
    SELECT id, organization_id, title, description, current_rule_field, current_rule_value,
      proposed_rule_value, status, voting_starts_at, voting_ends_at, threshold_percentage,
      anonymous_voting, votes_yes, votes_no, votes_abstain, total_voters, votes_cast,
      created_by, approved_at, implemented_at, created_at, updated_at
    FROM governance_rule_proposals
    WHERE id = ? AND organization_id = ? AND status = 'active'
      AND (voting_ends_at IS NULL OR voting_ends_at > ?)
  `, [proposalId, organizationId, now]);

  if (!proposal) {
    const checkProposal = await TransactionManager.query(db, `
      SELECT id, voting_ends_at, status, title FROM governance_rule_proposals
      WHERE id = ? AND organization_id = ?
    `, [proposalId, organizationId]);

    if (!checkProposal) {
      logger.warn('Proposal not found for voting', { proposalId, organizationId, userId });
      throw ApiError.notFound(
        'Rule proposal',
        { proposalId, organizationId },
        'PROPOSAL_NOT_FOUND'
      );
    }

    if (checkProposal.status !== 'active') {
      logger.warn('Proposal not in active status for voting', {
        proposalId, organizationId, status: checkProposal.status, userId
      });
      throw ApiError.validation(
        `Rule proposal is ${checkProposal.status}, cannot vote`,
        {
          currentStatus: checkProposal.status,
          requiredStatus: 'active',
          proposalId,
          title: checkProposal.title,
          message: `This proposal is ${checkProposal.status} and cannot accept votes.`
        },
        'STATUS_INVALID'
      );
    }

    if (checkProposal.voting_ends_at && checkProposal.voting_ends_at < now) {
      logger.warn('Voting deadline passed', { proposalId, organizationId, votingEndsAt: checkProposal.voting_ends_at, userId });
      throw ApiError.validation(
        'Voting deadline has passed for this proposal',
        {
          proposalId,
          votingEndsAt: checkProposal.voting_ends_at,
          currentTime: now,
          message: 'The voting period for this proposal has ended.'
        },
        'VOTING_EXPIRED'
      );
    }

    logger.warn('Proposal not found or not active', { proposalId, organizationId, userId });
    throw ApiError.notFound(
      'Rule proposal',
      { proposalId, organizationId, message: 'Rule proposal not found or not active' },
      'PROPOSAL_NOT_FOUND'
    );
  }

  let voteChoice = rawVoteChoice;
  if (selectedOptionId && !voteChoice) voteChoice = 'yes';

  let normalizedVote = null;
  if (voteChoice) {
    if (voteChoice === 'yes') normalizedVote = 'PRO';
    else if (voteChoice === 'no') normalizedVote = 'CONTRA';
    else if (voteChoice === 'abstain') normalizedVote = 'NEUTRAL';
    else if (['PRO', 'CONTRA', 'NEUTRAL'].includes(voteChoice)) normalizedVote = voteChoice;
    else {
      throw ApiError.validation(
        'Invalid vote choice',
        { message: 'Vote choice must be PRO, CONTRA, or NEUTRAL', received: voteChoice },
        'INVALID_VOTE'
      );
    }
  }

  if (!normalizedVote) {
    throw ApiError.validation(
      'Vote choice required',
      { message: 'voteChoice must be PRO, CONTRA, or NEUTRAL' },
      'MISSING_VOTE'
    );
  }

  if (selectedOptionId) {
    const optionsForProposal = await TransactionManager.queryAll(db, `
      SELECT id FROM governance_rule_proposal_options WHERE proposal_id = ?
    `, [proposalId]);
    if (!optionsForProposal || optionsForProposal.length === 0) {
      throw ApiError.validation(
        'Proposal does not have options',
        { message: 'This proposal does not support option selection', proposalId },
        'NO_OPTIONS'
      );
    }
    const optionExists = optionsForProposal.some(opt => opt.id === selectedOptionId);
    if (!optionExists) {
      throw ApiError.validation(
        'Invalid option selected',
        {
          message: `Option with ID ${selectedOptionId} does not exist in this proposal`,
          proposalId,
          selectedOptionId,
          availableOptions: optionsForProposal.map(opt => opt.id)
        },
        'INVALID_OPTION'
      );
    }
  }

  return await votingLockManager.withVoteLock('proposal', proposalId, async () => {
    const nowLock = new Date().toISOString();
    const currentProposal = await TransactionManager.query(db, `
      SELECT id, voting_ends_at, status
      FROM governance_rule_proposals
      WHERE id = ? AND organization_id = ?
    `, [proposalId, organizationId]);

    if (!currentProposal) {
      throw ApiError.notFound('Rule proposal', { proposalId, organizationId }, 'PROPOSAL_NOT_FOUND');
    }
    if (currentProposal.voting_ends_at && currentProposal.voting_ends_at < nowLock) {
      throw ApiError.validation(
        'Voting deadline has passed for this proposal',
        {
          proposalId,
          votingEndsAt: currentProposal.voting_ends_at,
          currentTime: nowLock,
          message: 'The voting period for this proposal has ended.'
        },
        'VOTING_EXPIRED'
      );
    }
    if (currentProposal.status !== 'active') {
      throw ApiError.validation(
        `Rule proposal is ${currentProposal.status}, cannot vote`,
        {
          currentStatus: currentProposal.status,
          requiredStatus: 'active',
          proposalId,
          message: `This proposal is ${currentProposal.status} and cannot accept votes.`
        },
        'STATUS_INVALID'
      );
    }

    const existingVote = await TransactionManager.query(db, `
      SELECT id, proposal_id, user_id, selected_option_id, vote, voted_at, receipt_id
      FROM governance_rule_proposal_votes
      WHERE proposal_id = ? AND user_id = ?
    `, [proposalId, userId]);

    const votedAt = new Date().toISOString();
    const receiptId = existingVote?.receipt_id || generateReceiptId();
    const voteHash = computeVoteHash('governance_rule', {
      contestId: proposalId,
      choice: normalizedVote,
      timestamp: votedAt,
      receiptId
    });

    if (existingVote) {
      const rules = await getGovernanceRules(db, organizationId);
      const voteChangeAllowed = rules?.voteChangeAllowed || false;
      if (!voteChangeAllowed) {
        logger.warn('User already voted and vote changes not allowed', { proposalId, organizationId, userId });
        throw ApiError.validation(
          'You have already voted on this rule proposal',
          { proposalId, votedAt: existingVote.voted_at, message: 'You can only vote once on each proposal.' },
          'ALREADY_VOTED'
        );
      }
      await TransactionManager.executeInTransaction(db, async (txDb) => {
        await TransactionManager.execute(txDb, `
          UPDATE governance_rule_proposal_votes
          SET vote = ?, voted_at = ?, receipt_id = ?, vote_hash = ?
          WHERE proposal_id = ? AND user_id = ?
        `, [normalizedVote, votedAt, receiptId, voteHash, proposalId, userId]);
        await voteVerificationLog.appendLogEntry(txDb, {
          voteType: 'governance_rule',
          contestId: proposalId,
          choice: normalizedVote,
          timestamp: votedAt,
          receiptId,
          voteHash
        });
      });
      return { action: 'updated', receiptId, votedAt, normalizedVote };
    }

    const voteId = uuidv4();
    await TransactionManager.executeInTransaction(db, async (txDb) => {
      await TransactionManager.execute(txDb, `
        INSERT INTO governance_rule_proposal_votes (
          id, proposal_id, user_id, selected_option_id, vote, voted_at, receipt_id, vote_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [voteId, proposalId, userId, selectedOptionId || null, normalizedVote, votedAt, receiptId, voteHash]);
      await voteVerificationLog.appendLogEntry(txDb, {
        voteType: 'governance_rule',
        contestId: proposalId,
        choice: normalizedVote,
        timestamp: votedAt,
        receiptId,
        voteHash
      });
    });
    return { action: 'cast', receiptId, votedAt, normalizedVote };
  });
}

/**
 * Fetch all rule proposals for an organization with votes, options, and approval calculations.
 * @param {Object} db - Knex/db instance
 * @param {string} organizationId
 * @param {string} userId - Requesting user (unused currently, reserved for per-user filtering)
 * @returns {Promise<{ ruleProposals: Array }>}
 */
async function getRuleProposalsWithVotes(db, organizationId, userId) {
  let proposals;
  try {
    proposals = await TransactionManager.queryAll(db, `
      SELECT grp.*, u.name as created_by_name
      FROM governance_rule_proposals grp
      LEFT JOIN users u ON grp.created_by = u.id
      WHERE grp.organization_id = ?
      ORDER BY grp.created_at DESC
    `, [organizationId]);
  } catch (queryErr) {
    logger.error('Error querying rule proposals', {
      error: queryErr.message,
      organizationId,
      stack: queryErr.stack
    });
    throw ApiError.database('Failed to query rule proposals from database', {
      organizationId,
      originalError: queryErr.message
    }, 'QUERY_ERROR');
  }

  if (!proposals || proposals.length === 0) {
    return { ruleProposals: [] };
  }

  const proposalIds = proposals.map(p => p.id).filter(id => id != null);
  let votes = [];

  if (proposalIds.length > 0) {
    try {
      const placeholders = proposalIds.map(() => '?').join(',');
      votes = await TransactionManager.queryAll(db, `
        SELECT
          grpv.*,
          u.name as voter_name,
          u.email as voter_email
        FROM governance_rule_proposal_votes grpv
        LEFT JOIN users u ON grpv.user_id = u.id
        WHERE grpv.proposal_id IN (${placeholders})
        ORDER BY grpv.voted_at ASC
      `, proposalIds);
    } catch (voteErr) {
      logger.error('Error fetching proposal votes', {
        error: voteErr.message,
        organizationId,
        proposalCount: proposalIds.length
      });
    }
  }

  const votesByProposal = {};
  votes.forEach(vote => {
    if (!votesByProposal[vote.proposal_id]) {
      votesByProposal[vote.proposal_id] = [];
    }
    const voteChoice = vote.vote_choice || (vote.vote === 'PRO' ? 'yes' : vote.vote === 'CONTRA' ? 'no' : vote.vote === 'NEUTRAL' ? 'abstain' : null);
    votesByProposal[vote.proposal_id].push({
      id: vote.id,
      userId: vote.user_id,
      selectedOptionId: vote.selected_option_id,
      vote: vote.vote,
      voteChoice: voteChoice,
      votedAt: vote.voted_at,
      user: {
        id: vote.user_id,
        name: vote.voter_name,
        email: vote.voter_email
      }
    });
  });

  let options = [];
  if (proposalIds.length > 0) {
    try {
      const optionPlaceholders = proposalIds.map(() => '?').join(',');
      options = await TransactionManager.queryAll(db, `
        SELECT id, proposal_id, option_title, option_description, proposed_value, created_at
        FROM governance_rule_proposal_options
        WHERE proposal_id IN (${optionPlaceholders})
        ORDER BY created_at ASC
      `, proposalIds);
    } catch (optionErr) {
      logger.error('Error fetching proposal options', {
        error: optionErr.message,
        organizationId,
        proposalCount: proposalIds.length
      });
    }
  }

  const optionsByProposal = {};
  options.forEach(option => {
    if (!optionsByProposal[option.proposal_id]) {
      optionsByProposal[option.proposal_id] = [];
    }
    try {
      optionsByProposal[option.proposal_id].push({
        id: option.id,
        optionTitle: option.option_title,
        optionDescription: option.option_description,
        proposedValue: option.proposed_value ? (typeof option.proposed_value === 'string' ? safeJsonParse(option.proposed_value, null) : option.proposed_value) : null
      });
    } catch (parseErr) {
      logger.error('Error parsing option value', { error: parseErr.message, organizationId, optionId: option.id });
    }
  });

  const allProposalIds = proposals.map(p => p.id);
  const batchVotesByProposal = new Map();

  if (allProposalIds.length > 0) {
    try {
      const votesPlaceholders = allProposalIds.map(() => '?').join(',');
      const allVotes = await TransactionManager.queryAll(db,
        `SELECT proposal_id, vote, selected_option_id
         FROM governance_rule_proposal_votes
         WHERE proposal_id IN (${votesPlaceholders})`,
        allProposalIds
      );

      allVotes.forEach(vote => {
        if (!batchVotesByProposal.has(vote.proposal_id)) {
          batchVotesByProposal.set(vote.proposal_id, []);
        }
        batchVotesByProposal.get(vote.proposal_id).push(vote);
      });
    } catch (err) {
      logger.error('Error batch fetching votes for governance proposals', { error: err.message });
    }
  }

  const aggregateVotesFromArray = (votesArr) => {
    let proVotes = 0;
    let contraVotes = 0;
    let neutralVotes = 0;
    let legacy_yes = 0;
    let legacy_no = 0;
    let legacy_abstain = 0;

    votesArr.forEach(vote => {
      if (vote.vote) {
        if (vote.vote === 'PRO') proVotes++;
        else if (vote.vote === 'CONTRA') contraVotes++;
        else if (vote.vote === 'NEUTRAL') neutralVotes++;
      } else if (vote.vote_choice) {
        if (vote.vote_choice === 'yes') legacy_yes++;
        else if (vote.vote_choice === 'no') legacy_no++;
        else if (vote.vote_choice === 'abstain') legacy_abstain++;
      }
    });

    return {
      voteAggregation: {
        proVotes,
        contraVotes,
        neutralVotes,
        totalVotes: proVotes + contraVotes + neutralVotes
      },
      legacyCounts: {
        legacy_yes,
        legacy_no,
        legacy_abstain
      }
    };
  };

  const proposalsWithVotes = await Promise.all(proposals.map(async (proposal) => {
    try {
      const proposalVotes = batchVotesByProposal.get(proposal.id) || [];
      const { voteAggregation, legacyCounts } = aggregateVotesFromArray(proposalVotes);

      const { votesYes, votesNo, votesAbstain, totalVotes } = UnifiedVotingService.combineVoteCounts(
        voteAggregation,
        legacyCounts
      );

      let governanceRules = null;
      let approvalPercentage = undefined;
      let quorumMet = undefined;
      let calculationMethod = undefined;

      if (proposal.status === 'active' || proposal.status === 'draft') {
        try {
          if (proposal.snapshot_rules) {
            const snapshotRulesRaw = safeJsonParse(proposal.snapshot_rules, null);
            if (snapshotRulesRaw) {
              const { transformRulesToCamelCase } = require('../../utils/governanceFieldMapping');
              governanceRules = transformRulesToCamelCase(snapshotRulesRaw);
            }
          }
          if (!governanceRules) {
            try {
              governanceRules = await UnifiedVotingService.getGovernanceRules(db, organizationId);
            } catch (rulesErr) {
              logger.warn('Error fetching governance rules for proposal', {
                error: rulesErr.message,
                proposalId: proposal.id,
                organizationId
              });
            }
          }

          if (totalVotes > 0 || proposal.status === 'active') {
            let totalVoters;
            try {
              totalVoters = proposal.total_voters || await UnifiedVotingService.getEligibleVoterCount(db, organizationId, 'organization');
            } catch (voterErr) {
              logger.warn('Error getting eligible voter count for proposal', {
                error: voterErr.message,
                proposalId: proposal.id,
                organizationId
              });
              totalVoters = proposal.total_voters || 0;
            }

            const threshold = proposal.threshold_percentage || 75.0;

            try {
              const approvalResult = await UnifiedVotingService.checkApproval({
                db,
                proposalId: proposal.id,
                organizationId,
                proVotes: votesYes,
                totalVotes: totalVotes,
                totalEligible: totalVoters,
                acceptanceThreshold: threshold,
                calculationMethod: governanceRules?.thresholdCalculationMethod || null,
                quorumPercentage: governanceRules?.defaultQuorumPercentage !== undefined ? governanceRules.defaultQuorumPercentage : null
              });

              approvalPercentage = approvalResult.approvalPercentage;
              quorumMet = approvalResult.quorumMet;
              calculationMethod = approvalResult.details.calculationMethod;
            } catch (approvalErr) {
              logger.warn('Error calculating approval for proposal', {
                error: approvalErr.message,
                proposalId: proposal.id,
                organizationId
              });
            }
          }
        } catch (calcErr) {
          logger.warn('Error calculating approval for proposal in list', {
            error: calcErr.message,
            proposalId: proposal.id,
            organizationId
          });
        }
      }

      return {
        id: proposal.id,
        title: proposal.title,
        description: proposal.description,
        ruleField: proposal.current_rule_field,
        currentValue: proposal.current_rule_value ? (typeof proposal.current_rule_value === 'string' ? safeJsonParse(proposal.current_rule_value, null) : proposal.current_rule_value) : null,
        proposedValue: proposal.proposed_rule_value ? (typeof proposal.proposed_rule_value === 'string' ? safeJsonParse(proposal.proposed_rule_value, null) : proposal.proposed_rule_value) : null,
        status: proposal.status,
        votingStartsAt: proposal.voting_starts_at,
        votingEndsAt: proposal.voting_ends_at,
        votingDeadline: proposal.voting_ends_at,
        thresholdPercentage: proposal.threshold_percentage || 75.0,
        anonymousVoting: proposal.anonymous_voting === 1 || proposal.anonymous_voting === true,
        votesYes: votesYes,
        votesNo: votesNo,
        votesAbstain: votesAbstain,
        totalVoters: proposal.total_voters || 0,
        votesCast: totalVotes,
        approvalPercentage: approvalPercentage !== undefined ? Math.round(approvalPercentage * 100) / 100 : undefined,
        quorumMet: quorumMet,
        calculationMethod: calculationMethod,
        approvedAt: proposal.approved_at,
        implementedAt: proposal.implemented_at,
        createdBy: {
          id: proposal.created_by,
          name: proposal.created_by_name
        },
        createdAt: proposal.created_at,
        updatedAt: proposal.updated_at,
        options: optionsByProposal[proposal.id] || [],
        votes: votesByProposal[proposal.id] || []
      };
    } catch (parseErr) {
      logger.error('Error parsing proposal', { error: parseErr.message, organizationId, proposalId: proposal.id });
      return {
        id: proposal.id,
        title: proposal.title,
        description: proposal.description,
        ruleField: proposal.current_rule_field,
        status: proposal.status,
        createdBy: {
          id: proposal.created_by,
          name: proposal.created_by_name
        },
        createdAt: proposal.created_at,
        options: [],
        votes: votesByProposal[proposal.id] || []
      };
    }
  }));

  return { ruleProposals: proposalsWithVotes };
}

async function broadcastRuleProposalVoteUpdate(db, organizationId, proposalId, userId, vote, action) {
  try {
    const proposal = await TransactionManager.query(db, `
      SELECT id, organization_id, anonymous_voting, threshold_percentage, total_voters, snapshot_rules, status
      FROM governance_rule_proposals WHERE id = ?
    `, [proposalId]);
    if (!proposal) {
      logger.warn('Proposal not found for WebSocket broadcast', { proposalId, organizationId });
      return;
    }
    const isAnonymous = proposal.anonymous_voting === 1 || proposal.anonymous_voting === true;
    const votes = await TransactionManager.queryAll(db, `
      SELECT v.*, u.name as user_name, u.email as user_email
      FROM governance_rule_proposal_votes v
      LEFT JOIN users u ON v.user_id = u.id
      WHERE v.proposal_id = ?
      ORDER BY v.voted_at ASC
    `, [proposalId]);
    const normalizedVotes = votes.map(v => {
      let voteValue = v.vote;
      if (!voteValue && v.vote_choice) voteValue = normalizeVoteValue(v.vote_choice);
      if (voteValue) voteValue = normalizeVoteValue(voteValue) || voteValue;
      return {
        id: v.id,
        user_id: v.user_id,
        vote: voteValue,
        created_at: v.voted_at,
        user_name: v.user_name,
        user_email: v.user_email,
        selected_option_id: v.selected_option_id
      };
    });
    const formattedVotes = UnifiedVotingService.formatVotesForResponse(normalizedVotes, isAnonymous, userId);
    formattedVotes.forEach((fv, idx) => {
      fv.selectedOptionId = normalizedVotes[idx].selected_option_id;
      fv.createdAt = normalizedVotes[idx].created_at;
    });
    const voteCounts = calculateVoteCounts(formattedVotes);
    voteCounts.userId = userId;
    voteCounts.vote = normalizeVoteValue(vote) || vote;
    const validation = validateVoteCounts(voteCounts, formattedVotes);
    if (!validation.isValid) {
      logger.error('Vote counts validation failed for rule proposal', { error: validation.error, proposalId, organizationId });
    } else if (validation.warning) {
      logger.warn('Vote counts validation warning for rule proposal', { warning: validation.warning, proposalId, organizationId });
    }
    let approvalData = {};
    if (proposal.status === 'active') {
      try {
        const voteAggregation = await UnifiedVotingService.aggregateVotes(db, 'governance_rule_proposal_votes', 'proposal_id', proposalId);
        const legacyCounts = await UnifiedVotingService.aggregateLegacyVotes(db, 'governance_rule_proposal_votes', 'proposal_id', proposalId);
        const { votesYes, totalVotes } = UnifiedVotingService.combineVoteCounts(voteAggregation, legacyCounts);
        let governanceRules = null;
        if (proposal.snapshot_rules) {
          const snapshotRulesRaw = safeJsonParse(proposal.snapshot_rules, null);
          if (snapshotRulesRaw) {
            const { transformRulesToCamelCase } = require('../../utils/governanceFieldMapping');
            governanceRules = transformRulesToCamelCase(snapshotRulesRaw);
          }
        }
        if (!governanceRules) governanceRules = await UnifiedVotingService.getGovernanceRules(db, organizationId);
        const totalVoters = proposal.total_voters || await UnifiedVotingService.getEligibleVoterCount(db, organizationId, 'organization');
        const threshold = proposal.threshold_percentage || 75.0;
        const approvalResult = await UnifiedVotingService.checkApproval({
          db, proposalId, organizationId, proVotes: votesYes, totalVotes, totalEligible: totalVoters,
          acceptanceThreshold: threshold,
          calculationMethod: governanceRules?.thresholdCalculationMethod || null,
          quorumPercentage: governanceRules?.defaultQuorumPercentage !== undefined ? governanceRules.defaultQuorumPercentage : null
        });
        approvalData = {
          approvalPercentage: Math.round(approvalResult.approvalPercentage * 100) / 100,
          quorumMet: approvalResult.quorumMet,
          quorumRequired: approvalResult.quorumRequired,
          calculationMethod: approvalResult.details.calculationMethod
        };
      } catch (calcErr) {
        logger.warn('Error calculating approval for WebSocket broadcast', { error: calcErr.message, proposalId });
      }
    }
    broadcastOrganizationUpdate(organizationId, 'rule-proposal-vote-cast', {
      organizationId, proposalId, userId, vote, action, voteCounts, allVotes: formattedVotes, isAnonymous, ...approvalData
    });
  } catch (error) {
    logger.warn('Failed to broadcast rule proposal vote update', { error: error.message, proposalId, organizationId });
  }
}

async function validateRuleChange(db, organizationId, body) {
  const { extractField } = require('../../utils/fieldExtractor');
  const ruleField = extractField(body, 'ruleField', 'rule_field');
  const proposedValue = extractField(body, 'proposedValue', 'proposed_value');
  const { validateRuleChange: validateRuleChangeUtil } = require('../../utils/ruleValidation');
  return await validateRuleChangeUtil(db, organizationId, ruleField, proposedValue, { mode: 'collect' });
}

async function getRuleHistory(db, organizationId, options = {}) {
  const { ruleField, limit = 50, offset = 0 } = options;
  const parsedLimit = parseInt(limit);
  const parsedOffset = parseInt(offset);
  let query = `
    SELECT grh.*, u.name as changed_by_user_name
    FROM governance_rule_history grh
    LEFT JOIN users u ON grh.changed_by_user_id = u.id
    WHERE grh.organization_id = ?
  `;
  const params = [organizationId];
  if (ruleField) { query += ' AND grh.rule_field = ?'; params.push(ruleField); }
  query += ' ORDER BY grh.changed_at DESC LIMIT ? OFFSET ?';
  params.push(parsedLimit, parsedOffset);
  const history = await TransactionManager.queryAll(db, query, params);
  let countQuery = 'SELECT COUNT(*) as total FROM governance_rule_history WHERE organization_id = ?';
  const countParams = [organizationId];
  if (ruleField) { countQuery += ' AND rule_field = ?'; countParams.push(ruleField); }
  const countRow = await TransactionManager.query(db, countQuery, countParams);
  const totalCount = countRow?.total || 0;
  const formattedHistory = history.map(entry => ({
    id: entry.id,
    ruleField: entry.rule_field,
    oldValue: safeJsonParse(entry.old_value, null),
    newValue: safeJsonParse(entry.new_value, null),
    changedBy: { userId: entry.changed_by_user_id, userName: entry.changed_by_user_name, proposalId: entry.changed_by_proposal_id },
    changedAt: entry.changed_at
  }));
  return {
    success: true,
    history: formattedHistory,
    pagination: { total: totalCount, limit: parsedLimit, offset: parsedOffset, hasMore: (parsedOffset + formattedHistory.length) < totalCount }
  };
}

async function withdrawRuleProposal(db, organizationId, proposalId, userId, auditContext = {}) {
  const proposal = await TransactionManager.query(db, `
    SELECT id, title, created_by FROM governance_rule_proposals
    WHERE id = ? AND organization_id = ? AND status = 'draft'
  `, [proposalId, organizationId]);
  if (!proposal) throw ApiError.notFound('Proposal', { proposalId, organizationId, message: 'Proposal not found or not in draft status' }, 'PROPOSAL_NOT_FOUND');
  if (proposal.created_by !== userId) throw ApiError.forbidden('Only the proposal creator can withdraw it', { proposalId, organizationId }, 'NOT_PROPOSAL_CREATOR');
  const result = await TransactionManager.execute(db, `
    UPDATE governance_rule_proposals SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND organization_id = ? AND status = 'draft' AND created_by = ?
  `, [proposalId, organizationId, userId]);
  if ((result?.changes ?? 0) === 0) throw ApiError.notFound('Proposal', { proposalId, organizationId, message: 'Proposal not found or already processed' }, 'PROPOSAL_NOT_FOUND');
  await logAudit(db, organizationId, 'rule_proposal_withdrawn', userId, null, { proposalId, title: proposal.title }, auditContext);
  try { broadcastOrganizationUpdate(organizationId, 'rule-proposal-withdrawn', { organizationId, proposalId, title: proposal.title }); } catch (wsErr) { logger.warn('Failed to broadcast rule proposal withdrawn update', { error: wsErr.message }); }
  return { success: true, message: 'Rule proposal withdrawn' };
}

module.exports = {
  completeRuleProposal,
  updateRuleProposalVoteCounts,
  createRuleProposal,
  startRuleProposalVoting,
  getRuleProposalStatus,
  castRuleProposalVote,
  getRuleProposalsWithVotes,
  broadcastRuleProposalVoteUpdate,
  validateRuleChange,
  getRuleHistory,
  withdrawRuleProposal
};
