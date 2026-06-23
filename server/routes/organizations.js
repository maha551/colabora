const express = require('express');
const { requireAuth, requireAdmin, requireOrganizationMember } = require('../middleware/auth');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { logger } = require('../middleware/logger');
const { organizationValidation, paramValidation } = require('../middleware/validation');
const { getUserId } = require('../utils/routeHelpers');
const { isRepresentative } = require('../modules/permissions');
const { canManageOrganizationActions } = require('../utils/adminPermissions');
const OrganizationService = require('../services/OrganizationService');
const { checkOrganizationHasDocuments, checkDataConsistency, logAudit, setOverviewPin, leaveOrganization } = OrganizationService;
const ParticipationGraphService = require('../services/ParticipationGraphService');
const { getParticipationGraph, saveGraphLayout } = require('../services/participationGraphEditor');
const DelegationService = require('../services/DelegationService');
const config = require('../config');
const GovernanceRulesService = require('../services/governance/GovernanceRulesService');
const { TTL } = require('../utils/responseCache');
const votesRouter = require('./votes');
const organizationVoteCommentRoutes = require('./organization-vote-comments');
const invitationsRouter = require('./organizations/invitations');
const votesRouterOrg = require('./organizations/votes');
const schedulingRouter = require('./organizations/scheduling');
const meetingsRouter = require('./organizations/meetings');
const memberLocationsRouter = require('./organizations/member-locations');

const router = express.Router();

// Organization vote comments (org-scoped)
router.use('/:organizationId/votes/:voteId/comments', organizationVoteCommentRoutes);
// Invitation, vote, scheduling, meetings, and member-locations sub-routers (mergeParams so :organizationId is available)
router.use('/', invitationsRouter);
router.use('/', votesRouterOrg);
router.use('/', schedulingRouter);
router.use('/', meetingsRouter);
router.use('/', memberLocationsRouter);

// Get all organizations for current user (cached for default params: limit=20, offset=0, includeGovernanceRules=false)
router.get('/', requireAuth, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const userId = getUserId(req);
  const startTime = Date.now();
  const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 20), 100);
  const offset = parseInt(req.query.offset) || 0;
  const includeGovernanceRules = req.query.includeGovernanceRules === 'true';

  const cache = req.app.locals.responseCache;
  const cacheKey = `orgs:user:${userId}`;
  const useCache = cache && limit === 20 && offset === 0 && !includeGovernanceRules;
  if (useCache) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
  }

  logger.info('Fetching organizations for user', { userId, includeGovernanceRules, limit, offset });

  if (process.env.ENABLE_ORG_CONSISTENCY_CHECK === 'true') {
    checkDataConsistency(db, userId).then(consistencyResult => {
      if (consistencyResult.hasInconsistencies) {
        logger.warn('Organization data consistency check completed with issues', { userId, inconsistencies: consistencyResult.inconsistencies });
      } else {
        logger.debug('Organization data consistency check passed', { userId, memberCount: consistencyResult.memberCount, representativeCount: consistencyResult.representativeCount });
      }
    }).catch(err => logger.error('Error in data consistency check', { error: err.message, userId }));
  }

  let result;
  try {
    result = await OrganizationService.getOrganizationsForUser(db, userId, { limit, offset, includeGovernanceRules });
  } catch (err) {
    if (err.message && err.message.includes('no such table: organization_representatives')) {
      logger.warn('organization_representatives table not found, using fallback query', { userId });
      result = await OrganizationService.getOrganizationsForUserFallback(db, userId);
      const duration = Date.now() - startTime;
      logger.info('Fetched user organizations (fallback method)', { userId, totalFound: result.organizations.length, duration, queryType: 'fallback' });
      return res.json({ organizations: result.organizations });
    }
    logger.error('Error fetching organizations', { error: err.message, userId });
    throw ApiError.database('Failed to fetch organizations');
  }

  const { organizations, pagination } = result;
  const payload = { organizations, pagination };
  if (useCache) {
    await cache.set(cacheKey, payload, TTL.ORG_LIST_MS);
  }

  const duration = Date.now() - startTime;
  const memberCount = organizations.filter(org => org.membershipStatus).length;
  const representativeOnlyCount = organizations.length - memberCount;
  logger.info('Fetched user organizations', {
    userId,
    totalFound: organizations.length,
    memberCount,
    representativeOnlyCount,
    duration,
    includeGovernanceRules,
    queryType: 'optimized',
    organizations: organizations.map(o => ({ id: o.id, name: o.name, accessType: o.membershipStatus ? 'member' : 'representative' }))
  });
  if (process.env.ENABLE_ORG_DEBUG_LOGS === 'true') {
    logger.debug('Final organization result', { totalOrganizations: organizations.length, organizations: organizations.length > 0 ? organizations.map((org, idx) => ({ index: idx + 1, name: org.name, id: org.id, membershipStatus: org.membershipStatus || 'none', isActive: org.isActive, representativesCount: org.representatives?.length || 0 })) : [] });
  }
  res.json(payload);
}));

