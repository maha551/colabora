const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { metricsCollector } = require('../middleware/monitoring');
const { documentValidation: documentCreateValidation } = require('../middleware/validation');
const { requireAuth, requireDocumentAccess, requireOrganizationMember } = require('../middleware/auth');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const TransactionManager = require('../database/services/TransactionManager');
const { broadcastDocumentUpdate, broadcastOrganizationUpdate } = require('../utils/websocketBroadcast');
const { logger } = require('../middleware/logger');
const { safeJsonParse, safeJsonParseArray } = require('../utils/jsonUtils');
const UserService = require('../database/services/UserService');
const voteVerificationLog = require('../utils/voteVerificationLog');
const { generateReceiptId, computeVoteHash } = require('../utils/voteReceipt');
const { isActiveMember } = require('../modules/permissions');
const { getUserId } = require('../utils/routeHelpers');
const { extractUserIds } = require('../utils/memberUtils');
const crypto = require('crypto');
const config = require('../config');
const { sendDocumentInvitationEmail } = require('../modules/emailService');
const DocumentService = require('../services/DocumentService');

/**
 * Queue document creation notification for organization members
 * @param {Object} db - Database connection
 * @param {string} documentId - Created document ID
 * @param {string} title - Document title
 * @param {string|null} organizationId - Organization ID (only queues if provided)
 * @returns {Promise<void>}
 */
async function queueDocumentCreationNotification(db, documentId, title, organizationId) {
  if (!organizationId) {
    // Only queue notifications for organizational documents
    return;
  }

  try {
    const notificationService = require('../modules/notifications');
    const urls = require('../emails/urls');

    // Get organization members to notify
    const members = await TransactionManager.queryAll(db, `
      SELECT u.id as user_id
      FROM organization_members om
      JOIN users u ON om.user_id = u.id
      WHERE om.organization_id = ? AND om.status = 'active'
    `, [organizationId]);
    
    if (members && members.length > 0) {
      const userIds = extractUserIds(members);
      
      // Get organization name
      const orgRow = await TransactionManager.query(db, 'SELECT name FROM organizations WHERE id = ?', [organizationId]);
      const organizationName = orgRow?.name;

      const eventData = {
        title: `New Document: ${title}`,
        message: `A new document "${title}" was created`,
        link: urls.document(documentId),
        organizationName: organizationName || null
      };

      await notificationService.notifyUsers(
        db,
        userIds,
        'document_created',
        eventData,
        false // digest notification
      );
    }
  } catch (error) {
    logger.error('Error queueing document creation for digest', {
      error: error.message,
      documentId,
      organizationId
    });
    // Don't throw - notification failure shouldn't break document creation
  }
}

const router = express.Router();

// Get all documents for current user (as owner or collaborator)
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const userId = getUserId(req);
  const { listDocuments } = require('../services/DocumentService');

  const result = await listDocuments(db, userId, {
    limit: parseInt(req.query.limit) || 50,
    offset: parseInt(req.query.offset) || 0,
    includeTotal: req.query.includeTotal === 'true'
  });

  res.json(result);
}));


// Get all documents owned by a specific organization
router.get('/organization/:organizationId', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId } = req.params;
  const userId = getUserId(req);
  const includeMinutes = req.query.includeMinutes === 'true' || req.query.includeMinutes === true;
  const { listOrganizationDocuments } = require('../services/DocumentService');

  const result = await listOrganizationDocuments(db, organizationId, userId, { includeMinutes });

  res.json(result);
}));

// Batch fetch documents (lightweight - for activity feed)
router.post('/batch', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const userId = getUserId(req);
  const documentIds = req.body.documentIds || req.body.document_ids;

  if (!Array.isArray(documentIds)) {
    throw new ApiError(400, 'documentIds must be an array', 'INVALID_INPUT');
  }
  if (documentIds.length === 0) {
    return res.json({ documents: [], notFound: [], errors: {} });
  }
  if (documentIds.length > 50) {
    throw new ApiError(400, 'Maximum 50 document IDs allowed per request', 'TOO_MANY_DOCUMENTS');
  }
  const invalidIds = documentIds.filter(id => typeof id !== 'string' || !id.trim());
  if (invalidIds.length > 0) {
    throw new ApiError(400, 'All document IDs must be non-empty strings', 'INVALID_INPUT');
  }

  const { getDocumentsBatch } = require('../services/DocumentService');
  const result = await getDocumentsBatch(db, documentIds, userId);
  res.json(result);
}));

