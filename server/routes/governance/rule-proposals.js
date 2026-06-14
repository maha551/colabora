/**
 * Rule proposal routes under /api/governance/:organizationId/rule-proposals
 * Also hosts validate-rule-change and rule-history.
 */

const express = require('express');
const { requireAuth, requireOrganizationMember } = require('../../middleware/auth');
const { asyncHandler, ApiError } = require('../../middleware/errorHandler');
const { logger } = require('../../middleware/logger');
const { organizationValidation } = require('../../middleware/validation');
const { validateRuleProposal, validateRuleProposalMetadata } = require('../../middleware/governanceValidation');
const { sendRepresentativeRejectionEmail } = require('../../modules/emailService');
const TransactionManager = require('../../database/services/TransactionManager');
const UnifiedVotingService = require('../../modules/unified-voting');
const { normalizeVoteValue } = require('../../utils/voteCounts');
const {
  isRepresentative,
  isActiveMember,
  canProposeRules,
  canManageRuleProposals
} = require('../../modules/permissions');
const { getUserOrganizationStatus } = require('../../utils/permissionUtils');
const { getUserId } = require('../../utils/routeHelpers');
const { broadcastOrganizationUpdate, broadcastDocumentUpdate } = require('../../utils/websocketBroadcast');
const RuleProposalService = require('../../services/governance/RuleProposalService');
const GovernanceRulesService = require('../../services/governance/GovernanceRulesService');
const { handleGovernanceEndpointError, logAudit } = require('./helpers');

const ruleProposalCommentRoutes = require('../rule-proposal-comments');

const router = express.Router({ mergeParams: true });

router.use('/:organizationId/rule-proposals/:proposalId/comments', ruleProposalCommentRoutes);

// Validate rule change before creating proposal
router.post('/:organizationId/validate-rule-change', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId } = req.params;
  try {
    const result = await RuleProposalService.validateRuleChange(db, organizationId, req.body);
    res.json(result);
  } catch (error) {
    logger.error('Error validating rule change', { error: error.message, organizationId });
    throw ApiError.database('Failed to validate rule change');
  }
}));

// Get rule change history
router.get('/:organizationId/rule-history', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId } = req.params;
  const { ruleField, limit = 50, offset = 0 } = req.query;
  try {
    const result = await RuleProposalService.getRuleHistory(db, organizationId, { ruleField, limit, offset });
    res.json(result);
  } catch (error) {
    logger.error('Error fetching rule history', { error: error.message, organizationId });
    throw ApiError.database('Failed to fetch rule history');
  }
}));

// Get rule proposals for organization
router.get('/:organizationId/rule-proposals', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const knex = req.app.locals.knex || req.app.locals.db;
  const db = knex;
  const { organizationId } = req.params;
  const userId = getUserId(req);
  try {
    const result = await RuleProposalService.getRuleProposalsWithVotes(db, organizationId, userId);
    res.json(result);
  } catch (error) {
    handleGovernanceEndpointError(error, 'rule proposals', req.params.organizationId, getUserId(req, false));
  }
}));