// Participation graph read APIs (must be registered before /:organizationId)
router.get('/:organizationId/ancestors', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const result = await ParticipationGraphService.getAncestors(db, organizationId);
  res.json(result);
}));

router.get('/:organizationId/children', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = getUserId(req);
  const result = await ParticipationGraphService.getDirectChildren(db, organizationId, userId);
  res.json(result);
}));

router.post('/:organizationId/subgroups', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = getUserId(req);
  const result = await ParticipationGraphService.proposeOrCreateSubgroup(db, organizationId, userId, req.body, req);
  res.status(result.mode === 'created' ? 201 : 200).json(result);
}));

router.get('/:organizationId/participations', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const kind = req.query.kind || null;
  const result = await ParticipationGraphService.listParticipations(db, organizationId, { kind });
  res.json(result);
}));

router.post('/:organizationId/participations/rep-link', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = getUserId(req);
  const targetUserId = req.body?.userId ?? req.body?.user_id;
  const chapterOrgId = req.body?.chapterOrgId ?? req.body?.chapter_org_id;
  if (!targetUserId || !chapterOrgId) {
    throw ApiError.validation('userId and chapterOrgId are required', null, 'VALIDATION_ERROR');
  }
  const participation = await ParticipationGraphService.assignRepLink(
    db, organizationId, userId, { userId: targetUserId, chapterOrgId }, req
  );
  res.status(201).json({ participation });
}));

router.get('/:organizationId/affiliates', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const result = await ParticipationGraphService.listAffiliates(db, req.params.organizationId);
  res.json(result);
}));

router.post('/:organizationId/affiliates', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const affiliateOrgId = req.body?.affiliateOrgId ?? req.body?.affiliate_org_id;
  if (!affiliateOrgId) throw ApiError.validation('affiliateOrgId is required');
  const result = await ParticipationGraphService.createAffiliateEdge(
    db, req.params.organizationId, affiliateOrgId, getUserId(req), req.body
  );
  res.status(201).json(result);
}));

router.get('/:organizationId/matrix-links', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const result = await ParticipationGraphService.listMatrixLinks(db, req.params.organizationId);
  res.json(result);
}));

router.post('/:organizationId/matrix-links', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const linkedOrgId = req.body?.linkedOrgId ?? req.body?.linked_org_id;
  if (!linkedOrgId) throw ApiError.validation('linkedOrgId is required');
  const result = await ParticipationGraphService.createMatrixLink(
    db, req.params.organizationId, linkedOrgId, getUserId(req), req.body
  );
  res.status(201).json(result);
}));

router.get('/:organizationId/delegations', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const result = await DelegationService.listDelegations(db, req.params.organizationId, getUserId(req));
  res.json(result);
}));

router.post('/:organizationId/delegations', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const result = await DelegationService.createDelegation(db, req.params.organizationId, getUserId(req), req.body);
  res.status(201).json(result);
}));

router.get('/:organizationId/participation-graph', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const result = await getParticipationGraph(db, req.params.organizationId, getUserId(req));
  res.json(result);
}));

router.put('/:organizationId/participation-graph/layout', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const layout = req.body?.layout ?? req.body;
  const result = await saveGraphLayout(db, req.params.organizationId, getUserId(req), layout);
  res.json(result);
}));

