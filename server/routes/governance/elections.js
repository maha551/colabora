/**
 * Election routes under /api/governance/:organizationId/elections
 */

const express = require('express');
const { requireAuth, requireOrganizationMember } = require('../../middleware/auth');
const { asyncHandler, ApiError } = require('../../middleware/errorHandler');
const { logger } = require('../../middleware/logger');
const { getUserId } = require('../../utils/routeHelpers');
const { isRepresentative, canInitializeElections } = require('../../modules/permissions');
const ElectionService = require('../../services/ElectionService');
const GovernanceRulesService = require('../../services/governance/GovernanceRulesService');
const { handleGovernanceEndpointError } = require('./helpers');

const electionCommentRoutes = require('../election-comments');

const router = express.Router({ mergeParams: true });

router.use('/:organizationId/elections/:electionId/comments', electionCommentRoutes);

// Get election results
router.get('/:organizationId/elections/:electionId/results', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId, electionId } = req.params;
  try {
    const result = await ElectionService.getElectionResults(db, organizationId, electionId);
    res.json(result);
  } catch (error) {
    handleGovernanceEndpointError(error, 'election results', req.params.organizationId, getUserId(req, false));
  }
}));

// Get user's vote status for an election
router.get('/:organizationId/elections/:electionId/user-vote-status', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId, electionId } = req.params;
  const userId = getUserId(req);
  try {
    const result = await ElectionService.getUserVoteStatus(db, organizationId, electionId, userId);
    res.json(result);
  } catch (error) {
    handleGovernanceEndpointError(error, 'vote status', req.params.organizationId, getUserId(req, false));
  }
}));

// Create representative election
router.post('/:organizationId/elections', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId } = req.params;
  const userId = getUserId(req);
  try {
    const rules = await GovernanceRulesService.getGovernanceRules(db, organizationId);
    const canInitialize = await canInitializeElections(db, userId, organizationId, rules, req.user.role);
    if (!canInitialize) throw ApiError.forbidden('You do not have permission to create elections', { message: 'Check your organization\'s governance rules to see who can initialize elections' }, 'PERMISSION_DENIED');
    const auditContext = { ip: req.ip, userAgent: req.get('User-Agent') };
    const result = await ElectionService.createElection(db, organizationId, userId, req.body, auditContext);
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error creating election', { error: error.message, organizationId: req.params.organizationId });
    throw ApiError.database('Failed to create election');
  }
}));

// Get elections for organization
router.get('/:organizationId/elections', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId } = req.params;
  try {
    const result = await ElectionService.listElections(db, organizationId);
    res.json(result);
  } catch (error) {
    handleGovernanceEndpointError(error, 'elections', req.params.organizationId, getUserId(req, false));
  }
}));

// Nominate candidate for election
router.post('/:organizationId/elections/:electionId/candidates', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId, electionId } = req.params;
  const userId = getUserId(req);
  try {
    const result = await ElectionService.nominateCandidate(db, organizationId, electionId, userId, req.body);
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error nominating candidate', { error: error.message, electionId: req.params.electionId, organizationId: req.params.organizationId });
    throw ApiError.database('Failed to nominate candidate');
  }
}));

// Accept nomination
router.post('/:organizationId/elections/:electionId/candidates/:candidateId/accept', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId, electionId, candidateId } = req.params;
  const userId = getUserId(req);
  try {
    const result = await ElectionService.acceptNomination(db, organizationId, electionId, candidateId, userId);
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error accepting nomination', { error: error.message, electionId: req.params.electionId, candidateId: req.params.candidateId });
    throw ApiError.database('Failed to accept nomination');
  }
}));

// Start election voting
router.post('/:organizationId/elections/:electionId/start', requireAuth, requireOrganizationMember, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId, electionId } = req.params;
  const userId = getUserId(req);
  try {
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) return next(ApiError.forbidden('Only representatives can start elections', 'NOT_REPRESENTATIVE'));
    const auditContext = { ip: req.ip, userAgent: req.get('User-Agent') };
    const result = await ElectionService.startElection(db, organizationId, electionId, userId, req.body, auditContext);
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error starting election', { error: error.message, electionId: req.params.electionId, organizationId: req.params.organizationId });
    throw ApiError.database('Failed to start election', { originalError: error.message }, 'START_ELECTION_FAILED');
  }
}));