// Create rule proposal
router.post('/:organizationId/rule-proposals', requireAuth, requireOrganizationMember, validateRuleProposalMetadata, validateRuleProposal, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId } = req.params;
  const userId = getUserId(req);
  const { extractField } = require('../../utils/fieldExtractor');
  const title = req.body.title;
  const description = req.body.description;
  const ruleField = extractField(req.body, 'ruleField', 'rule_field');
  const proposedValue = extractField(req.body, 'proposedValue', 'proposed_value');
  const options = req.body.options;

  try {
    const rules = await GovernanceRulesService.getGovernanceRules(db, organizationId);
    const canPropose = await canProposeRules(db, userId, organizationId, rules, req.user.role);
    if (!canPropose) {
      const status = await getUserOrganizationStatus(db, userId, organizationId, req.user.role);
      const isRep = status.isRepresentative;
      const isMember = status.isActiveMember;
      let reason = 'Unknown reason';
      let suggestion = 'Contact your organization representative for assistance.';
      if (!isMember && !isRep) {
        reason = 'You are not an active member of this organization';
        suggestion = 'You must be an active member to propose rule changes.';
      } else if (!rules?.membersCanProposeRules && !isRep) {
        reason = 'Members are not allowed to propose rules in this organization';
        suggestion = 'Only representatives can propose rule changes. Contact a representative to propose this change.';
      } else if (rules?.bootstrapMode && !isMember) {
        reason = 'Organization is in bootstrap mode and you are not an active member';
        suggestion = 'Only active members can propose rules during bootstrap mode.';
      }
      throw ApiError.forbidden('You do not have permission to create rule proposals', 'PERMISSION_DENIED', {
        reason,
        suggestion,
        isRepresentative: isRep,
        isActiveMember: isMember,
        membersCanProposeRules: rules?.membersCanProposeRules || false
      });
    }

    const result = await RuleProposalService.createRuleProposal(db, organizationId, userId, { title, description, ruleField, proposedValue, options }, { auditContext: req, broadcast: true, notify: true });

    res.json({
      success: true,
      ruleProposal: {
        id: result.proposalId,
        title: result.title,
        description: result.description,
        ruleField: result.ruleField,
        proposedValue: result.proposedValue,
        ...(result.optionCount != null && { options: result.optionCount })
      }
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error creating rule proposal', { error: error.message, stack: error.stack, organizationId: req.params.organizationId, userId });
    throw ApiError.database('Failed to create rule proposal', { organizationId, ...(process.env.NODE_ENV !== 'production' && { message: error.message }) }, 'INTERNAL_ERROR');
  }
}));

// Start rule proposal voting
router.post('/:organizationId/rule-proposals/:proposalId/start-voting', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId, proposalId } = req.params;
  const userId = getUserId(req);

  try {
    const rules = await GovernanceRulesService.getGovernanceRules(db, organizationId);
    const canManage = await canManageRuleProposals(db, userId, organizationId, rules, req.user.role);
    if (!canManage) {
      const isRep = await isRepresentative(db, userId, organizationId);
      const isMember = await isActiveMember(db, userId, organizationId);
      let reason = 'Unknown reason';
      let suggestion = 'Contact your organization representative for assistance.';
      if (!isMember && !isRep) {
        reason = 'You are not an active member of this organization';
        suggestion = 'You must be an active member to start voting on proposals.';
      } else if (!rules?.membersCanManageRuleProposals && !isRep) {
        reason = 'Members are not allowed to manage rule proposals in this organization';
        suggestion = 'Only representatives can start voting on proposals. Contact a representative.';
      } else if (rules?.bootstrapMode && !isRep) {
        reason = 'Organization is in bootstrap mode and you are not a representative';
        suggestion = 'Only representatives can start voting during bootstrap mode.';
      }
      throw ApiError.forbidden(
        'You do not have permission to start voting',
        { reason, suggestion, isRepresentative: isRep, isActiveMember: isMember, membersCanManageRuleProposals: rules?.membersCanManageRuleProposals || false },
        'PERMISSION_DENIED'
      );
    }
    const repCanCreate = rules?.representativeCanCreateVotes ?? rules?.representative_can_create_votes;
    const isRep = await isRepresentative(db, userId, organizationId);
    if (req.user.role !== 'admin' && isRep && (repCanCreate === false || repCanCreate === 0)) {
      throw ApiError.forbidden(
        'Representatives cannot start votes for this organization under current governance rules.',
        { reason: 'representativeCanCreateVotes is disabled', suggestion: 'A governance rule change is required to allow representatives to start voting.' },
        'REPRESENTATIVE_CANNOT_START_VOTING'
      );
    }

    const result = await RuleProposalService.startRuleProposalVoting(db, organizationId, proposalId, userId, { auditContext: req });
    res.json({ success: true, message: 'Rule proposal voting started', votingEndsAt: result.votingEndsAt });
  } catch (error) {
    logger.error('Error starting rule proposal voting', { error: error.message, stack: error.stack, organizationId: req.params.organizationId, proposalId, userId });
    throw ApiError.database('Failed to start voting', { organizationId, proposalId, ...(process.env.NODE_ENV !== 'production' && { message: error.message }) }, 'INTERNAL_ERROR');
  }
}));