router.get('/:organizationId/tree', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = getUserId(req);
  const isRep = await isRepresentative(db, userId, organizationId);
  const isAdmin = req.user?.role === 'admin';
  if (!isRep && !isAdmin) {
    return next(ApiError.forbidden('Only representatives can view the full organization tree', 'NOT_REPRESENTATIVE'));
  }
  const result = await ParticipationGraphService.getTreeForUser(db, organizationId);
  res.json(result);
}));

// Get specific organization details
router.get('/:organizationId', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId } = req.params;
  const userId = getUserId(req);
  try {
    const result = await OrganizationService.getOrganizationWithMembers(db, organizationId, {
      userId,
      baseUrl: config.FRONTEND_URL
    });
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error in organization details', { error: error.message, stack: error.stack, organizationId: req.params.organizationId, userId });
    const errorMessage = process.env.NODE_ENV !== 'production' ? `Failed to fetch organization: ${error.message}` : 'Failed to fetch organization';
    throw ApiError.database(errorMessage, { originalError: error.message, code: error.code, organizationId });
  }
}));

// Pin or clear a calendar event on the organization overview (representatives only)
router.put('/:organizationId/overview-pin', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId } = req.params;
  const userId = getUserId(req);
  const rawEventId = req.body?.eventId ?? req.body?.event_id;
  const eventId = rawEventId === null || rawEventId === undefined
    ? null
    : (typeof rawEventId === 'string' ? rawEventId.trim() : null);

  if (rawEventId !== null && rawEventId !== undefined) {
    if (typeof rawEventId !== 'string' || !eventId) {
      throw ApiError.validation('eventId must be a non-empty string or null');
    }
    if (eventId.length > 256) {
      throw ApiError.validation('eventId is too long');
    }
  }

  const isRep = await isRepresentative(db, userId, organizationId);
  if (!isRep) {
    return next(ApiError.forbidden('Only representatives can pin overview events', 'NOT_REPRESENTATIVE'));
  }

  const result = await setOverviewPin(db, {
    organizationId,
    userId,
    eventId,
    baseUrl: config.FRONTEND_URL
  });

  await logAudit(
    db,
    organizationId,
    eventId ? 'overview_pin_set' : 'overview_pin_cleared',
    userId,
    null,
    { eventId },
    req
  );

  const webSocketManager = require('../modules/websocket');
  webSocketManager.broadcastOrganizationUpdate(organizationId, 'overview-pin-updated', {
    organizationId,
    overviewPinnedEventId: result.overviewPinnedEventId,
    overviewPinnedAt: result.overviewPinnedAt,
    overviewPinnedByUserId: result.overviewPinnedByUserId,
    overviewPinnedEvent: result.overviewPinnedEvent,
    updatedBy: userId
  });

  res.json({ success: true, ...result });
}));

// Update organization (representatives only)
router.put('/:organizationId', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, ...organizationValidation.update, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId } = req.params;
  const userId = getUserId(req);
  const { brandingColor, brandingLogoUrl, brandingTitle, brandingBannerUrl, iconSet, fontFamily } = req.body;

  try {
    const permission = await canManageOrganizationActions(db, userId, organizationId, req.user?.role);
    if (!permission.allowed) {
      return next(ApiError.forbidden('Only representatives can update organization', 'NOT_REPRESENTATIVE'));
    }

    const { buildUpdateFields, getFieldWhitelist } = require('../utils/fieldValidation');
    const allowedFields = getFieldWhitelist('organizations');
    const fieldMapping = {
      membershipPolicy: 'membership_policy',
      votingThreshold: 'voting_threshold',
      brandingColor: 'branding_color',
      brandingLogoUrl: 'branding_logo_url',
      brandingTitle: 'branding_title',
      brandingBannerUrl: 'branding_banner_url',
      iconSet: 'icon_set',
      fontFamily: 'font_family'
    };
    const { updateFields, updateValues } = buildUpdateFields(req.body, allowedFields, fieldMapping);

    const orgData = await OrganizationService.updateOrganizationSettings(db, organizationId, updateFields, updateValues);
    await logAudit(db, organizationId, 'org_updated', userId, null, { ...req.body }, req);
    if (!orgData) return res.json({ success: true });

    if (brandingColor !== undefined || brandingLogoUrl !== undefined || brandingTitle !== undefined ||
        brandingBannerUrl !== undefined || iconSet !== undefined || fontFamily !== undefined) {
      const webSocketManager = require('../modules/websocket');
      webSocketManager.broadcastOrganizationUpdate(organizationId, 'branding-updated', {
        organizationId,
        brandingColor: orgData.brandingColor,
        brandingLogoUrl: orgData.brandingLogoUrl,
        brandingTitle: orgData.brandingTitle,
        brandingBannerUrl: orgData.brandingBannerUrl,
        iconSet: orgData.iconSet,
        fontFamily: orgData.fontFamily,
        updatedBy: userId
      });
    }
    res.json({ success: true, organization: orgData });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error updating organization', { error: error.message, stack: error.stack, organizationId: req.params.organizationId });
    throw ApiError.database('Internal server error', { originalError: error.message }, 'UPDATE_ORGANIZATION_FAILED');
  }
}));

