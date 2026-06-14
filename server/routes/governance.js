const express = require('express');
const { requireAuth, requireOrganizationMember } = require('../middleware/auth');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { logger } = require('../middleware/logger');
const {
  isRepresentative,
  isActiveMember,
  canProposeRules,
  canCreateDocuments,
  canInitializeElections,
  canInviteMembers,
  canManageRuleProposals,
  canStartDocumentVoting
} = require('../modules/permissions');
const { getUserOrganizationStatus } = require('../utils/permissionUtils');
const { getUserId } = require('../utils/routeHelpers');
const electionsRouter = require('./governance/elections');
const ruleProposalsRouter = require('./governance/rule-proposals');
const representativesRouter = require('./governance/representatives');
const auditRouter = require('./governance/audit');
const GovernanceRulesService = require('../services/governance/GovernanceRulesService');
const { broadcastDocumentUpdate, broadcastOrganizationUpdate } = require('../utils/websocketBroadcast');
const { logAudit, validateStatusTransition, getStatusInfo, generateAnonymousToken, hashVote } = require('./governance/helpers');
const { TTL } = require('../utils/responseCache');

const router = express.Router();

// Sub-routers (mount before core routes so they handle their paths)
router.use('/', electionsRouter);
router.use('/', ruleProposalsRouter);
router.use('/', representativesRouter);
router.use('/', auditRouter);

// Get governance rules for organization (cached)
router.get('/:organizationId/governance-rules', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const knex = req.app.locals.knex || req.app.locals.db;
  const db = knex; // For backward compatibility
  const { organizationId } = req.params;

  const defaultRules = {
    id: null,
    organizationId: organizationId,
    representativeTermMonths: 12,
    representativeTermLimits: null,
    electionVotingMethod: 'simple_majority',
    electionQuorumPercentage: 0.5,
    electionNoticeDays: 14,
    defaultVotingDeadlineHours: 168,
    defaultQuorumPercentage: 0.5,
    documentProposalPeriodDays: 365,
    paragraphProposalCutoffDays: 7,
    thresholdCalculationMethod: 'all_members',
    defaultAcceptanceThreshold: 75.0,
    anonymousVotingEnabled: true,
    voteChangeAllowed: false,
    representativeCanCreateVotes: true,
    representativeCanInviteMembers: true,
    representativeCanManageDocuments: true,
    representativeApprovalRequired: true,
    tamperProofEnabled: true,
    auditTrailEnabled: true,
    createdAt: null,
    updatedAt: null
  };

  const cache = req.app.locals.responseCache;
  const cacheKey = `gov_rules:${organizationId}`;
  if (cache) {
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);
  }

  try {
    const rules = await GovernanceRulesService.getGovernanceRules(db, organizationId);
    const payload = { governanceRules: rules || defaultRules };
    if (cache) await cache.set(cacheKey, payload, TTL.GOV_RULES_MS);
    res.json(payload);
  } catch (error) {
    logger.error('Error fetching governance rules', { error: error.message, stack: error.stack, organizationId: req.params.organizationId });
    throw ApiError.database('Failed to fetch governance rules');
  }
}));

// Get organization permissions for current user
router.get('/:organizationId/permissions', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const knex = req.app.locals.knex || req.app.locals.db;
  const db = knex; // For backward compatibility
  const { organizationId } = req.params;
  const userId = getUserId(req);
  const userRole = req.user.role;

  try {
    const rules = await GovernanceRulesService.getGovernanceRules(db, organizationId);
    // Use status from middleware instead of re-checking
    const status = req.organizationMemberStatus || await getUserOrganizationStatus(db, userId, organizationId, userRole);
    const isRep = status.isRepresentative;
    const isMember = status.isActiveMember;
    const isAdmin = status.isAdmin;

    const permissions = {
      canProposeRules: await canProposeRules(db, userId, organizationId, rules, userRole),
      canCreateDocuments: await canCreateDocuments(db, userId, organizationId, rules, userRole),
      canInitializeElections: await canInitializeElections(db, userId, organizationId, rules, userRole),
      canInviteMembers: await canInviteMembers(db, userId, organizationId, rules, userRole),
      canManageRuleProposals: await canManageRuleProposals(db, userId, organizationId, rules, userRole),
      canStartDocumentVoting: await canStartDocumentVoting(db, userId, organizationId, rules, userRole),
      canVoteInElections: isMember || isRep || isAdmin,
      canViewAnalytics: isMember || isRep || isAdmin,
      canExportData: isRep || isAdmin,
      canManageOrganization: isRep || isAdmin
    };

    res.json({
      success: true,
      permissions,
      context: {
        isRepresentative: isRep,
        isActiveMember: isMember,
        isAdmin,
        bootstrapMode: rules?.bootstrapMode ?? false,
        recoveryMode: rules?.recoveryMode ?? false
      }
    });
  } catch (error) {
    logger.error('Error fetching permissions', { error: error.message, organizationId, userId });
    throw ApiError.database('Failed to fetch permissions');
  }
}));