// Document invitation sub-router (validate token, accept)
router.use('/', require('./documents/invitations'));

// Integrity check (before /:id so "integrity-check" is not interpreted as id)
router.get('/integrity-check', requireAuth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    throw ApiError.forbidden('Admin access required', 'ADMIN_ACCESS_REQUIRED');
  }
  const db = req.app.locals.knex || req.app.locals.db;
  const results = await DocumentService.runIntegrityCheck(db);
  res.json({
    summary: {
      total: results.total,
      valid: results.valid,
      invalid: results.invalid.length
    },
    invalidDocuments: results.invalid
  });
}));

// Voting and deletion sub-routers (mounted at /:id)
router.use('/:id', require('./documents/voting'));
router.use('/:id', require('./documents/deletion'));

// Get a specific document with full details
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const documentId = req.params.id;
  const userId = getUserId(req);
  const documentService = new DocumentService(db);
  const result = await documentService.getDocumentWithFullDetails(documentId, userId);
  res.json({ document: result });
}));

// Get agreed view of a document (lightweight - only history, no proposals/votes/comments)
router.get('/:id/agreed', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const documentId = req.params.id;
  const userId = getUserId(req);
  const includePending = req.query.includePending === '1' || req.query.includePending === 'true';
  const viewParam = req.query.view === 'amended' || req.query.view === 'accepted' ? req.query.view : undefined;
  const view = viewParam ?? (includePending ? 'amended' : 'accepted');
  const result = await DocumentService.getAgreedView(db, documentId, userId, { view, includePending });
  res.json(result);
}));

// Create a new document (orchestration in DocumentService.createDocumentFull)
router.post('/', requireAuth, documentCreateValidation.create, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const userId = getUserId(req);
  const { document: result } = await DocumentService.createDocumentFull(db, userId, req.body, {
    role: req.user?.role,
    email: req.user?.email
  });

  try {
    metricsCollector.recordBusinessEvent('document_created', {
      documentId: result.id,
      ownerId: result.ownershipType === 'organizational' ? result.organizationId : result.ownerId,
      ownerType: result.ownershipType === 'organizational' ? 'organization' : 'user',
      ownershipType: result.ownershipType,
      organizationId: result.organizationId || null
    });
  } catch (metricsErr) {
    logger.error('Error recording metrics', { error: metricsErr.message });
  }

  const organizationId = result.organizationId;
  if (organizationId) {
    broadcastOrganizationUpdate(organizationId, 'document-created', {
      document: result,
      createdBy: userId
    });
    queueDocumentCreationNotification(db, result.id, result.title, organizationId);
  }

  return res.status(201).json({ document: result });
}));

// Update document title
router.put('/:id', requireAuth, documentCreateValidation.update, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  await DocumentService.updateDocumentTitle(db, req.params.id, getUserId(req), req.body, { userRole: req.user?.role });
  res.json({ message: 'Document updated successfully' });
}));

// Delete a document
router.delete('/:id', requireAuth, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const documentId = req.params.id;
  const userId = getUserId(req);
  try {
    await DocumentService.deleteDocument(db, documentId, userId);
    broadcastDocumentUpdate(documentId, 'document-deleted', {
      documentId,
      reason: 'direct_deletion',
      deletedBy: userId
    });
    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error in delete document endpoint', { error: error.message, documentId, userId });
    if (error.message && error.message.includes('FOREIGN KEY constraint')) {
      throw ApiError.database('Cannot delete document: it is still referenced by other records. Please contact support.', { originalError: error.message }, 'FOREIGN_KEY_CONSTRAINT_VIOLATION');
    }
    throw ApiError.database('Failed to delete document', { originalError: error.message }, 'DOCUMENT_DELETION_ERROR');
  }
}));

// Add collaborator to document (sends invitation — user must accept)
router.post('/:id/collaborators', requireAuth, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const documentId = req.params.id;
  const currentUserId = getUserId(req);
  const userId = req.body.userId || req.body.user_id;
  const email = req.body.email;
  const documentService = new DocumentService(db);
  const result = await documentService.addCollaboratorByEmail(documentId, currentUserId, { userId, email });

  if (result.invitationSent && result.invitation?.token && result.invitation?.email) {
    try {
      const { documentTitle, inviterName } = await DocumentService.getDocumentAndInviterForEmail(db, documentId, currentUserId);
      await sendDocumentInvitationEmail(result.invitation.email, documentTitle, result.invitation.token, inviterName);
    } catch (emailError) {
      logger.error('Failed to send document collaborator invitation email', {
        error: emailError.message,
        documentId,
        email: result.invitation.email,
      });
    }
  }

  res.status(201).json(result);
}));

