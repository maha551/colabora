/**
 * Audit routes under /api/governance/:organizationId (public-audit-logs, audit-stats, audit-export, analytics)
 */

const express = require('express');
const { requireAuth, requireOrganizationMember } = require('../../middleware/auth');
const { asyncHandler, ApiError } = require('../../middleware/errorHandler');
const { logger } = require('../../middleware/logger');
const { getUserId } = require('../../utils/routeHelpers');
const { isRepresentative } = require('../../modules/permissions');
const GovernanceAuditService = require('../../services/governance/GovernanceAuditService');

const router = express.Router({ mergeParams: true });

router.get('/:organizationId/public-audit-logs', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId } = req.params;
  const { actionType, startDate, endDate, limit = 20, offset = 0 } = req.query;
  try {
    const result = await GovernanceAuditService.getPublicAuditLogs(db, organizationId, { actionType, startDate, endDate, limit, offset });
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error fetching audit logs', { error: error.message, organizationId: req.params.organizationId });
    throw ApiError.database('Failed to fetch audit logs', { originalError: error.message }, 'FETCH_AUDIT_LOGS_FAILED');
  }
}));

router.get('/:organizationId/audit-stats', requireAuth, requireOrganizationMember, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId } = req.params;
  const userId = getUserId(req);
  const { days = 30 } = req.query;
  try {
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) return next(ApiError.forbidden('Only representatives can access audit statistics', 'NOT_REPRESENTATIVE'));
    const result = await GovernanceAuditService.getAuditStats(db, organizationId, { days });
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error fetching audit statistics', { error: error.message, organizationId: req.params.organizationId });
    throw ApiError.database('Failed to fetch audit statistics', { originalError: error.message }, 'FETCH_AUDIT_STATISTICS_FAILED');
  }
}));

router.get('/:organizationId/audit-export', requireAuth, requireOrganizationMember, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId } = req.params;
  const userId = getUserId(req);
  const { startDate, endDate, format = 'csv' } = req.query;
  try {
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) return next(ApiError.forbidden('Only representatives can export audit logs', 'NOT_REPRESENTATIVE'));
    const result = await GovernanceAuditService.exportAuditLogs(db, organizationId, { startDate, endDate, format });
    if (result.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.csv);
    } else {
      res.json({ auditLogs: result.auditLogs });
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error exporting audit logs', { error: error.message, organizationId: req.params.organizationId });
    throw ApiError.database('Failed to export audit logs', { originalError: error.message }, 'EXPORT_AUDIT_LOGS_FAILED');
  }
}));

router.get('/:organizationId/analytics', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId } = req.params;
  const { period } = req.query;
  try {
    const result = await GovernanceAuditService.getVotingAnalytics(db, organizationId, { period });
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error fetching analytics', { error: error.message, organizationId: req.params.organizationId });
    throw ApiError.database('Failed to fetch analytics', { originalError: error.message }, 'FETCH_ANALYTICS_FAILED');
  }
}));

module.exports = router;
