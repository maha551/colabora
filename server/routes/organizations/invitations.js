/**
 * Organization invitation routes (validate, accept, decline, pending, list, resend).
 * Mounted under /api/organizations by the main organizations router.
 */

const express = require('express');
const { requireAuth, requireOrganizationMember } = require('../../middleware/auth');
const { asyncHandler, ApiError } = require('../../middleware/errorHandler');
const { logger } = require('../../middleware/logger');
const { paramValidation } = require('../../middleware/validation');
const { addMemberToOrganizationDocuments } = require('../../modules/document-collaborator-sync');
const { getUserId } = require('../../utils/routeHelpers');
const OrganizationService = require('../../services/OrganizationService');
const { logAudit } = OrganizationService;

const router = express.Router({ mergeParams: true });

// Validate invitation token
router.get('/invitations/validate/:token', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { token } = req.params;
  try {
    const result = await OrganizationService.validateInvitationToken(db, token);
    if (result.valid === false) {
      if (result.error === 'Invalid invitation token') return res.status(404).json(result);
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error validating invitation token', { error: error.message, stack: error.stack });
    throw ApiError.database('Internal server error');
  }
}));

// Accept invitation (for logged-in users)
router.post('/invitations/:token/accept', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { token } = req.params;
  const userId = getUserId(req);
  const userEmail = req.user.email;

  try {
    const result = await OrganizationService.acceptInvitationByToken(db, token, userId, userEmail);
    const organizationId = result.organizationId;
    const organizationName = result.organizationName;
    const invitationType = result.invitationType;

    if (result.outcome === 'already_member') {
      return res.json({
        success: true,
        message: 'You are already a member of this organization',
        alreadyMember: true,
        organization: { id: organizationId, name: organizationName },
        invitationType,
      });
    }

    try {
      await addMemberToOrganizationDocuments(db, organizationId, userId);
    } catch (syncErr) {
      logger.error('Error adding member to documents during invitation acceptance', { error: syncErr.message, organizationId, userId });
    }
    const responseCache = req.app.locals.responseCache;
    if (responseCache) await responseCache.del(`orgs:user:${userId}`);
    logAudit(db, organizationId, 'invitation_accepted', userId, null, { invitationId: result.invitationId, invitationType }, req);
    const webSocketManager = require('../../modules/websocket');
    webSocketManager.broadcastOrganizationUpdate(organizationId, 'member-joined', { userId, invitationType });

    res.json({
      success: true,
      message: 'Invitation accepted successfully',
      organization: { id: organizationId, name: organizationName },
      invitationType
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error accepting invitation', { error: error.message, stack: error.stack, token, userId });
    throw ApiError.database('Failed to accept invitation');
  }
}));

// Decline invitation by token (logged-in users)
router.post('/invitations/:token/decline', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { token } = req.params;
  const userId = getUserId(req);
  const userEmail = req.user.email;
  try {
    const result = await OrganizationService.declineInvitationByToken(db, token, userId, userEmail, req);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error declining invitation', { error: error.message, token, userId });
    throw ApiError.database('Failed to decline invitation');
  }
}));

// Get pending invitations for current user
router.get('/invitations/pending', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const userEmail = req.user.email;
  try {
    const result = await OrganizationService.getPendingInvitationsForUser(db, userEmail);
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error fetching pending invitations', { error: error.message, stack: error.stack, userEmail });
    throw ApiError.database('Failed to fetch pending invitations');
  }
}));

// Accept invitation by id (for pending list; logged-in users)
router.post('/invitations/accept-by-id', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const userId = getUserId(req);
  const userEmail = req.user.email;
  const invitationId = req.body?.invitationId ?? req.body?.invitation_id;

  if (!invitationId || typeof invitationId !== 'string') {
    const err = ApiError.badRequest('invitationId is required', null, 'VALIDATION_ERROR');
    return res.status(err.statusCode).json(err.toJSON());
  }

  try {
    const result = await OrganizationService.acceptInvitationById(db, invitationId, userId, userEmail);
    const organizationId = result.organizationId;
    const organizationName = result.organizationName;
    const invitationType = result.invitationType;

    if (result.outcome === 'already_member') {
      return res.json({
        success: true,
        message: 'You are already a member of this organization',
        alreadyMember: true,
        organization: { id: organizationId, name: organizationName },
        invitationType,
      });
    }

    try {
      await addMemberToOrganizationDocuments(db, organizationId, userId);
    } catch (syncErr) {
      logger.error('Error adding member to documents during invitation accept-by-id', { error: syncErr.message, organizationId, userId });
    }
    const responseCache = req.app.locals.responseCache;
    if (responseCache) await responseCache.del(`orgs:user:${userId}`);
    logAudit(db, organizationId, 'invitation_accepted', userId, null, { invitationId: result.invitationId, invitationType }, req);
    const webSocketManager = require('../../modules/websocket');
    webSocketManager.broadcastOrganizationUpdate(organizationId, 'member-joined', { userId, invitationType });

    res.json({
      success: true,
      message: 'Invitation accepted successfully',
      organization: { id: organizationId, name: organizationName },
      invitationType
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error accepting invitation by id', { error: error.message, invitationId, userId });
    throw ApiError.database('Failed to accept invitation');
  }
}));

// Decline invitation by id (for pending list; logged-in users)
router.post('/invitations/decline-by-id', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const userId = getUserId(req);
  const userEmail = req.user.email;
  const invitationId = req.body?.invitationId ?? req.body?.invitation_id;
  if (!invitationId || typeof invitationId !== 'string') {
    const err = ApiError.badRequest('invitationId is required', null, 'VALIDATION_ERROR');
    return res.status(err.statusCode).json(err.toJSON());
  }
  try {
    const result = await OrganizationService.declineInvitationById(db, invitationId, userId, userEmail, req);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error declining invitation by id', { error: error.message, invitationId });
    throw ApiError.database('Failed to decline invitation');
  }
}));

// Get invitation history for organization
router.get('/:organizationId/invitations', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = getUserId(req);
  try {
    const result = await OrganizationService.getOrganizationInvitations(db, organizationId, userId, req);
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error fetching invitations', { error: error.message, stack: error.stack, organizationId });
    throw ApiError.database('Internal server error');
  }
}));

// Resend invitation email
router.post('/:organizationId/invitations/:invitationId/resend', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const { organizationId, invitationId } = req.params;
  const userId = getUserId(req);
  try {
    const result = await OrganizationService.resendInvitation(db, organizationId, invitationId, userId, req);
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error resending invitation', { error: error.message, organizationId, invitationId });
    throw ApiError.database('Internal server error');
  }
}));

module.exports = router;
