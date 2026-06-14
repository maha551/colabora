'use strict';

const express = require('express');
const { body } = require('express-validator');
const { requireAdmin } = require('../../middleware/auth');
const { securityLogger, logger } = require('../../middleware/logger');
const { organizationValidation, handleValidationErrors } = require('../../middleware/validation');
const TransactionManager = require('../../database/services/TransactionManager');
const { asyncHandler, ApiError } = require('../../middleware/errorHandler');
const { getUserId } = require('../../utils/routeHelpers');
const OrganizationService = require('../../services/OrganizationService');
const PlatformAuditService = require('../../services/PlatformAuditService');
const { assertNotSelf, assertNotLastAdmin } = require('../../utils/adminUserGuards');

const {
  getOrganizationWithMembers,
  updateOrganizationSettings,
  addMember,
  removeMember,
  inviteMembers,
  deleteOrganizationHard,
  addRepresentative,
  logAudit,
} = OrganizationService;

const router = express.Router();

function adminLog(req, adminId, action, details) {
  securityLogger.adminAction(adminId, action, details, req);
}

// GET /api/admin/organizations/:id
router.get('/organizations/:id', requireAdmin, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  try {
    const result = await getOrganizationWithMembers(db, id, {});
    res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error fetching admin organization detail', { error: error.message, organizationId: id });
    throw ApiError.database('Failed to fetch organization', { originalError: error.message }, 'FETCH_ORGANIZATION_FAILED');
  }
}));

// PUT /api/admin/organizations/:id
router.put('/organizations/:id', requireAdmin, ...organizationValidation.update, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const adminUserId = getUserId(req);
  const { id } = req.params;

  const { buildUpdateFields, getFieldWhitelist } = require('../../utils/fieldValidation');
  const allowedFields = getFieldWhitelist('organizations');
  const fieldMapping = {
    membershipPolicy: 'membership_policy',
    votingThreshold: 'voting_threshold',
    brandingColor: 'branding_color',
    brandingLogoUrl: 'branding_logo_url',
    brandingTitle: 'branding_title',
    brandingBannerUrl: 'branding_banner_url',
    iconSet: 'icon_set',
    fontFamily: 'font_family',
  };
  const { updateFields, updateValues } = buildUpdateFields(req.body, allowedFields, fieldMapping);
  if (!updateFields.length) {
    return next(ApiError.validation('No fields to update', null, 'NO_FIELDS_TO_UPDATE'));
  }

  const orgData = await updateOrganizationSettings(db, id, updateFields, updateValues);
  if (!orgData) return next(ApiError.notFound('Organization', 'ORGANIZATION_NOT_FOUND'));

  await logAudit(db, id, 'org_updated', adminUserId, null, { ...req.body, via: 'admin' }, req);
  adminLog(req, adminUserId, 'organization_updated', { organizationId: id, organizationName: orgData.name });

  res.json({ success: true, organization: orgData });
}));

// POST /api/admin/organizations/:id/members
router.post('/organizations/:id/members', requireAdmin, ...organizationValidation.addMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const adminUserId = getUserId(req);
  const { id } = req.params;
  const memberUserId = req.body?.userId ?? req.body?.user_id;
  const auditContext = { req, logAudit };
  const result = await addMember(db, id, adminUserId, memberUserId, auditContext);
  adminLog(req, adminUserId, 'member_invited', { organizationId: id, memberUserId, invitationId: result.invitation?.id });
  res.json({ success: true, ...result });
}));

// DELETE /api/admin/organizations/:id/members/:userId
router.delete('/organizations/:id/members/:userId', requireAdmin, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const adminUserId = getUserId(req);
  const { id, userId: memberUserId } = req.params;
  const auditContext = { req, logAudit };
  const { documentsAffected } = await removeMember(db, id, adminUserId, memberUserId, auditContext);
  adminLog(req, adminUserId, 'member_removed', { organizationId: id, memberUserId, documentsAffected });
  res.json({ success: true });
}));

// POST /api/admin/organizations/:id/members/invite
router.post('/organizations/:id/members/invite', requireAdmin, ...organizationValidation.inviteMembers, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const adminUserId = getUserId(req);
  const { id } = req.params;
  const { emails } = req.body;
  const auditContext = { req, logAudit };
  const { invitations, failedEmails } = await inviteMembers(db, id, adminUserId, { emails }, auditContext);
  adminLog(req, adminUserId, 'members_invited', { organizationId: id, emailCount: emails.length, successful: invitations.length });
  res.json({
    success: true,
    invitations: invitations.length,
    failed: failedEmails.length,
    failedEmails: failedEmails.length > 0 ? failedEmails : undefined,
  });
}));

// POST /api/admin/organizations/:id/representatives
router.post('/organizations/:id/representatives', requireAdmin, ...organizationValidation.nominateRepresentative, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const adminUserId = getUserId(req);
  const { id } = req.params;
  const { newRepresentativeId } = req.body;
  const { representatives } = await addRepresentative(db, id, newRepresentativeId);
  await logAudit(db, id, 'rep_added', adminUserId, newRepresentativeId, { via: 'admin' }, req);
  adminLog(req, adminUserId, 'representative_added', { organizationId: id, newRepresentativeId });
  res.json({ success: true, representatives });
}));

