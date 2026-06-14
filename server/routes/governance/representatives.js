/**
 * Representative routes under /api/governance/:organizationId/representatives
 */

const express = require('express');
const { requireAuth, requireOrganizationMember } = require('../../middleware/auth');
const { asyncHandler, ApiError } = require('../../middleware/errorHandler');
const { logger } = require('../../middleware/logger');
const { getUserId } = require('../../utils/routeHelpers');
const { isRepresentative, isActiveMember } = require('../../modules/permissions');
const RepresentativeService = require('../../services/governance/RepresentativeService');

const router = express.Router({ mergeParams: true });

router.post('/:organizationId/representatives/:repId/resign', requireAuth, requireOrganizationMember, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId, repId } = req.params;
  const userId = getUserId(req);
  const auditContext = { ip: req.ip, userAgent: req.get('User-Agent') };
  try {
    const result = await RepresentativeService.resignRepresentative(db, organizationId, repId, userId, auditContext);
    const responseCache = req.app.locals.responseCache;
    if (responseCache) await responseCache.del(`orgs:user:${repId}`);
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error in resignation endpoint', { error: error.message, organizationId, repId });
    throw ApiError.database(error.message || 'Failed to process resignation', { originalError: error.message }, 'PROCESS_RESIGNATION_FAILED');
  }
}));

router.get('/:organizationId/representatives/pending-resignations', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId } = req.params;
  const userId = getUserId(req);
  try {
    const hasAccess = await isRepresentative(db, userId, organizationId) || await isActiveMember(db, userId, organizationId);
    if (!hasAccess) throw ApiError.forbidden('Access denied');
    const result = await RepresentativeService.getPendingResignations(db, organizationId);
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error fetching pending resignations', { error: error.message, organizationId });
    throw ApiError.database('Failed to fetch pending resignations', { originalError: error.message }, 'FETCH_PENDING_RESIGNATIONS_FAILED');
  }
}));

router.post('/:organizationId/representatives/:repId/mistrust-vote', requireAuth, requireOrganizationMember, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId, repId } = req.params;
  const userId = getUserId(req);
  const auditContext = { ip: req.ip, userAgent: req.get('User-Agent') };
  try {
    const result = await RepresentativeService.initiateMistrustVote(db, organizationId, repId, userId, auditContext);
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error initiating mistrust vote', { error: error.message, organizationId, repId, userId });
    throw ApiError.database('Failed to initiate mistrust vote', { originalError: error.message }, 'INITIATE_MISTRUST_VOTE_FAILED');
  }
}));

module.exports = router;