// Nominate new representative (representatives only)
router.post('/:organizationId/representatives', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, ...organizationValidation.nominateRepresentative, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId } = req.params;
  const userId = getUserId(req);
  const { newRepresentativeId } = req.body;

  try {
    const permission = await canManageOrganizationActions(db, userId, organizationId, req.user?.role);
    if (!permission.allowed) {
      return next(ApiError.forbidden('Only representatives can nominate new representatives', 'NOT_REPRESENTATIVE'));
    }

    const { representatives } = await OrganizationService.addRepresentative(db, organizationId, newRepresentativeId);
    const responseCache = req.app.locals.responseCache;
    if (responseCache) await responseCache.del(`orgs:user:${newRepresentativeId}`);
    logAudit(db, organizationId, 'rep_added', userId, newRepresentativeId, {}, req);
    res.json({ representatives });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error nominating representative', { error: error.message, organizationId, newRepresentativeId });
    throw ApiError.database('Failed to add representative', { originalError: error.message }, 'ADD_REPRESENTATIVE_FAILED');
  }
}));

// Invite members (representatives only)
router.post('/:organizationId/members/invite', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, ...organizationValidation.inviteMembers, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const { organizationId } = req.params;
  const userId = getUserId(req);
  const { emails } = req.body;
  try {
    const { canInviteMembers } = require('../modules/permissions');
    const { transformRulesToCamelCase } = require('../utils/governanceFieldMapping');
    const rulesRaw = await GovernanceRulesService.getGovernanceRules(db, organizationId);
    const rules = rulesRaw ? transformRulesToCamelCase(rulesRaw) : null;
    const canInvite = await canInviteMembers(db, userId, organizationId, rules, req.user.role);
    if (!canInvite) {
      const err = ApiError.forbidden('You do not have permission to invite members', 'FORBIDDEN');
      err.details = { message: 'Check your organization\'s governance rules to see who can invite members' };
      return res.status(err.statusCode).json(err.toJSON());
    }
    const auditContext = { req, logAudit };
    const { invitations, failedEmails, invitationLinks } = await OrganizationService.inviteMembers(db, organizationId, userId, { emails }, auditContext);
    const webSocketManager = require('../modules/websocket');
    webSocketManager.broadcastOrganizationUpdate(organizationId, 'member-invited', { organizationId, invitedBy: userId, invitationCount: invitations.length });
    res.json({
      success: true,
      invitations: invitations.length,
      failed: failedEmails.length,
      failedEmails: failedEmails.length > 0 ? failedEmails : undefined,
      invitationLinks,
      message: `Invitations sent to ${invitations.length} email address${invitations.length !== 1 ? 'es' : ''}${failedEmails.length > 0 ? ` (${failedEmails.length} failed - links provided for manual sharing)` : ''}${invitations.some(inv => inv.isResend) ? ' (some were resent to existing pending invitations)' : ''}`
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error inviting members', { error: error.message, stack: error.stack, organizationId: req.params.organizationId });
    throw ApiError.database('Internal server error');
  }
}));

