/**
 * Organization vote routes (list, create, approve, decline, vote, complete).
 * Mounted under /api/organizations by the main organizations router.
 */

const express = require('express');
const { requireAuth, requireOrganizationMember } = require('../../middleware/auth');
const { asyncHandler, ApiError } = require('../../middleware/errorHandler');
const { logger } = require('../../middleware/logger');
const { organizationValidation } = require('../../middleware/validation');
const { getUserId } = require('../../utils/routeHelpers');
const OrganizationService = require('../../services/OrganizationService');

const router = express.Router({ mergeParams: true });

// Get organization votes
router.get('/:organizationId/votes', requireAuth, requireOrganizationMember, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  try {
    const userId = getUserId(req);
    const result = await OrganizationService.listOrganizationVotes(db, organizationId, userId);
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error fetching votes', { error: error.message, stack: error.stack, organizationId: req.params.organizationId });
    throw ApiError.database('Internal server error');
  }
}));

// Create organization vote
router.post('/:organizationId/votes', requireAuth, requireOrganizationMember, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = getUserId(req);
  try {
    const result = await OrganizationService.createOrganizationVote(db, organizationId, userId, req.body, req);
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const errMsg = error?.message || String(error);
    const isMissingTable = /no such table|relation .* does not exist/i.test(errMsg);
    logger.error('Error creating organization vote', {
      error: errMsg,
      stack: error?.stack,
      organizationId: req.params.organizationId,
      userId,
      voteType: req.body?.vote_type ?? req.body?.voteType,
      targetDocumentId: req.body?.target_document_id ?? req.body?.targetDocumentId,
      code: error?.code,
      isMissingTable
    });
    if (isMissingTable) {
      logger.warn('organization_votes table may be missing. Ensure add-organization-votes-table migration has run.');
    }
    throw ApiError.database('Failed to create vote. Please try again or contact support.', null, 'CREATE_VOTE_FAILED');
  }
}));

// Approve vote (representatives only)
router.post('/:organizationId/votes/:voteId/approve', requireAuth, requireOrganizationMember, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const { organizationId, voteId } = req.params;
  const userId = getUserId(req);
  try {
    const result = await OrganizationService.approveVote(db, organizationId, voteId, userId, req);
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error approving vote', { error: error.message, stack: error.stack, voteId: req.params.voteId, organizationId: req.params.organizationId });
    throw ApiError.database('Internal server error');
  }
}));

// Decline vote (representatives only)
router.post('/:organizationId/votes/:voteId/decline', requireAuth, requireOrganizationMember, ...organizationValidation.declineVote, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const { organizationId, voteId } = req.params;
  const userId = getUserId(req);
  try {
    const result = await OrganizationService.declineVote(db, organizationId, voteId, userId, req.body, req);
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error declining vote', { error: error.message, stack: error.stack, voteId: req.params.voteId, organizationId: req.params.organizationId });
    throw ApiError.database('Internal server error');
  }
}));

// Cast vote in organization vote
router.post('/:organizationId/votes/:voteId/vote', requireAuth, requireOrganizationMember, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const { organizationId, voteId } = req.params;
  const userId = getUserId(req);
  try {
    const result = await OrganizationService.castOrganizationVote(db, organizationId, voteId, userId, req.body, req);
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error casting vote', { error: error.message, stack: error.stack, voteId: req.params.voteId, userId });
    throw ApiError.database('Internal server error');
  }
}));

// Complete organization vote
router.post('/:organizationId/votes/:voteId/complete', requireAuth, requireOrganizationMember, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const { organizationId, voteId } = req.params;
  const userId = getUserId(req);
  try {
    const result = await OrganizationService.completeOrganizationVote(db, organizationId, voteId, userId, req);
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error completing vote', { error: error.message, stack: error.stack, voteId: req.params.voteId, organizationId: req.params.organizationId });
    throw ApiError.database('Internal server error');
  }
}));

module.exports = router;