// Get bootstrap status for organization
router.get('/:organizationId/bootstrap-status', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId } = req.params;
  const userId = getUserId(req);
  try {
    const result = await GovernanceRulesService.getBootstrapStatus(db, organizationId, userId, req.user.role);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Error fetching bootstrap status', { error: error.message, organizationId });
    throw ApiError.database('Failed to fetch bootstrap status');
  }
}));

// Complete bootstrap mode
router.post('/:organizationId/bootstrap/complete', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId } = req.params;
  const userId = getUserId(req);
  try {
    const bootstrap = await GovernanceRulesService.completeBootstrap(db, organizationId, userId, req.body, req);
    res.json({
      success: true,
      message: 'Bootstrap completed successfully',
      bootstrap: { mode: bootstrap.mode, completedAt: bootstrap.completedAt }
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error completing bootstrap', { error: error.message, organizationId });
    throw ApiError.database('Failed to complete bootstrap');
  }
}));

// Update governance rules (representatives only)
router.put('/:organizationId/governance-rules', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId } = req.params;
  const userId = getUserId(req);
  const updates = req.body;
  try {
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) {
      throw ApiError.forbidden('Only representatives can update governance rules');
    }
    const { updates: appliedUpdates, documentIds } = await GovernanceRulesService.updateGovernanceRules(db, organizationId, userId, updates, req);
    const responseCache = req.app.locals.responseCache;
    if (responseCache) await responseCache.del(`gov_rules:${organizationId}`);
    broadcastOrganizationUpdate(organizationId, 'governance-rules-updated', {
      organizationId,
      updates: appliedUpdates,
      updatedBy: userId
    });
    if (documentIds && documentIds.length > 0) {
      documentIds.forEach(docId => {
        broadcastDocumentUpdate(docId, 'governance-rules-updated', {
          organizationId,
          updates: appliedUpdates,
          updatedBy: userId
        });
      });
    }
    res.json({ success: true, message: 'Governance rules updated successfully' });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('Error updating governance rules', {
      error: err.message,
      code: err.code,
      organizationId: req.params.organizationId,
      stack: err.stack
    });
    if (err.message && (err.message.includes('no such column') || err.message.includes('no column named'))) {
      const columnMatch = err.message.match(/no such column: (\w+)|no column named (\w+)/i);
      const missingColumn = columnMatch ? (columnMatch[1] || columnMatch[2]) : 'unknown';
      logger.error('Database schema mismatch detected', { missingColumn, organizationId: req.params.organizationId });
      throw ApiError.database(
        'Database schema mismatch: missing column',
        {
          message: `The column "${missingColumn}" is missing from the database. This usually means database migrations need to be run.`,
          field: missingColumn,
          migrationHint: 'Migrations run automatically on application startup. Check migration_history table to verify migrations have executed. Restart the application if needed.',
          organizationId: req.params.organizationId
        },
        'SCHEMA_MISMATCH'
      );
    }
    throw ApiError.database('Failed to update governance rules', { originalError: err.message });
  }
}));

// Re-exports for backward compatibility (scheduler, document-status, votes, admin)
module.exports = router;
module.exports.generateAnonymousToken = generateAnonymousToken;
module.exports.hashVote = hashVote;
module.exports.getGovernanceRules = GovernanceRulesService.getGovernanceRules;
module.exports.createDefaultGovernanceRules = GovernanceRulesService.createDefaultGovernanceRules;
module.exports.validateStatusTransition = validateStatusTransition;
module.exports.getStatusInfo = getStatusInfo;