// Add member to organization
router.post('/:organizationId/members', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, ...organizationValidation.addMember, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = getUserId(req);
  const memberUserId = req.body?.userId ?? req.body?.user_id;
  try {
    const permission = await canManageOrganizationActions(db, userId, organizationId, req.user?.role);
    if (!permission.allowed) return next(ApiError.forbidden('Only representatives can add members', 'NOT_REPRESENTATIVE'));
    const auditContext = { req, logAudit };
    const result = await OrganizationService.addMember(db, organizationId, userId, memberUserId, auditContext);
    const responseCache = req.app.locals.responseCache;
    if (responseCache) await responseCache.del(`orgs:user:${memberUserId}`);
    const webSocketManager = require('../modules/websocket');
    webSocketManager.broadcastOrganizationUpdate(organizationId, 'member-invited', {
      organizationId,
      userId: memberUserId,
      invitedBy: userId,
      invitationId: result.invitation?.id,
    });
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error adding member', { error: error.message, stack: error.stack, userId: req.body?.userId ?? req.body?.user_id, organizationId: req.params.organizationId });
    throw ApiError.database('Internal server error', { originalError: error.message }, 'ADD_MEMBER_FAILED');
  }
}));

// Remove member from organization
router.delete('/:organizationId/members/:memberUserId', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, ...paramValidation.memberUserId, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const { organizationId, memberUserId } = req.params;
  const userId = getUserId(req);
  try {
    const permission = await canManageOrganizationActions(db, userId, organizationId, req.user?.role);
    if (!permission.allowed) return next(ApiError.forbidden('Only representatives can remove members', 'NOT_REPRESENTATIVE'));
    const auditContext = { req, logAudit };
    const { documentsAffected } = await OrganizationService.removeMember(db, organizationId, userId, memberUserId, auditContext);
    const responseCache = req.app.locals.responseCache;
    if (responseCache) await responseCache.del(`orgs:user:${memberUserId}`);
    const webSocketManager = require('../modules/websocket');
    webSocketManager.broadcastOrganizationUpdate(organizationId, 'member-removed', { organizationId, userId: memberUserId, removedBy: userId, documentsAffected });
    res.json({ success: true });
    setImmediate(() => {
      if (votesRouter.reEvaluateOrganizationProposals) {
        votesRouter.reEvaluateOrganizationProposals(db, organizationId).catch(err => logger.error('Error re-evaluating proposals after member removal', { error: err.message, stack: err.stack, organizationId, memberUserId }));
      }
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error removing member', { error: error.message, stack: error.stack, userId: req.params.memberUserId, organizationId: req.params.organizationId });
    throw ApiError.database('Internal server error', { originalError: error.message }, 'REMOVE_MEMBER_FAILED');
  }
}));

// Leave organization (self-service)
router.post('/:organizationId/leave', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = getUserId(req);
  try {
    const auditContext = { req, logAudit, initiatedBy: 'self' };
    const result = await leaveOrganization(db, organizationId, userId, auditContext);
    const responseCache = req.app.locals.responseCache;
    if (responseCache) await responseCache.del(`orgs:user:${userId}`);
    res.json({
      success: true,
      electionCreated: result.electionCreated || false,
      electionId: result.electionId,
    });
    setImmediate(() => {
      if (votesRouter.reEvaluateOrganizationProposals) {
        votesRouter.reEvaluateOrganizationProposals(db, organizationId).catch(err => logger.error('Error re-evaluating proposals after member leave', { error: err.message, stack: err.stack, organizationId, userId }));
      }
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error leaving organization', { error: error.message, stack: error.stack, userId, organizationId: req.params.organizationId });
    throw ApiError.database('Internal server error', { originalError: error.message }, 'LEAVE_ORGANIZATION_FAILED');
  }
}));

// Document proposals system removed - now using document status 'proposal' directly
router.get('/:organizationId/document-proposals', requireAuth, requireOrganizationMember, (req, res) => {
  res.json({
    documentProposals: [],
    message: 'Document proposals system has been replaced. New organizational documents now start with proposal status automatically.'
  });
});

module.exports = router;