// Decline rule proposal
router.post('/:organizationId/rule-proposals/:proposalId/decline', requireAuth, requireOrganizationMember, ...organizationValidation.declineVote, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  if (!db) throw ApiError.database('Database connection not available', { endpoint: 'decline' }, 'DB_UNAVAILABLE');
  const { organizationId, proposalId } = req.params;
  const userId = getUserId(req);
  const { reason } = req.body;
  try {
    const rules = await GovernanceRulesService.getGovernanceRules(db, organizationId);
    const canManage = await canManageRuleProposals(db, userId, organizationId, rules, req.user?.role);
    if (!canManage) {
      throw ApiError.forbidden('You do not have permission to decline rule proposals', { reason: 'Only representatives or users with rule proposal management permission can decline proposals', organizationId }, 'PERMISSION_DENIED');
    }
    const proposal = await TransactionManager.query(db, `SELECT id, title, created_by FROM governance_rule_proposals WHERE id = ? AND organization_id = ? AND status = 'draft'`, [proposalId, organizationId]);
    if (!proposal) {
      throw ApiError.notFound('Proposal', { proposalId, organizationId, message: 'Proposal not found or not in draft status' }, 'PROPOSAL_NOT_FOUND');
    }
    const result = await TransactionManager.execute(db, `
      UPDATE governance_rule_proposals SET status = 'cancelled', rejected_by_rep_id = ?, rejection_reason = ?, rejected_at = ?
      WHERE id = ? AND organization_id = ? AND status = 'draft'
    `, [userId, reason.trim(), new Date().toISOString(), proposalId, organizationId]);
    if ((result?.changes ?? 0) === 0) {
      throw ApiError.notFound('Proposal', { proposalId, organizationId, message: 'Proposal not found or already processed' }, 'PROPOSAL_NOT_FOUND');
    }
    logAudit(db, organizationId, 'rule_proposal_declined', userId, null, { proposalId, reason: reason?.substring?.(0, 200) }, req);
    const proposer = await TransactionManager.query(db, 'SELECT id, name, email FROM users WHERE id = ?', [proposal.created_by]);
    const repUser = await TransactionManager.query(db, 'SELECT name FROM users WHERE id = ?', [userId]);
    if (proposer?.email) {
      sendRepresentativeRejectionEmail({
        toEmail: proposer.email,
        proposerName: proposer.name || 'Member',
        representativeName: repUser?.name || 'Representative',
        itemTitle: proposal.title,
        itemType: 'rule_proposal',
        reason: reason.trim()
      }).catch((emailErr) => logger.error('Failed to send rule proposal decline email', { error: emailErr.message, proposalId, proposerId: proposal.created_by }));
    }
    try {
      broadcastOrganizationUpdate(organizationId, 'rule-proposal-declined', { organizationId, proposalId, title: proposal.title });
    } catch (wsErr) {
      logger.warn('Failed to broadcast rule proposal declined update', { error: wsErr.message, proposalId, organizationId });
    }
    res.json({ success: true, message: 'Rule proposal declined' });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error declining rule proposal', { error: error.message, stack: error.stack, organizationId, proposalId, userId });
    throw ApiError.database('Failed to decline proposal', { organizationId, proposalId, ...(process.env.NODE_ENV !== 'production' && { message: error.message }) }, 'INTERNAL_ERROR');
  }
}));

// Withdraw rule proposal
router.post('/:organizationId/rule-proposals/:proposalId/withdraw', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  if (!db) throw ApiError.database('Database connection not available', { endpoint: 'withdraw' }, 'DB_UNAVAILABLE');
  const { organizationId, proposalId } = req.params;
  const userId = getUserId(req);
  const auditContext = { ip: req.ip, userAgent: req.get('User-Agent') };
  try {
    const result = await RuleProposalService.withdrawRuleProposal(db, organizationId, proposalId, userId, auditContext);
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error withdrawing rule proposal', { error: error.message, organizationId, proposalId });
    throw ApiError.database('Failed to withdraw rule proposal');
  }
}));