// Invite collaborators to document via email
router.post('/:id/invitations', requireAuth, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  if (!db) return next(ApiError.database('Database not available'));
  const documentId = req.params.id;
  const userId = getUserId(req);
  const { emails } = req.body;
  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    return next(ApiError.validation('Emails array is required and cannot be empty'));
  }
  const documentService = new DocumentService(db);
  const { invitations: createdInvitations, failedEmails } = await documentService.inviteCollaborators(documentId, userId, emails);
  const { documentTitle, inviterName } = await DocumentService.getDocumentAndInviterForEmail(db, documentId, userId);
  const frontendUrl = config.FRONTEND_URL || 'http://localhost:3001';
  const invitationLinks = [];
  for (const inv of createdInvitations) {
    const link = `${frontendUrl}/register?token=${inv.token}&email=${encodeURIComponent(inv.email)}&type=document`;
    try {
      await sendDocumentInvitationEmail(inv.email, documentTitle, inv.token, inviterName);
      invitationLinks.push({ email: inv.email, link });
    } catch (emailError) {
      logger.error('Failed to send document invitation email', { error: emailError.message, email: inv.email, documentId });
      failedEmails.push({ email: inv.email, error: emailError.message, invitationLink: link });
      invitationLinks.push({ email: inv.email, link });
    }
  }
  res.json({
    success: true,
    invitations: createdInvitations.length,
    failed: failedEmails.length,
    failedEmails: failedEmails.length > 0 ? failedEmails : undefined,
    invitationLinks,
    message: `${createdInvitations.length} invitation(s) sent successfully${failedEmails.length > 0 ? `, ${failedEmails.length} failed` : ''}`
  });
}));

// Get all invitations for a document
router.get('/:id/invitations', requireAuth, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  if (!db) return next(ApiError.database('Database not available'));
  const documentId = req.params.id;
  const userId = getUserId(req);
  const documentService = new DocumentService(db);
  const result = await documentService.getDocumentInvitations(documentId, userId);
  res.json(result);
}));

// Remove collaborator from document
router.delete('/:id/collaborators/:userId', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const documentId = req.params.id;
  const collaboratorUserId = req.params.userId;
  const currentUserId = getUserId(req);
  logger.debug('Removing collaborator', { documentId, currentUserId, targetUserId: collaboratorUserId });

  const documentService = new DocumentService(db);
  await documentService.removeCollaborator(documentId, currentUserId, collaboratorUserId);
  res.json({ message: 'Collaborator removed successfully' });
}));

/**
 * GET /api/documents/:id/status-history
 * Get status change history for a document
 */
router.get('/:id/status-history', requireAuth, requireDocumentAccess, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const result = await DocumentService.getDocumentStatusHistory(db, req.params.id);
  res.json(result);
}));

// Amendment summary (counts of pending paragraph, structure, tree proposals)
router.get('/:id/amendment-summary', requireAuth, requireDocumentAccess, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const result = await DocumentService.getAmendmentSummary(db, req.params.id);
  res.json(result);
}));

// Close amendments (representatives only for organizational agreed documents)
router.post('/:id/close-amendments', requireAuth, requireDocumentAccess, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const documentId = req.params.id;
  const result = await DocumentService.closeAmendments(db, documentId, getUserId(req));
  const payload = {
    amendmentsOpen: false,
    adoptionVoteCreated: result.adoptionVoteCreated,
    amendmentAdoptionVoteId: result.voteId || null,
    candidateCount: result.candidateCount ?? 0,
  };
  broadcastDocumentUpdate(documentId, 'document-updated', payload);
  broadcastOrganizationUpdate(result.organizationId, 'document-updated', { documentId, ...payload });
  res.json({
    message: result.adoptionVoteCreated
      ? 'Amendment window closed. Organization vote started to adopt changes.'
      : 'Amendments closed successfully',
    ...result,
  });
}));

// Export createDocument from service for use in other modules
module.exports = router;
module.exports.createDocument = require('../services/DocumentService').createDocument;