// Cast vote in election
router.post('/:organizationId/elections/:electionId/vote', requireAuth, requireOrganizationMember, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId, electionId } = req.params;
  const userId = getUserId(req);
  try {
    const result = await ElectionService.castElectionVote(db, organizationId, electionId, userId, req.body);
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error in election voting endpoint', { error: error.message, electionId: req.params.electionId, organizationId });
    throw ApiError.database('Failed to cast vote', { originalError: error.message }, 'CAST_VOTE_FAILED');
  }
}));

// Update election phase (draft -> nomination -> voting -> completed)
router.post('/:organizationId/elections/:electionId/update-phase', requireAuth, requireOrganizationMember, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId, electionId } = req.params;
  const userId = getUserId(req);
  try {
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) return next(ApiError.forbidden('Only representatives can update election phases', 'NOT_REPRESENTATIVE'));
    const auditContext = { ip: req.ip, userAgent: req.get('User-Agent') };
    const result = await ElectionService.updateElectionPhase(db, organizationId, electionId, userId, req.body, auditContext);
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error updating election phase', { error: error.message, electionId: req.params.electionId });
    throw ApiError.database('Failed to update election phase', { originalError: error.message }, 'UPDATE_ELECTION_PHASE_FAILED');
  }
}));

// Check and advance election phases (called by scheduler or manually)
router.post('/:organizationId/elections/check-phase-transitions', requireAuth, requireOrganizationMember, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId } = req.params;
  const userId = getUserId(req);
  try {
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) return next(ApiError.forbidden('Only representatives can trigger phase transitions', 'NOT_REPRESENTATIVE'));
    const result = await ElectionService.checkPhaseTransitions(db, organizationId);
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error checking phase transitions', { error: error.message, organizationId });
    throw ApiError.database('Failed to check phase transitions', { originalError: error.message }, 'CHECK_PHASE_TRANSITIONS_FAILED');
  }
}));

// Force election phase transition (manual override)
router.post('/:organizationId/elections/:electionId/force-phase', requireAuth, requireOrganizationMember, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId, electionId } = req.params;
  const userId = getUserId(req);
  try {
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) return next(ApiError.forbidden('Only representatives can force phase transitions', 'NOT_REPRESENTATIVE'));
    const auditContext = { ip: req.ip, userAgent: req.get('User-Agent') };
    const result = await ElectionService.forcePhase(db, organizationId, electionId, userId, req.body, auditContext);
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error forcing election phase', { error: error.message, electionId });
    throw ApiError.database('Failed to force phase transition', { originalError: error.message }, 'FORCE_PHASE_TRANSITION_FAILED');
  }
}));

// Auto-schedule elections based on term expiration
router.post('/:organizationId/elections/auto-schedule', requireAuth, requireOrganizationMember, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId } = req.params;
  const userId = getUserId(req);
  try {
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) return next(ApiError.forbidden('Only representatives can auto-schedule elections', 'NOT_REPRESENTATIVE'));
    const auditContext = { ip: req.ip, userAgent: req.get('User-Agent') };
    const result = await ElectionService.autoScheduleElections(db, organizationId, userId, auditContext);
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error auto-scheduling election', { error: error.message, organizationId: req.params.organizationId });
    throw ApiError.database('Failed to auto-schedule election', { originalError: error.message }, 'AUTO_SCHEDULE_ELECTION_FAILED');
  }
}));

// Cancel election (rep or creator only; allowed when not yet completed)
router.post('/:organizationId/elections/:electionId/cancel', requireAuth, requireOrganizationMember, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId, electionId } = req.params;
  const userId = getUserId(req);
  try {
    const result = await ElectionService.cancelElection(db, organizationId, electionId, userId);
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error cancelling election', { error: error.message, electionId, organizationId });
    throw ApiError.database('Failed to cancel election');
  }
}));

// Complete election and tabulate results
router.post('/:organizationId/elections/:electionId/complete', requireAuth, requireOrganizationMember, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId, electionId } = req.params;
  const userId = getUserId(req);
  try {
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) return next(ApiError.forbidden('Only representatives can complete elections', 'NOT_REPRESENTATIVE'));
    const auditContext = { ip: req.ip, userAgent: req.get('User-Agent') };
    const result = await ElectionService.completeElection(db, organizationId, electionId, userId, auditContext);
    res.json(result);
  } catch (error) {
    logger.error('Error completing election', { error: error.message, electionId, organizationId });
    if (error instanceof ApiError) throw error;
    throw ApiError.database('Failed to complete election');
  }
}));

module.exports = router;