// Vote on rule proposal
router.post('/:organizationId/rule-proposals/:proposalId/vote', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  if (!db) throw ApiError.database('Database connection not available', { endpoint: 'vote' }, 'DB_UNAVAILABLE');
  const { organizationId, proposalId } = req.params;
  const userId = getUserId(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const selectedOptionId = body.selected_option_id ?? body.selectedOptionId;
  let voteChoice = body.vote_choice ?? body.voteChoice;
  const vote = body.vote;
  if (!voteChoice && vote) voteChoice = vote;
  if (selectedOptionId && !voteChoice) voteChoice = 'yes';
  try {
    const result = await RuleProposalService.castRuleProposalVote(db, organizationId, proposalId, userId, { voteChoice, selectedOptionId });
    UnifiedVotingService.invalidateCache(organizationId, 'organization', proposalId);
    RuleProposalService.broadcastRuleProposalVoteUpdate(db, organizationId, proposalId, userId, result.normalizedVote, result.action).catch(err => {
      logger.error('Error broadcasting vote update (non-blocking)', { error: err.message, proposalId });
    });
    res.json({
      success: true,
      message: result.action === 'updated' ? 'Vote updated successfully' : 'Vote recorded successfully',
      receiptId: result.receiptId,
      contestId: proposalId,
      voteType: 'governance_rule',
      voteRecordedAt: result.votedAt
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error voting on rule proposal', { error: error.message, stack: error.stack, proposalId: req.params.proposalId, organizationId: req.params.organizationId, userId });
    throw ApiError.database('Failed to cast vote', { proposalId: req.params.proposalId, organizationId: req.params.organizationId, ...(process.env.NODE_ENV !== 'production' && { message: error.message }) }, 'INTERNAL_ERROR');
  }
}));

// Get comprehensive status information for a rule proposal
router.get('/:organizationId/rule-proposals/:proposalId/status', requireAuth, requireOrganizationMember, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId, proposalId } = req.params;
  const userId = getUserId(req);
  try {
    const result = await RuleProposalService.getRuleProposalStatus(db, organizationId, proposalId, userId, req.user.role);
    res.json(result);
  } catch (error) {
    logger.error('Error fetching proposal status', { error: error.message, stack: error.stack, proposalId: req.params.proposalId, organizationId: req.params.organizationId, userId });
    next(error);
  }
}));