// DELETE /api/admin/organizations/:id
router.delete('/organizations/:id', requireAdmin, [
  // Accept both camelCase and snake_case (transformRequest snake-cases the body).
  body('confirmName').custom((value, { req }) => {
    if (!value && !req.body.confirm_name) {
      throw new Error('confirmName is required');
    }
    return true;
  }),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const adminUserId = getUserId(req);
  const { id } = req.params;
  const confirmName = req.body.confirmName ?? req.body.confirm_name;
  const force = req.body.force === true || req.body.force === 'true' || req.body.force === 1 || req.body.force === '1';

  const result = await deleteOrganizationHard(db, id, { confirmName, force });
  adminLog(req, adminUserId, 'organization_hard_deleted', {
    organizationId: id,
    organizationName: result.name,
    documentCount: result.documentCount,
    activeMemberCount: result.activeMemberCount,
    force: force === true,
  });

  res.json({
    success: true,
    message: `Organization "${result.name}" permanently deleted`,
    deleted: result,
  });
}));

// GET /api/admin/users/:id
router.get('/users/:id', requireAdmin, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  const user = await TransactionManager.query(
    db,
    `SELECT id, name, email, role, avatar, created_at,
      COALESCE(is_active, true) as is_active,
      suspended_at, suspended_by, suspension_reason
     FROM users WHERE id = ?`,
    [id]
  );
  if (!user) return next(ApiError.notFound('User', 'USER_NOT_FOUND'));

  const memberships = await TransactionManager.queryAll(
    db,
    `SELECT om.organization_id, om.status, om.joined_at, o.name as organization_name
     FROM organization_members om
     JOIN organizations o ON o.id = om.organization_id
     WHERE om.user_id = ?
     ORDER BY om.joined_at DESC`,
    [id]
  );

  res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      createdAt: user.created_at,
      isActive: user.is_active !== false && user.is_active !== 0,
      suspendedAt: user.suspended_at,
      suspendedBy: user.suspended_by,
      suspensionReason: user.suspension_reason,
      organizations: memberships.map((m) => ({
        organizationId: m.organization_id,
        organizationName: m.organization_name,
        status: m.status,
        joinedAt: m.joined_at,
      })),
    },
  });
}));

// PATCH /api/admin/users/:id/status
router.patch('/users/:id/status', requireAdmin, [
  // Accept both camelCase and snake_case (transformRequest snake-cases the body).
  body('isActive').custom((value, { req }) => {
    const raw = value !== undefined ? value : req.body.is_active;
    if (typeof raw !== 'boolean' && raw !== 'true' && raw !== 'false' && raw !== 0 && raw !== 1) {
      throw new Error('isActive must be a boolean');
    }
    return true;
  }),
  body('reason').optional().isString().isLength({ max: 500 }),
  handleValidationErrors,
], asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const adminUserId = getUserId(req);
  const { id } = req.params;
  const rawIsActive = req.body.isActive !== undefined ? req.body.isActive : req.body.is_active;
  const isActive = rawIsActive === true || rawIsActive === 'true' || rawIsActive === 1;
  const { reason } = req.body;

  assertNotSelf(adminUserId, id, 'You cannot suspend or unsuspend your own account');

  const user = await TransactionManager.query(db, 'SELECT id, name, email, role FROM users WHERE id = ?', [id]);
  if (!user) return next(ApiError.notFound('User', 'USER_NOT_FOUND'));

  if (!isActive && user.role === 'admin') {
    await assertNotLastAdmin(db, id, 'Cannot suspend the last admin user');
  }

  if (isActive) {
    await TransactionManager.execute(
      db,
      `UPDATE users SET is_active = true, suspended_at = NULL, suspended_by = NULL, suspension_reason = NULL WHERE id = ?`,
      [id]
    );
  } else {
    await TransactionManager.execute(
      db,
      `UPDATE users SET is_active = false, suspended_at = CURRENT_TIMESTAMP, suspended_by = ?, suspension_reason = ? WHERE id = ?`,
      [adminUserId, reason || null, id]
    );
  }

  adminLog(req, adminUserId, isActive ? 'user_unsuspended' : 'user_suspended', {
    userId: id,
    userName: user.name,
    reason: reason || null,
  });

  res.json({
    success: true,
    message: isActive ? `User ${user.name} has been reactivated` : `User ${user.name} has been suspended`,
  });
}));

// POST /api/admin/demote-admin/:userId
router.post('/demote-admin/:userId', requireAdmin, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const adminUserId = getUserId(req);
  const { userId } = req.params;

  assertNotSelf(adminUserId, userId, 'You cannot demote your own admin account');
  await assertNotLastAdmin(db, userId);

  const user = await TransactionManager.query(db, 'SELECT id, name, email, role FROM users WHERE id = ?', [userId]);
  if (!user) return next(ApiError.notFound('User', 'USER_NOT_FOUND'));
  if (user.role !== 'admin') {
    return next(ApiError.validation('User is not an admin', null, 'USER_NOT_ADMIN'));
  }

  await TransactionManager.execute(db, 'UPDATE users SET role = ? WHERE id = ?', ['user', userId]);
  adminLog(req, adminUserId, 'user_demoted_from_admin', { demotedUserId: userId, demotedUserName: user.name });

  res.json({
    success: true,
    message: `User ${user.name} has been demoted from admin`,
    demotedUser: { id: user.id, name: user.name, email: user.email, role: 'user' },
  });
}));

// GET /api/admin/audit
router.get('/audit', requireAdmin, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { action, adminUserId, limit, offset } = req.query;
  const result = await PlatformAuditService.listActions(db, {
    action,
    adminUserId,
    limit,
    offset,
  });
  res.json({ success: true, ...result });
}));

// GET /api/admin/audit/stats/summary
router.get('/audit/stats/summary', requireAdmin, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const stats = await PlatformAuditService.getStats(db);
  res.json({ success: true, ...stats });
}));

module.exports = router;