// Complete rule proposal voting
router.post('/:organizationId/rule-proposals/:proposalId/complete', requireAuth, requireOrganizationMember, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId, proposalId } = req.params;
  const userId = getUserId(req);
  try {
    const rules = await GovernanceRulesService.getGovernanceRules(db, organizationId);
    const canManage = await canManageRuleProposals(db, userId, organizationId, rules, req.user.role);
    if (!canManage) return next(ApiError.forbidden('You do not have permission to complete voting', 'CANNOT_COMPLETE_VOTING'));

    const result = await RuleProposalService.completeRuleProposal(db, organizationId, proposalId, userId);
    const proposal = result.proposal;

    if (result.approved) {
      const { updateSafetyTracking } = require('../../modules/safety-mechanisms');
      updateSafetyTracking(db, organizationId, true).catch(err => logger.warn('Failed to update safety tracking', { error: err.message, proposalId, organizationId }));
      const { invalidatePermissionCache } = require('../../modules/permissions');
      invalidatePermissionCache(organizationId);
      const responseCache = req.app.locals.responseCache;
      if (responseCache) await responseCache.del(`gov_rules:${organizationId}`);
      logAudit(db, organizationId, 'rule_proposal_approved', userId, null, {
        proposalId,
        ruleField: proposal.current_rule_field,
        oldValue: proposal.current_rule_value,
        newValue: proposal.proposed_rule_value,
        approvalPercentage: result.approvalResult.approvalPercentage
      }, req);
      broadcastOrganizationUpdate(organizationId, 'rule-proposal-approved', {
        organizationId,
        proposalId,
        ruleField: proposal.current_rule_field,
        newValue: proposal.proposed_rule_value,
        approvalPercentage: result.approvalResult.approvalPercentage
      });
      try {
        const notificationService = require('../../modules/notifications');
        const config = require('../../config');
        const frontendUrl = config.FRONTEND_URL || 'http://localhost:3001';
        const members = await TransactionManager.queryAll(db, `SELECT u.id as user_id FROM organization_members om JOIN users u ON om.user_id = u.id WHERE om.organization_id = ? AND om.status = 'active' AND om.user_id NOT IN (SELECT id FROM organizations)`, [organizationId]);
        if (members.length > 0) {
          const { extractUserIds } = require('../../utils/memberUtils');
          const userIds = extractUserIds(members);
          const orgRow = await TransactionManager.query(db, 'SELECT name FROM organizations WHERE id = ?', [organizationId]);
          const eventData = { title: `Rule Proposal Approved: ${proposal.title || 'Rule Change'}`, message: `Rule proposal "${proposal.title || 'Rule Change'}" was approved with ${result.approvalResult.approvalPercentage.toFixed(1)}% approval`, link: require('../../emails/urls').orgTab(organizationId, 'governance'), organizationName: orgRow?.name };
          await notificationService.notifyUsers(db, userIds, 'rule_proposal_approved', eventData, false);
        }
      } catch (notifErr) {
        logger.error('Error queueing rule proposal approval for digest', { error: notifErr.message, proposalId });
      }
      const docs = await TransactionManager.queryAll(db, 'SELECT id FROM documents WHERE organization_id = ?', [organizationId]);
      docs.forEach(doc => {
        broadcastDocumentUpdate(doc.id, 'rule-proposal-approved', { organizationId, proposalId, ruleField: proposal.current_rule_field, newValue: proposal.proposed_rule_value, approvalPercentage: result.approvalResult.approvalPercentage });
      });
      res.json({ success: true, message: 'Rule proposal approved and implemented', approved: true, approvalRate: result.approvalRate, newRuleValue: result.newRuleValue });
    } else {
      const { updateSafetyTracking } = require('../../modules/safety-mechanisms');
      await updateSafetyTracking(db, organizationId, false);
      logAudit(db, organizationId, 'rule_proposal_rejected', userId, null, { proposalId, approvalRate: result.approvalRate, threshold: result.threshold }, req);
      broadcastOrganizationUpdate(organizationId, 'rule-proposal-rejected', { organizationId, proposalId, approvalRate: result.approvalRate, threshold: result.threshold });
      try {
        const notificationService = require('../../modules/notifications');
        const config = require('../../config');
        const frontendUrl = config.FRONTEND_URL || 'http://localhost:3001';
        const prop = await TransactionManager.query(db, 'SELECT title FROM governance_rule_proposals WHERE id = ?', [proposalId]);
        if (prop) {
          const members = await TransactionManager.queryAll(db, `SELECT u.id as user_id FROM organization_members om JOIN users u ON om.user_id = u.id WHERE om.organization_id = ? AND om.status = 'active' AND om.user_id NOT IN (SELECT id FROM organizations)`, [organizationId]);
          if (members && members.length > 0) {
            const { extractUserIds } = require('../../utils/memberUtils');
            const userIds = extractUserIds(members);
            const orgRow = await TransactionManager.query(db, 'SELECT name FROM organizations WHERE id = ?', [organizationId]);
            const eventData = { title: `Rule Proposal Rejected: ${prop.title || 'Rule Change'}`, message: `Rule proposal "${prop.title || 'Rule Change'}" was rejected (${result.approvalRate.toFixed(1)}% approval, required: ${result.threshold}%)`, link: require('../../emails/urls').orgTab(organizationId, 'governance'), organizationName: orgRow?.name };
            await notificationService.notifyUsers(db, userIds, 'rule_proposal_rejected', eventData, false);
          }
        }
      } catch (notifErr) {
        logger.error('Error queueing rule proposal rejection for digest', { error: notifErr.message, proposalId });
      }
      res.json({ success: true, message: 'Rule proposal rejected due to insufficient approval', approved: false, approvalRate: result.approvalRate, threshold: result.threshold });
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error completing rule proposal', { error: error.message, stack: error.stack, proposalId, organizationId });
    throw ApiError.database(error.message || 'Failed to complete rule proposal');
  }
}));

module.exports = router;
