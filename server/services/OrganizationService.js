'use strict';

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const TransactionManager = require('../database/services/TransactionManager');
const { safeJsonParseArray } = require('../utils/jsonUtils');
const { logger } = require('../middleware/logger');
const { ApiError } = require('../middleware/errorHandler');
const UnifiedVotingService = require('../modules/unified-voting');
const { addMemberToOrganizationDocuments, removeMemberFromOrganizationDocuments } = require('../modules/document-collaborator-sync');
const { sendInvitationEmail, sendRepresentativeRejectionEmail } = require('../modules/emailService');
const urls = require('../emails/urls');
const config = require('../config');
const GovernanceRulesService = require('./governance/GovernanceRulesService');
const { getGovernanceRules } = GovernanceRulesService;
const ElectionService = require('./ElectionService');
const { canInviteMembers, isRepresentative, isActiveMember } = require('../modules/permissions');
const { transformRulesToCamelCase } = require('../utils/governanceFieldMapping');
const votingLockManager = require('../utils/votingLocks');
const voteVerificationLog = require('../utils/voteVerificationLog');
const { computeVoteHash } = require('../utils/voteReceipt');
const { validateFieldNames } = require('../utils/fieldValidation');
const {
  resolveAuditPerformedByUserId,
  resolveAuditAffectedUserId,
} = require('../utils/auditUserIds');

/**
 * Get organizations for a user (main path using organization_representatives table).
 * @param {Object} db - Knex/db instance
 * @param {string} userId
 * @param {{ limit?: number, offset?: number, includeGovernanceRules?: boolean }} options
 * @returns {Promise<{ organizations: Array, pagination: { limit, offset, hasMore } }>}
 */
async function getOrganizationsForUser(db, userId, options = {}) {
  const limit = Math.min(Math.max(1, parseInt(options.limit) || 20), 100);
  const offset = parseInt(options.offset) || 0;
  const includeGovernanceRules = options.includeGovernanceRules === true;

  const optimizedQuery = `
    SELECT DISTINCT 
      o.id, o.name, o.description, o.membership_policy, 
      o.voting_enabled, o.voting_threshold, o.is_active,
      o.created_at, o.branding_color, o.branding_logo_url,
      o.branding_title, o.branding_banner_url, o.icon_set, o.font_family,
      o.representatives,
      o.primary_parent_id, o.org_kind, o.participation_profile,
      o.tree_depth, o.tree_path, o.participation_graph_root_id,
      om.status as membership_status,
      om.joined_at,
      CASE 
        WHEN om.user_id IS NOT NULL THEN 'member'
        WHEN org_reps.user_id IS NOT NULL THEN 'representative'
        ELSE NULL 
      END as access_type
    FROM organizations o
    LEFT JOIN organization_members om 
      ON o.id = om.organization_id AND om.user_id = ? AND om.status = 'active'
    LEFT JOIN organization_representatives org_reps 
      ON o.id = org_reps.organization_id AND org_reps.user_id = ? AND org_reps.status = 'active'
    WHERE o.is_active = true 
      AND (om.user_id IS NOT NULL OR org_reps.user_id IS NOT NULL)
    ORDER BY o.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const rows = await TransactionManager.queryAll(db, optimizedQuery, [userId, userId, limit, offset]);

  const governanceRulesMap = new Map();
  if (includeGovernanceRules && rows.length > 0) {
    try {
      const governanceRulesPromises = rows.map(row => UnifiedVotingService.getGovernanceRules(db, row.id));
      const governanceRulesResults = await Promise.all(governanceRulesPromises);
      rows.forEach((row, idx) => {
        if (governanceRulesResults[idx]) governanceRulesMap.set(row.id, governanceRulesResults[idx]);
      });
    } catch (govErr) {
      logger.warn('Error batch fetching governance rules', { error: govErr.message, userId });
    }
  }

  const representativesMap = new Map();
  if (rows.length > 0) {
    const orgIds = rows.map(row => row.id);
    const placeholders = orgIds.map(() => '?').join(',');
    try {
      const repRows = await TransactionManager.queryAll(db,
        `SELECT organization_id, user_id 
         FROM organization_representatives 
         WHERE organization_id IN (${placeholders}) AND status = 'active'
         ORDER BY organization_id, added_at`,
        orgIds
      );
      for (const rep of repRows) {
        if (!representativesMap.has(rep.organization_id)) representativesMap.set(rep.organization_id, []);
        representativesMap.get(rep.organization_id).push(rep.user_id);
      }
    } catch (repErr) {
      logger.warn('Failed to fetch representatives from table, using JSON column', { error: repErr.message, userId });
      for (const row of rows) {
        representativesMap.set(row.id, safeJsonParseArray(row.representatives));
      }
    }
  }

  const organizations = rows.map((row) => {
    const representatives = representativesMap.get(row.id) || [];
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      representatives,
      membershipPolicy: row.membership_policy,
      votingEnabled: row.voting_enabled === true,
      votingThreshold: row.voting_threshold,
      isActive: row.is_active === true,
      membershipStatus: row.membership_status || null,
      joinedAt: row.joined_at || null,
      createdAt: row.created_at,
      brandingColor: row.branding_color || null,
      brandingLogoUrl: row.branding_logo_url || null,
      brandingTitle: row.branding_title || null,
      brandingBannerUrl: row.branding_banner_url || null,
      iconSet: row.icon_set || null,
      fontFamily: row.font_family || null,
      primaryParentId: row.primary_parent_id || null,
      orgKind: row.org_kind || 'standard',
      participationProfile: row.participation_profile || 'classical_committee',
      treeDepth: row.tree_depth ?? 0,
      treePath: row.tree_path || `/${row.id}`,
      participationGraphRootId: row.participation_graph_root_id || row.id,
      ...(includeGovernanceRules && { governanceRules: governanceRulesMap.get(row.id) || null })
    };
  });

  return {
    organizations,
    pagination: { limit, offset, hasMore: rows.length === limit }
  };
}

/**
 * Fallback when organization_representatives table does not exist.
 * @param {Object} db
 * @param {string} userId
 * @returns {Promise<{ organizations: Array }>}
 */
async function getOrganizationsForUserFallback(db, userId) {
  const memberQuery = `
    SELECT o.*, om.status as membership_status, om.joined_at
    FROM organizations o
    INNER JOIN organization_members om ON o.id = om.organization_id AND om.user_id = ?
    WHERE o.is_active = true
    ORDER BY o.created_at DESC
  `;
  const memberRows = await TransactionManager.queryAll(db, memberQuery, [userId]);
  const allOrgRows = await TransactionManager.queryAll(db, `SELECT id, name, description, representatives, membership_policy, voting_enabled,
    voting_threshold, is_active, created_by_admin_id, created_at,
    branding_color, branding_logo_url, branding_title, branding_banner_url, icon_set, font_family
    FROM organizations WHERE is_active = true ORDER BY created_at DESC`, []);
  const memberOrgIds = new Set(memberRows.map(r => r.id));
  const memberOrgs = memberRows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    representatives: safeJsonParseArray(row.representatives),
    membershipPolicy: row.membership_policy,
    votingEnabled: row.voting_enabled === true,
    votingThreshold: row.voting_threshold,
    isActive: row.is_active === true,
    membershipStatus: row.membership_status,
    joinedAt: row.joined_at,
    createdAt: row.created_at,
    brandingColor: row.branding_color || null,
    brandingLogoUrl: row.branding_logo_url || null,
    brandingTitle: row.branding_title || null,
    brandingBannerUrl: row.branding_banner_url || null,
    iconSet: row.icon_set || null,
    fontFamily: row.font_family || null
  }));
  const representativeOrgs = allOrgRows
    .filter(row => !memberOrgIds.has(row.id))
    .filter(row => safeJsonParseArray(row.representatives).includes(userId))
    .map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      representatives: safeJsonParseArray(row.representatives),
      membershipPolicy: row.membership_policy,
      votingEnabled: row.voting_enabled === true,
      votingThreshold: row.voting_threshold,
      isActive: row.is_active === true,
      membershipStatus: null,
      joinedAt: null,
      createdAt: row.created_at,
      brandingColor: row.branding_color || null,
      brandingLogoUrl: row.branding_logo_url || null,
      brandingTitle: row.branding_title || null,
      brandingBannerUrl: row.branding_banner_url || null,
      iconSet: row.icon_set || null,
      fontFamily: row.font_family || null
    }));
  const organizations = [...memberOrgs, ...representativeOrgs].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return { organizations };
}

/**
 * Get a single organization with members (access assumed enforced by caller).
 * @param {Object} db
 * @param {string} organizationId
 * @returns {Promise<{ organization: Object }>}
 */
async function getOrganizationWithMembers(db, organizationId, options = {}) {
  const { userId, baseUrl } = options;
  const org = await TransactionManager.query(db, `SELECT id, name, description, representatives, membership_policy, voting_enabled,
    voting_threshold, is_active, created_by_admin_id, created_at,
    branding_color, branding_logo_url, branding_title, branding_banner_url, icon_set, font_family,
    overview_pinned_event_id, overview_pinned_at, overview_pinned_by_user_id,
    primary_parent_id, org_kind, participation_profile, tree_depth, tree_path, participation_graph_root_id
    FROM organizations WHERE id = ?`, [organizationId]);
  if (!org) throw ApiError.notFound('Organization');

  const members = await TransactionManager.queryAll(db, `
    SELECT om.*, u.name, u.email, u.avatar
    FROM organization_members om
    JOIN users u ON om.user_id = u.id
    WHERE om.organization_id = ? AND om.user_id NOT IN (SELECT id FROM organizations)
    ORDER BY om.joined_at DESC
  `, [organizationId]);

  let representatives;
  try {
    const repRows = await TransactionManager.queryAll(db, `
      SELECT user_id FROM organization_representatives
      WHERE organization_id = ? AND status = 'active'
      ORDER BY added_at
    `, [organizationId]);
    representatives = repRows.map(r => r.user_id);
  } catch (repErr) {
    logger.warn('Failed to fetch representatives from table, using JSON column', { error: repErr.message, organizationId });
    representatives = safeJsonParseArray(org.representatives);
  }

  let overviewPinnedEvent = null;
  if (org.overview_pinned_event_id && userId) {
    const CalendarService = require('./CalendarService');
    try {
      overviewPinnedEvent = await CalendarService.resolveEventById(db, {
        eventId: org.overview_pinned_event_id,
        organizationId,
        userId,
        baseUrl: baseUrl || config.FRONTEND_URL
      });
    } catch (err) {
      logger.warn('Failed to resolve overview pinned event', { organizationId, error: err.message });
    }
  }

  return {
    organization: {
      id: org.id,
      name: org.name,
      description: org.description,
      brandingColor: org.branding_color || null,
      brandingLogoUrl: org.branding_logo_url || null,
      brandingTitle: org.branding_title || null,
      brandingBannerUrl: org.branding_banner_url || null,
      iconSet: org.icon_set || null,
      fontFamily: org.font_family || null,
      representatives,
      membershipPolicy: org.membership_policy,
      votingThreshold: org.voting_threshold,
      isActive: org.is_active === true,
      createdAt: org.created_at,
      overviewPinnedEventId: org.overview_pinned_event_id || null,
      overviewPinnedAt: org.overview_pinned_at || null,
      overviewPinnedByUserId: org.overview_pinned_by_user_id || null,
      overviewPinnedEvent,
      primaryParentId: org.primary_parent_id || null,
      orgKind: org.org_kind || 'standard',
      participationProfile: org.participation_profile || 'classical_committee',
      treeDepth: org.tree_depth ?? 0,
      treePath: org.tree_path || `/${org.id}`,
      participationGraphRootId: org.participation_graph_root_id || org.id,
      members: members.map(m => ({
        id: m.id,
        userId: m.user_id,
        status: m.status,
        joinedAt: m.joined_at,
        leftAt: m.left_at,
        user: { id: m.user_id, name: m.name, email: m.email, avatar: m.avatar }
      }))
    }
  };
}

/**
 * Pin or clear a calendar event on the organization overview (representatives only).
 * @param {Object} db
 * @param {Object} params
 * @param {string} params.organizationId
 * @param {string} params.userId
 * @param {string|null} params.eventId
 * @param {string} [params.baseUrl]
 * @returns {Promise<Object>}
 */
async function setOverviewPin(db, { organizationId, userId, eventId, baseUrl }) {
  if (eventId === null || eventId === undefined || eventId === '') {
    await TransactionManager.execute(db,
      `UPDATE organizations SET overview_pinned_event_id = NULL, overview_pinned_at = NULL, overview_pinned_by_user_id = NULL WHERE id = ?`,
      [organizationId]
    );
    return {
      overviewPinnedEventId: null,
      overviewPinnedAt: null,
      overviewPinnedByUserId: null,
      overviewPinnedEvent: null
    };
  }

  const CalendarService = require('./CalendarService');
  const resolved = await CalendarService.resolveEventById(db, {
    eventId,
    organizationId,
    userId,
    baseUrl: baseUrl || config.FRONTEND_URL
  });
  if (!resolved) {
    throw ApiError.notFound('Calendar event not found or not accessible', 'EVENT_NOT_FOUND');
  }

  const start = new Date(resolved.start);
  if (Number.isNaN(start.getTime()) || start < new Date()) {
    throw ApiError.validation('Only upcoming events can be pinned', null, 'PAST_EVENT');
  }

  const pinnedAt = new Date().toISOString();
  const updateResult = await TransactionManager.execute(db,
    `UPDATE organizations SET overview_pinned_event_id = ?, overview_pinned_at = ?, overview_pinned_by_user_id = ? WHERE id = ?`,
    [eventId, pinnedAt, userId, organizationId]
  );
  if (!updateResult?.changes) {
    throw ApiError.notFound('Organization not found', 'ORG_NOT_FOUND');
  }

  return {
    overviewPinnedEventId: eventId,
    overviewPinnedAt: pinnedAt,
    overviewPinnedByUserId: userId,
    overviewPinnedEvent: resolved
  };
}

/**
 * Invite members by email. Caller must enforce permission.
 * @param {Object} db
 * @param {string} organizationId
 * @param {string} userId
 * @param {{ emails: string[] }} params
 * @param {{ req: Object, logAudit: function }} auditContext
 * @returns {Promise<{ invitations: Array, failedEmails: Array, invitationLinks: Array }>}
 */
async function inviteMembers(db, organizationId, userId, { emails }, auditContext = {}) {
  const organization = await TransactionManager.query(db,
    'SELECT name, branding_color, branding_logo_url, branding_title FROM organizations WHERE id = ?',
    [organizationId]
  );
  if (!organization) throw ApiError.notFound('Organization');
  const inviter = await TransactionManager.query(db, 'SELECT name FROM users WHERE id = ?', [userId]);
  const inviterName = inviter?.name || 'A representative';
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + 7);
  const invitations = [];
  const failedEmails = [];
  const orgBranding = {
    name: organization.name,
    brandingColor: organization.branding_color,
    brandingLogoUrl: organization.branding_logo_url,
    brandingTitle: organization.branding_title,
  };

  for (const email of emails) {
    try {
      const emailLower = email.toLowerCase();
      const existingInvitation = await TransactionManager.query(db,
        `SELECT id, invitation_token, status, expires_at 
         FROM organization_invitations 
         WHERE organization_id = ? AND email = ? AND status = 'pending' 
         ORDER BY created_at DESC LIMIT 1`,
        [organizationId, emailLower]
      );
      let invitationId, invitationToken, isResend = false;

      if (existingInvitation) {
        const expiresAt = new Date(existingInvitation.expires_at);
        const now = new Date();
        if (now > expiresAt) {
          await TransactionManager.execute(db, 'UPDATE organization_invitations SET status = ? WHERE id = ?', ['expired', existingInvitation.id]);
          invitationToken = crypto.randomBytes(32).toString('hex');
          invitationId = uuidv4();
          await TransactionManager.execute(db,
            `INSERT INTO organization_invitations (
              id, organization_id, email, invitation_token, invitation_type, invited_by, status, expires_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [invitationId, organizationId, emailLower, invitationToken, 'member', userId, 'pending', expirationDate.toISOString()]
          );
        } else {
          invitationId = existingInvitation.id;
          invitationToken = existingInvitation.invitation_token;
          isResend = true;
          await TransactionManager.execute(db,
            `UPDATE organization_invitations SET expires_at = ?, invited_by = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [expirationDate.toISOString(), userId, invitationId]
          );
        }
      } else {
        invitationToken = crypto.randomBytes(32).toString('hex');
        invitationId = uuidv4();
        await TransactionManager.execute(db,
          `INSERT INTO organization_invitations (
            id, organization_id, email, invitation_token, invitation_type, invited_by, status, expires_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [invitationId, organizationId, emailLower, invitationToken, 'member', userId, 'pending', expirationDate.toISOString()]
        );
      }

      const invitationLink = urls.register(invitationToken, email);
      try {
        await sendInvitationEmail(email, organization.name, invitationToken, inviterName, 'member', { org: orgBranding });
        invitations.push({ id: invitationId, email, token: invitationToken, link: invitationLink, isResend });
      } catch (emailError) {
        logger.error('Failed to send invitation email', { error: emailError.message, email, organizationId });
        failedEmails.push({ email, error: emailError.message, invitationId, invitationLink });
        invitations.push({ id: invitationId, email, token: invitationToken, link: invitationLink, emailFailed: true });
      }
    } catch (dbError) {
      logger.error('Failed to create invitation', { error: dbError.message, email, organizationId });
      failedEmails.push({ email, error: 'Database error' });
    }
  }

  if (auditContext.logAudit) {
    auditContext.logAudit(db, organizationId, 'member_bulk_invited', userId, null, {
      emailCount: emails.length,
      emails,
      successful: invitations.length,
      failed: failedEmails.length
    }, auditContext.req);
  }

  return {
    invitations,
    failedEmails,
    invitationLinks: invitations.map(inv => ({ email: inv.email, link: inv.link }))
  };
}

/**
 * Invite an existing user to join by user ID (creates pending invitation; no active membership until accepted).
 * @param {Object} db
 * @param {string} organizationId
 * @param {string} userId - acting user (representative)
 * @param {string} memberUserId - user to invite
 * @param {{ req: Object, logAudit: function }} auditContext
 * @returns {Promise<{ invitationSent: boolean, invitation: Object, message: string }>}
 */
async function addMember(db, organizationId, userId, memberUserId, auditContext = {}) {
  const user = await TransactionManager.query(db, 'SELECT id, name, email FROM users WHERE id = ?', [memberUserId]);
  if (!user) throw ApiError.notFound('User', 'USER_NOT_FOUND');
  const isOrganization = await TransactionManager.query(db, 'SELECT id FROM organizations WHERE id = ?', [memberUserId]);
  if (isOrganization) throw ApiError.validation('Cannot add organization as member', null, 'INVALID_MEMBER_ID');
  const existing = await TransactionManager.query(db,
    'SELECT id, status FROM organization_members WHERE organization_id = ? AND user_id = ?',
    [organizationId, memberUserId]
  );
  if (existing && existing.status === 'active') {
    throw ApiError.validation('User is already a member', null, 'USER_ALREADY_MEMBER');
  }

  const { invitations, failedEmails } = await inviteMembers(db, organizationId, userId, { emails: [user.email] }, auditContext);
  if (!invitations.length) {
    const failure = failedEmails[0];
    throw ApiError.validation(
      failure?.error || 'Failed to send membership invitation',
      failure ? { email: failure.email } : null,
      'INVITATION_FAILED'
    );
  }

  const invitation = invitations[0];
  return {
    invitationSent: true,
    invitation: {
      id: invitation.id,
      email: invitation.email,
      organizationId,
      userId: memberUserId,
      status: 'pending',
      link: invitation.link,
    },
    message: 'Membership invitation sent. The user must accept before joining the organization.',
  };
}

/**
 * Remove a member (set status to legacy and sync document collaborators). Caller must enforce permission.
 * @param {Object} db
 * @param {string} organizationId
 * @param {string} userId - acting user (representative)
 * @param {string} memberUserId - user to remove
 * @param {{ req: Object, logAudit: function }} auditContext
 * @returns {Promise<{ documentsAffected: number }>}
 */
async function removeMember(db, organizationId, userId, memberUserId, auditContext = {}) {
  let documentsAffected = 0;

  await TransactionManager.executeInTransaction(db, async (trx) => {
    const result = await TransactionManager.execute(trx, `UPDATE organization_members SET
      status = 'legacy', left_at = ?
      WHERE organization_id = ? AND user_id = ?`, [new Date().toISOString(), organizationId, memberUserId]);
    if (result.changes === 0) throw ApiError.notFound('Member', 'MEMBER_NOT_FOUND');
    documentsAffected = await removeMemberFromOrganizationDocuments(trx, organizationId, memberUserId);
    UnifiedVotingService.invalidateOrganizationCache(organizationId);
    if (auditContext.logAudit) {
      auditContext.logAudit(trx, organizationId, 'member_left', userId, memberUserId, {
        initiatedBy: auditContext.initiatedBy || 'representative',
        autoCollaboratorCleanup: true,
        documentsAffected
      }, auditContext.req);
    }
  });

  return { documentsAffected };
}

async function triggerReplacementElectionForDeparture(trx, organizationId, userId) {
  const rules = await GovernanceRulesService.getGovernanceRules(trx, organizationId);
  const memberRow = await TransactionManager.query(
    trx,
    'SELECT COUNT(*) as count FROM organization_members WHERE organization_id = ? AND status = ?',
    [organizationId, 'active']
  );
  const memberCount = memberRow ? parseInt(memberRow.count, 10) : 0;
  const quorumPercentage = Number(rules?.election_quorum_percentage) || 0.5;
  const quorumRequired = Math.ceil(memberCount * quorumPercentage);
  return ElectionService.createReplacementElection(trx, {
    organizationId,
    termId: null,
    quorumRequired,
    createdBy: userId,
    electionTitle: 'Automatic Election - Replacement for Departing Representative',
    electionDescription: 'Election triggered by representative leaving the organization.',
    triggerType: 'resignation',
  });
}

/**
 * Allow an active member to leave an organization voluntarily.
 * Representatives trigger a draft replacement election for remaining reps before exiting.
 */
async function leaveOrganization(db, organizationId, userId, auditContext = {}) {
  const isMember = await isActiveMember(db, userId, organizationId);
  if (!isMember) {
    throw ApiError.forbidden('You are not an active member of this organization', 'NOT_ORGANIZATION_MEMBER');
  }

  let electionCreated = false;
  let electionId = null;
  let documentsAffected = 0;

  await TransactionManager.executeInTransaction(db, async (trx) => {
    const isRep = await isRepresentative(trx, userId, organizationId);
    if (isRep) {
      const repCountRow = await TransactionManager.query(
        trx,
        'SELECT COUNT(*) as count FROM organization_representatives WHERE organization_id = ? AND status = ?',
        [organizationId, 'active']
      );
      const repCount = repCountRow ? parseInt(repCountRow.count, 10) : 0;
      if (repCount <= 1) {
        throw ApiError.validation(
          'Cannot leave as the last active representative',
          null,
          'CANNOT_LEAVE_LAST_REP'
        );
      }

      electionId = await triggerReplacementElectionForDeparture(trx, organizationId, userId);
      electionCreated = true;

      await TransactionManager.execute(
        trx,
        `UPDATE organization_representatives
          SET status = 'removed', removed_at = CURRENT_TIMESTAMP
          WHERE organization_id = ? AND user_id = ? AND status = 'active'`,
        [organizationId, userId]
      );

      if (auditContext.logAudit) {
        auditContext.logAudit(trx, organizationId, 'election_created', userId, userId, {
          electionId,
          initiatedBy: 'self_leave',
          trigger: 'representative_departure',
        }, auditContext.req);
      }
    }

    const result = await TransactionManager.execute(
      trx,
      `UPDATE organization_members SET status = 'legacy', left_at = ?
        WHERE organization_id = ? AND user_id = ?`,
      [new Date().toISOString(), organizationId, userId]
    );
    if (result.changes === 0) throw ApiError.notFound('Member', 'MEMBER_NOT_FOUND');

    documentsAffected = await removeMemberFromOrganizationDocuments(trx, organizationId, userId);
    UnifiedVotingService.invalidateOrganizationCache(organizationId);

    if (auditContext.logAudit) {
      auditContext.logAudit(trx, organizationId, 'member_left', userId, userId, {
        initiatedBy: auditContext.initiatedBy || 'self',
        autoCollaboratorCleanup: true,
        documentsAffected,
        electionId: electionCreated ? electionId : undefined,
      }, auditContext.req);
    }
  });

  const webSocketManager = require('../modules/websocket');
  webSocketManager.broadcastOrganizationUpdate(organizationId, 'member-removed', {
    organizationId,
    userId,
    removedBy: userId,
    documentsAffected,
    selfLeave: true,
  });

  if (electionCreated) {
    webSocketManager.broadcastOrganizationUpdate(organizationId, 'representative-departure-election', {
      organizationId,
      electionId,
      departedUserId: userId,
    });
  }

  return {
    success: true,
    electionCreated,
    electionId: electionCreated ? electionId : undefined,
    documentsAffected,
  };
}

class OrganizationService {
  constructor(db) {
    this.db = db;
  }

  getOrganizationsForUser(userId, options) {
    return getOrganizationsForUser(this.db, userId, options);
  }

  getOrganizationsForUserFallback(userId) {
    return getOrganizationsForUserFallback(this.db, userId);
  }

  getOrganizationWithMembers(organizationId, options) {
    return getOrganizationWithMembers(this.db, organizationId, options);
  }

  inviteMembers(organizationId, userId, params, auditContext) {
    return inviteMembers(this.db, organizationId, userId, params, auditContext);
  }

  addMember(organizationId, userId, memberUserId, auditContext) {
    return addMember(this.db, organizationId, userId, memberUserId, auditContext);
  }

  removeMember(organizationId, userId, memberUserId, auditContext) {
    return removeMember(this.db, organizationId, userId, memberUserId, auditContext);
  }

  leaveOrganization(organizationId, userId, auditContext) {
    return leaveOrganization(this.db, organizationId, userId, auditContext);
  }
}

async function checkTableExists(db, tableName) {
  try {
    const tableExistsQuery = `
      SELECT table_name as name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ?
    `;
    const row = await TransactionManager.query(db, tableExistsQuery, [tableName]);
    return !!row;
  } catch (err) {
    return false;
  }
}

let organizationRepresentativesTableExistsCache = null;

/**
 * Check if organization has any documents (safeguard before deletion/deactivation).
 * @param {Object} db
 * @param {string} organizationId
 * @returns {Promise<number>}
 */
async function checkOrganizationHasDocuments(db, organizationId) {
  try {
    const row = await TransactionManager.query(db, `
      SELECT COUNT(*) as count
      FROM documents
      WHERE organization_id = ?
    `, [organizationId]);
    return parseInt(row?.count || 0, 10);
  } catch (err) {
    logger.error('Error checking organization documents', { error: err.message, organizationId });
    throw err;
  }
}

/**
 * Permanently delete an organization (admin only). Org must be deactivated first.
 * @param {Object} db
 * @param {string} organizationId
 * @param {{ confirmName: string, force?: boolean }} options
 */
async function deleteOrganizationHard(db, organizationId, options = {}) {
  const { confirmName, force = false } = options;

  const org = await TransactionManager.query(
    db,
    'SELECT id, name, is_active FROM organizations WHERE id = ?',
    [organizationId]
  );
  if (!org) {
    throw ApiError.notFound('Organization', 'ORGANIZATION_NOT_FOUND');
  }

  if (org.is_active === true || org.is_active === 1) {
    throw ApiError.validation(
      'Organization must be deactivated before permanent deletion',
      null,
      'ORG_MUST_BE_INACTIVE'
    );
  }

  if (!confirmName || confirmName.trim() !== org.name) {
    throw ApiError.validation(
      'Organization name confirmation does not match',
      null,
      'CONFIRM_NAME_MISMATCH'
    );
  }

  const documentCount = await checkOrganizationHasDocuments(db, organizationId);
  const memberRow = await TransactionManager.query(
    db,
    "SELECT COUNT(*) as count FROM organization_members WHERE organization_id = ? AND status = 'active'",
    [organizationId]
  );
  const activeMemberCount = parseInt(memberRow?.count || 0, 10);

  if ((documentCount > 0 || activeMemberCount > 0) && !force) {
    throw ApiError.conflict(
      'Organization has active data. Pass force: true to delete anyway.',
      { documentCount, activeMemberCount },
      'ORG_HAS_DATA'
    );
  }

  await TransactionManager.executeInTransaction(db, async (trx) => {
    await TransactionManager.execute(trx, 'DELETE FROM organizations WHERE id = ?', [organizationId]);
  });

  return {
    id: organizationId,
    name: org.name,
    documentCount,
    activeMemberCount,
  };
}

/**
 * Check data consistency between organization_members and organization_representatives.
 * @param {Object} db
 * @param {string} userId
 * @returns {Promise<{ hasInconsistencies: boolean, inconsistencies: Array, memberCount?: number, representativeCount?: number }>}
 */
async function checkDataConsistency(db, userId) {
  let repTableExists = organizationRepresentativesTableExistsCache;
  if (repTableExists === null) {
    repTableExists = await checkTableExists(db, 'organization_representatives');
    organizationRepresentativesTableExistsCache = repTableExists;
  }
  if (!repTableExists) {
    return { hasInconsistencies: false, message: 'organization_representatives table does not exist', inconsistencies: [] };
  }
  try {
    const memberRows = await TransactionManager.queryAll(db,
      'SELECT organization_id FROM organization_members WHERE user_id = ? AND status = ?',
      [userId, 'active']
    );
    const repRows = await TransactionManager.queryAll(db,
      'SELECT organization_id FROM organization_representatives WHERE user_id = ? AND status = ?',
      [userId, 'active']
    );
    const memberOrgIds = new Set(memberRows.map(r => r.organization_id));
    const repOrgIds = new Set(repRows.map(r => r.organization_id));
    const inconsistencies = [];
    repOrgIds.forEach(orgId => {
      if (!memberOrgIds.has(orgId)) {
        inconsistencies.push({
          type: 'representative_without_membership',
          organizationId: orgId,
          message: 'User is a representative but not an active member'
        });
      }
    });
    if (inconsistencies.length > 0) {
      logger.warn('Data consistency check found inconsistencies', { userId, inconsistencyCount: inconsistencies.length, inconsistencies });
    }
    return {
      hasInconsistencies: inconsistencies.length > 0,
      memberCount: memberOrgIds.size,
      representativeCount: repOrgIds.size,
      inconsistencies
    };
  } catch (err) {
    logger.error('Error checking data consistency', { error: err.message, userId });
    return { hasInconsistencies: false, inconsistencies: [] };
  }
}

/**
 * Insert organization_representatives row when invitation type is representative.
 * @param {Object} txDb
 * @param {Object} invitation - Row with organization_id, invitation_type
 * @param {string} userId
 */
async function _addRepresentativeIfInvited(txDb, invitation, userId) {
  if (invitation.invitation_type !== 'representative') {
    return;
  }
  const existingRepRow = await TransactionManager.query(txDb,
    'SELECT 1 FROM organization_representatives WHERE organization_id = ? AND user_id = ? AND status = ?',
    [invitation.organization_id, userId, 'active']
  );
  if (existingRepRow) {
    return;
  }
  const repTableId = uuidv4();
  try {
    await TransactionManager.execute(txDb, `INSERT INTO organization_representatives (
      id, organization_id, user_id, status, added_at
    ) VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)`, [repTableId, invitation.organization_id, userId]);
  } catch (repErr) {
    const msg = repErr.message || '';
    if (msg.includes('UNIQUE constraint') || msg.includes('unique constraint') || repErr.code === '23505') {
      logger.info('User already added as representative (race condition)', {
        organizationId: invitation.organization_id,
        userId
      });
      return;
    }
    throw repErr;
  }
}

/**
 * Accept invitation when user is already an org member: mark accepted and promote to rep if applicable.
 * @param {Object} db
 * @param {Object} invitation
 * @param {string} userId
 * @returns {Promise<{ outcome: 'already_member', organizationId: string, organizationName: string, invitationType: string, invitationId: string }>}
 */
async function _acceptInvitationAlreadyMember(db, invitation, userId) {
  await TransactionManager.executeInTransaction(db, async (txDb) => {
    await TransactionManager.execute(txDb,
      `UPDATE organization_invitations 
       SET status = ?, accepted_at = CURRENT_TIMESTAMP, accepted_by_user_id = ?
       WHERE id = ?`,
      ['accepted', userId, invitation.id]
    );
    await _addRepresentativeIfInvited(txDb, invitation, userId);
  });

  return {
    outcome: 'already_member',
    organizationId: invitation.organization_id,
    organizationName: invitation.organization_name || null,
    invitationType: invitation.invitation_type || 'member',
    invitationId: invitation.id
  };
}

/**
 * Core invitation acceptance: mark accepted, add member, add rep if type representative.
 * Caller must have validated invitation (email, expiry, status) and that user is not already a member.
 * @param {Object} db
 * @param {Object} invitation - Row with id, organization_id, invitation_type
 * @param {string} userId
 * @returns {Promise<{ organizationId: string, organizationName: string, invitationType: string, invitationId: string }>}
 */
async function _acceptInvitationCore(db, invitation, userId) {
  const memberId = uuidv4();

  await TransactionManager.executeInTransaction(db, async (txDb) => {
    await TransactionManager.execute(txDb,
      `UPDATE organization_invitations 
       SET status = ?, accepted_at = CURRENT_TIMESTAMP, accepted_by_user_id = ?
       WHERE id = ?`,
      ['accepted', userId, invitation.id]
    );
    await TransactionManager.execute(txDb,
      `INSERT INTO organization_members (id, organization_id, user_id, status, joined_at)
       VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)`,
      [memberId, invitation.organization_id, userId]
    );
    await _addRepresentativeIfInvited(txDb, invitation, userId);
  });

  return {
    organizationId: invitation.organization_id,
    organizationName: invitation.organization_name || null,
    invitationType: invitation.invitation_type || 'member',
    invitationId: invitation.id
  };
}

/**
 * Accept organization invitation by token. Validates email, expiry, status; returns outcome or throws.
 * @param {Object} db
 * @param {string} token - Invitation token
 * @param {string} userId
 * @param {string} userEmail
 * @returns {Promise<{ outcome: 'accepted'|'already_member', organizationId: string, organizationName: string, invitationType: string, invitationId?: string }>}
 */
async function acceptInvitationByToken(db, token, userId, userEmail) {
  const invitation = await TransactionManager.query(db,
    `SELECT i.id, i.organization_id, i.email, i.invitation_type, i.status, i.expires_at,
      o.name as organization_name
     FROM organization_invitations i
     LEFT JOIN organizations o ON i.organization_id = o.id
     WHERE i.invitation_token = ?`,
    [token]
  );

  if (!invitation) {
    throw ApiError.notFound('Invalid invitation token', 'INVALID_INVITATION_TOKEN');
  }
  if (userEmail.toLowerCase() !== invitation.email.toLowerCase()) {
    throw ApiError.forbidden('This invitation was sent to a different email address', 'INVITATION_EMAIL_MISMATCH');
  }

  const now = new Date();
  const expiresAt = new Date(invitation.expires_at);
  if (now > expiresAt) {
    await TransactionManager.execute(db, 'UPDATE organization_invitations SET status = ? WHERE id = ? AND status = ?', ['expired', invitation.id, 'pending']);
    throw ApiError.validation('Invitation has expired', { valid: false, expired: true }, 'INVITATION_EXPIRED');
  }
  if (invitation.status !== 'pending') {
    throw ApiError.validation(`Invitation has been ${invitation.status}`, { valid: false, status: invitation.status }, 'INVITATION_NOT_PENDING');
  }

  const existingMember = await TransactionManager.query(db,
    'SELECT id, status FROM organization_members WHERE organization_id = ? AND user_id = ?',
    [invitation.organization_id, userId]
  );

  if (existingMember) {
    return _acceptInvitationAlreadyMember(db, invitation, userId);
  }

  const result = await _acceptInvitationCore(db, invitation, userId);
  return { outcome: 'accepted', ...result };
}

/**
 * Accept organization invitation by id. Same validation as by token.
 * @param {Object} db
 * @param {string} invitationId
 * @param {string} userId
 * @param {string} userEmail
 * @returns {Promise<{ outcome: 'accepted'|'already_member', organizationId: string, organizationName: string, invitationType: string, invitationId: string }>}
 */
async function acceptInvitationById(db, invitationId, userId, userEmail) {
  const invitation = await TransactionManager.query(db,
    `SELECT i.id, i.organization_id, i.email, i.invitation_type, i.status, i.expires_at,
      o.name as organization_name
     FROM organization_invitations i
     LEFT JOIN organizations o ON i.organization_id = o.id
     WHERE i.id = ?`,
    [invitationId]
  );

  if (!invitation) {
    throw ApiError.notFound('Invitation not found', 'INVITATION_NOT_FOUND');
  }
  if (userEmail.toLowerCase() !== invitation.email.toLowerCase()) {
    throw ApiError.forbidden('This invitation was sent to a different email address', 'INVITATION_EMAIL_MISMATCH');
  }

  const now = new Date();
  const expiresAt = new Date(invitation.expires_at);
  if (now > expiresAt) {
    await TransactionManager.execute(db, 'UPDATE organization_invitations SET status = ? WHERE id = ? AND status = ?', ['expired', invitation.id, 'pending']);
    throw ApiError.validation('Invitation has expired', { valid: false, expired: true }, 'INVITATION_EXPIRED');
  }
  if (invitation.status !== 'pending') {
    throw ApiError.validation(`Invitation has been ${invitation.status}`, { valid: false, status: invitation.status }, 'INVITATION_NOT_PENDING');
  }

  const existingMember = await TransactionManager.query(db,
    'SELECT id, status FROM organization_members WHERE organization_id = ? AND user_id = ?',
    [invitation.organization_id, userId]
  );

  if (existingMember) {
    return _acceptInvitationAlreadyMember(db, invitation, userId);
  }

  const result = await _acceptInvitationCore(db, invitation, userId);
  return { outcome: 'accepted', ...result };
}

/**
 * Add a user as representative. Caller must ensure current user is rep and new rep is active member.
 * @param {Object} db
 * @param {string} organizationId
 * @param {string} newRepresentativeId
 * @returns {Promise<{ representatives: string[] }>}
 */
async function addRepresentative(db, organizationId, newRepresentativeId) {
  const existingRep = await TransactionManager.query(db,
    'SELECT 1 FROM organization_representatives WHERE organization_id = ? AND user_id = ? AND status = ?',
    [organizationId, newRepresentativeId, 'active']
  );
  if (existingRep) {
    throw ApiError.validation('User is already a representative', null, 'USER_ALREADY_REPRESENTATIVE');
  }

  const { isActiveMember } = require('../modules/permissions');
  const isMember = await isActiveMember(db, newRepresentativeId, organizationId);
  if (!isMember) {
    throw ApiError.validation('Only active members can be nominated as representatives. The user must be a member of the organization first.', null, 'NOT_ACTIVE_MEMBER');
  }

  const repTableId = uuidv4();
  await TransactionManager.executeInTransaction(db, async (txDb) => {
    try {
      await TransactionManager.execute(txDb, `INSERT INTO organization_representatives (
        id, organization_id, user_id, status, added_at
      ) VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)`, [repTableId, organizationId, newRepresentativeId]);
    } catch (repErr) {
      if (!repErr.message || !repErr.message.includes('UNIQUE')) {
        logger.error('Error adding representative to table', { error: repErr.message, organizationId, newRepresentativeId });
        throw repErr;
      }
    }
  });

  const updatedRepsRows = await TransactionManager.queryAll(db,
    'SELECT user_id FROM organization_representatives WHERE organization_id = ? AND status = ?',
    [organizationId, 'active']
  );
  return { representatives: updatedRepsRows.map(r => r.user_id) };
}

/**
 * Update organization fields and return updated organization. Caller must enforce rep permission.
 * @param {Object} db
 * @param {string} organizationId
 * @param {string[]} updateFields - e.g. ["name = ?", "description = ?"] from buildUpdateFields
 * @param {Array} updateValues - values in order (without organizationId); service appends organizationId for WHERE
 * @returns {Promise<Object|null>} Formatted organization for API or null if not found
 */
async function updateOrganizationSettings(db, organizationId, updateFields, updateValues) {
  if (!updateFields || updateFields.length === 0) {
    throw ApiError.validation('No fields to update', null, 'NO_FIELDS_TO_UPDATE');
  }
  const setClause = updateFields.join(', ');
  const values = [...updateValues, organizationId];
  await TransactionManager.execute(db, `UPDATE organizations SET ${setClause} WHERE id = ?`, values);

  const org = await TransactionManager.query(db, `SELECT id, name, description, representatives, membership_policy, voting_enabled,
    voting_threshold, is_active, created_by_admin_id, created_at, updated_at,
    branding_color, branding_logo_url, branding_title, branding_banner_url, icon_set, font_family
    FROM organizations WHERE id = ?`, [organizationId]);
  if (!org) return null;

  return {
    id: org.id,
    name: org.name,
    description: org.description,
    representatives: safeJsonParseArray(org.representatives),
    membershipPolicy: org.membership_policy,
    votingThreshold: org.voting_threshold,
    isActive: org.is_active === true,
    createdAt: org.created_at,
    brandingColor: org.branding_color || null,
    brandingLogoUrl: org.branding_logo_url || null,
    brandingTitle: org.branding_title || null,
    brandingBannerUrl: org.branding_banner_url || null,
    iconSet: org.icon_set || null,
    fontFamily: org.font_family || null
  };
}

/**
 * Log an organization audit event.
 * @param {Object} db
 * @param {string} organizationId
 * @param {string} actionType
 * @param {string} performedByUserId
 * @param {string|null} affectedUserId
 * @param {Object} details
 * @param {Object} req - Express request (for ip, user-agent)
 */
async function logAudit(db, organizationId, actionType, performedByUserId, affectedUserId = null, details = {}, req) {
  const normalizedPerformedBy = resolveAuditPerformedByUserId(performedByUserId);
  const normalizedAffected = resolveAuditAffectedUserId(affectedUserId);
  // req may be absent for system-initiated audit events; never pass undefined bindings.
  const ipAddress = (req && req.ip) || null;
  const userAgent = (req && typeof req.get === 'function' && req.get('User-Agent')) || null;
  const auditData = {
    id: uuidv4(),
    organization_id: organizationId,
    action_type: actionType,
    performed_by_user_id: normalizedPerformedBy,
    affected_user_id: normalizedAffected,
    details: JSON.stringify(details),
    ip_address: ipAddress,
    user_agent: userAgent,
    created_at: new Date().toISOString()
  };
  try {
    await TransactionManager.execute(db, `INSERT INTO organization_audit (
      id, organization_id, action_type, performed_by_user_id, affected_user_id,
      details, ip_address, user_agent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      auditData.id, auditData.organization_id, auditData.action_type,
      auditData.performed_by_user_id, auditData.affected_user_id,
      auditData.details, auditData.ip_address, auditData.user_agent, auditData.created_at
    ]);
  } catch (err) {
    logger.error('Error logging audit event', { error: err.message, organizationId, actionType });
  }
}

/**
 * Create organization (admin only). Used by deprecated POST / route.
 * @param {Object} db
 * @param {string} userId - admin user id
 * @param {Object} body - name, description, representatives, membershipPolicy, votingEnabled, votingThreshold
 * @param {Object} req - for logAudit
 * @returns {Promise<Object>} created organization
 */
async function createOrganization(db, userId, body, req) {
  const { name, description, representatives, membershipPolicy, votingEnabled, votingThreshold } = body;
  const orgId = uuidv4();
  const repsJson = JSON.stringify(representatives || []);

  const organization = await TransactionManager.executeInTransaction(db, async (trx) => {
    const votingEnabledValue = !!(votingEnabled || false);
    await TransactionManager.execute(trx, `INSERT INTO organizations (
      id, name, description, representatives, membership_policy, voting_enabled, voting_threshold, created_by_admin_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
      orgId, name, description || '', repsJson,
      membershipPolicy || 'invitation', votingEnabledValue, votingThreshold || 0.5, userId
    ]);

    const totalRepresentatives = (representatives || []).length;
    if (totalRepresentatives > 0) {
      for (const repId of representatives) {
        const memberId = uuidv4();
        const repTableId = uuidv4();
        await TransactionManager.execute(trx, `INSERT INTO organization_members (
          id, organization_id, user_id, status, joined_at
        ) VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)`, [memberId, orgId, repId]);
        try {
          await TransactionManager.execute(trx, `INSERT INTO organization_representatives (
            id, organization_id, user_id, status, added_at
          ) VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)`, [repTableId, orgId, repId]);
        } catch (repErr) {
          if (!repErr.message || !repErr.message.includes('UNIQUE')) {
            logger.error('Error adding representative to table', { error: repErr.message, representativeId: repId, organizationId: orgId });
            throw repErr;
          }
        }
        await logAudit(trx, orgId, 'member_added', userId, repId, { role: 'representative' }, req);
      }
    }

    await GovernanceRulesService.createDefaultGovernanceRules(trx, orgId);
    logger.debug('Governance rules created for organization', { organizationId: orgId });
    await logAudit(trx, orgId, 'org_created', userId, null, { name, representatives: representatives || [] }, req);

    return {
      id: orgId,
      name,
      description,
      representatives: representatives || [],
      membershipPolicy: membershipPolicy || 'invitation',
      votingEnabled: votingEnabled || false,
      votingThreshold: votingThreshold || 0.5,
      isActive: true,
      createdAt: new Date().toISOString()
    };
  });

  return organization;
}

/**
 * Validate invitation token. Returns payload for response (valid, userExists, invitation or error shape).
 * @param {Object} db
 * @param {string} token
 * @returns {Promise<Object>} { valid, userExists?, invitation?, error?, expired?, status? }
 */
async function validateInvitationToken(db, token) {
  const invitation = await TransactionManager.query(db,
    `SELECT 
      i.id, i.organization_id, i.email, i.invitation_type, i.status, 
      i.expires_at, i.created_at, i.invited_by,
      o.name as organization_name,
      u.name as inviter_name
    FROM organization_invitations i
    LEFT JOIN organizations o ON i.organization_id = o.id
    LEFT JOIN users u ON i.invited_by = u.id
    WHERE i.invitation_token = ?`,
    [token]
  );

  if (!invitation) {
    return { error: 'Invalid invitation token', valid: false };
  }

  const now = new Date();
  const expiresAt = new Date(invitation.expires_at);
  if (now > expiresAt) {
    await TransactionManager.execute(db,
      'UPDATE organization_invitations SET status = ? WHERE id = ? AND status = ?',
      ['expired', invitation.id, 'pending']
    );
    return { error: 'Invitation has expired', valid: false, expired: true };
  }

  if (invitation.status !== 'pending') {
    return { error: `Invitation has been ${invitation.status}`, valid: false, status: invitation.status };
  }

  const existingUser = await TransactionManager.query(db, 'SELECT id FROM users WHERE email = ?', [invitation.email]);

  return {
    valid: true,
    userExists: !!existingUser,
    invitation: {
      id: invitation.id,
      organizationId: invitation.organization_id,
      organizationName: invitation.organization_name,
      email: invitation.email,
      invitationType: invitation.invitation_type,
      inviterName: invitation.inviter_name,
      expiresAt: invitation.expires_at,
      createdAt: invitation.created_at
    }
  };
}

/**
 * Decline invitation by token. Throws ApiError for invalid/expired/wrong email; returns { message } on success.
 * @param {Object} db
 * @param {string} token
 * @param {string} userId
 * @param {string} userEmail
 * @param {Object} req
 * @returns {Promise<{ message: string }>}
 */
async function declineInvitationByToken(db, token, userId, userEmail, req) {
  const invitation = await TransactionManager.query(db,
    `SELECT i.id, i.organization_id, i.email, i.status, i.expires_at
     FROM organization_invitations i
     WHERE i.invitation_token = ?`,
    [token]
  );

  if (!invitation) throw ApiError.notFound('Invalid invitation token', 'INVALID_INVITATION_TOKEN');
  if (userEmail.toLowerCase() !== invitation.email.toLowerCase()) {
    throw ApiError.forbidden('This invitation was sent to a different email address', 'INVITATION_EMAIL_MISMATCH');
  }

  const now = new Date();
  const expiresAt = new Date(invitation.expires_at);
  if (now > expiresAt) {
    await TransactionManager.execute(db,
      'UPDATE organization_invitations SET status = ? WHERE id = ? AND status = ?',
      ['expired', invitation.id, 'pending']
    );
    throw ApiError.validation('Invitation has expired', { valid: false, expired: true }, 'INVITATION_EXPIRED');
  }

  if (invitation.status !== 'pending') {
    throw ApiError.validation(`Invitation has been ${invitation.status}`, { valid: false, status: invitation.status }, 'INVITATION_NOT_PENDING');
  }

  await TransactionManager.execute(db,
    'UPDATE organization_invitations SET status = ? WHERE id = ?',
    ['cancelled', invitation.id]
  );

  await logAudit(db, invitation.organization_id, 'invitation_declined', userId, null, { invitationId: invitation.id }, req);
  return { message: 'Invitation declined' };
}

/**
 * Get pending invitations for a user by email.
 * @param {Object} db
 * @param {string} userEmail
 * @returns {Promise<{ invitations: Array, count: number }>}
 */
async function getPendingInvitationsForUser(db, userEmail) {
  const result = await TransactionManager.queryAll(db,
    `SELECT 
      i.id, i.organization_id, i.email, i.invitation_type, i.status, 
      i.expires_at, i.created_at, i.invited_by,
      o.name as organization_name,
      u.name as inviter_name
    FROM organization_invitations i
    LEFT JOIN organizations o ON i.organization_id = o.id
    LEFT JOIN users u ON i.invited_by = u.id
    WHERE i.email = ? AND i.status = 'pending'
    ORDER BY i.created_at DESC`,
    [userEmail.toLowerCase()]
  );
  const invitations = result || [];
  const now = new Date();
  const validInvitations = invitations.filter(inv => new Date(inv.expires_at) >= now);
  const expiredIds = invitations
    .filter(inv => new Date(inv.expires_at) < now)
    .map(inv => inv.id);

  if (expiredIds.length > 0) {
    await TransactionManager.execute(db,
      `UPDATE organization_invitations SET status = 'expired' WHERE id IN (${expiredIds.map(() => '?').join(',')})`,
      expiredIds
    );
  }

  return {
    invitations: validInvitations.map(inv => ({
      id: inv.id,
      organizationId: inv.organization_id,
      organizationName: inv.organization_name,
      email: inv.email,
      invitationType: inv.invitation_type,
      inviterName: inv.inviter_name,
      expiresAt: inv.expires_at,
      createdAt: inv.created_at
    })),
    count: validInvitations.length
  };
}

/**
 * Decline invitation by id. Throws if not found/wrong email/expired/not pending.
 * @param {Object} db
 * @param {string} invitationId
 * @param {string} userId
 * @param {string} userEmail
 * @param {Object} req
 * @returns {Promise<{ message: string }>}
 */
async function declineInvitationById(db, invitationId, userId, userEmail, req) {
  const invitation = await TransactionManager.query(db,
    `SELECT i.id, i.organization_id, i.email, i.status, i.expires_at
     FROM organization_invitations i
     WHERE i.id = ?`,
    [invitationId]
  );

  if (!invitation) throw ApiError.notFound('Invitation not found', 'INVITATION_NOT_FOUND');
  if (userEmail.toLowerCase() !== invitation.email.toLowerCase()) {
    throw ApiError.forbidden('This invitation was sent to a different email address', 'INVITATION_EMAIL_MISMATCH');
  }

  const now = new Date();
  const expiresAt = new Date(invitation.expires_at);
  if (now > expiresAt) {
    throw ApiError.validation('Invitation has expired', { valid: false, expired: true }, 'INVITATION_EXPIRED');
  }
  if (invitation.status !== 'pending') {
    throw ApiError.validation(`Invitation has been ${invitation.status}`, { valid: false, status: invitation.status }, 'INVITATION_NOT_PENDING');
  }

  await TransactionManager.execute(db,
    'UPDATE organization_invitations SET status = ? WHERE id = ?',
    ['cancelled', invitation.id]
  );

  await logAudit(db, invitation.organization_id, 'invitation_declined', userId, null, { invitationId: invitation.id }, req);
  return { message: 'Invitation declined' };
}

/**
 * Get organization invitations. Checks canInviteMembers via governance rules.
 * @param {Object} db
 * @param {string} organizationId
 * @param {string} userId
 * @param {Object} req - for canInviteMembers role and logAudit
 * @returns {Promise<{ success: boolean, invitations: Array, count: number }>}
 */
async function getOrganizationInvitations(db, organizationId, userId, req) {
  const rulesRaw = await getGovernanceRules(db, organizationId);
  const rules = rulesRaw ? transformRulesToCamelCase(rulesRaw) : null;
  const canInvite = await canInviteMembers(db, userId, organizationId, rules, req.user.role);
  if (!canInvite) {
    throw ApiError.forbidden('You do not have permission to view invitation history', 'CANNOT_VIEW_INVITATIONS');
  }

  const invitations = await TransactionManager.queryAll(db,
    `SELECT 
      i.id, i.email, i.invitation_type, i.status, i.expires_at, 
      i.accepted_at, i.created_at, i.invited_by,
      u.name as inviter_name,
      accepted_user.name as accepted_by_name
    FROM organization_invitations i
    LEFT JOIN users u ON i.invited_by = u.id
    LEFT JOIN users accepted_user ON i.accepted_by_user_id = accepted_user.id
    WHERE i.organization_id = ?
    ORDER BY i.created_at DESC`,
    [organizationId]
  );

  const formattedInvitations = invitations.map(inv => ({
    id: inv.id,
    email: inv.email,
    invitationType: inv.invitation_type,
    status: inv.status,
    expiresAt: inv.expires_at,
    acceptedAt: inv.accepted_at,
    createdAt: inv.created_at,
    inviterName: inv.inviter_name,
    acceptedByName: inv.accepted_by_name,
    isExpired: inv.status === 'pending' && new Date(inv.expires_at) < new Date()
  }));

  return {
    success: true,
    invitations: formattedInvitations,
    count: formattedInvitations.length
  };
}

/**
 * Resend invitation email. Checks canInviteMembers; returns response shape for route.
 * @param {Object} db
 * @param {string} organizationId
 * @param {string} invitationId
 * @param {string} userId
 * @param {Object} req
 * @returns {Promise<{ success: boolean, message: string, error?: string, invitationLink?: string }>}
 */
async function resendInvitation(db, organizationId, invitationId, userId, req) {
  const rulesRaw = await getGovernanceRules(db, organizationId);
  const rules = rulesRaw ? transformRulesToCamelCase(rulesRaw) : null;
  const canInvite = await canInviteMembers(db, userId, organizationId, rules, req.user.role);
  if (!canInvite) {
    throw ApiError.forbidden('You do not have permission to resend invitations', 'CANNOT_RESEND_INVITATIONS');
  }

  const invitation = await TransactionManager.query(db,
    `SELECT 
      i.id, i.email, i.invitation_token, i.invitation_type, i.status, i.expires_at,
      o.name as organization_name,
      o.branding_color, o.branding_logo_url, o.branding_title,
      u.name as inviter_name
    FROM organization_invitations i
    LEFT JOIN organizations o ON i.organization_id = o.id
    LEFT JOIN users u ON i.invited_by = u.id
    WHERE i.id = ? AND i.organization_id = ?`,
    [invitationId, organizationId]
  );

  if (!invitation) throw ApiError.notFound('Invitation', 'INVITATION_NOT_FOUND');
  if (invitation.status !== 'pending') {
    throw ApiError.validation(`Cannot resend invitation with status: ${invitation.status}`, null, 'INVALID_INVITATION_STATUS');
  }

  const now = new Date();
  const expiresAt = new Date(invitation.expires_at);
  if (now > expiresAt) {
    throw ApiError.validation('Cannot resend expired invitation. Please create a new invitation.', null, 'INVITATION_EXPIRED');
  }

  const inviter = await TransactionManager.query(db, 'SELECT name FROM users WHERE id = ?', [userId]);
  const inviterName = inviter?.name || 'A representative';

  try {
    await sendInvitationEmail(
      invitation.email,
      invitation.organization_name,
      invitation.invitation_token,
      inviterName,
      invitation.invitation_type,
      {
        org: {
          name: invitation.organization_name,
          brandingColor: invitation.branding_color,
          brandingLogoUrl: invitation.branding_logo_url,
          brandingTitle: invitation.branding_title,
        },
      }
    );
    await TransactionManager.execute(db,
      'UPDATE organization_invitations SET created_at = CURRENT_TIMESTAMP WHERE id = ?',
      [invitationId]
    );
    await logAudit(db, organizationId, 'invitation_resent', userId, null, { invitationId, email: invitation.email }, req);
    return { success: true, message: 'Invitation email resent successfully' };
  } catch (emailError) {
    logger.error('Failed to resend invitation email', {
      error: emailError.message,
      invitationId,
      email: invitation.email,
    });
    const frontendUrl = config.FRONTEND_URL;
    const invitationLink = `${frontendUrl}/register?token=${invitation.invitation_token}&email=${encodeURIComponent(invitation.email)}`;
    return {
      success: false,
      error: emailError.message,
      invitationLink,
      message: 'Failed to resend email, but invitation link is available'
    };
  }
}

/**
 * List organization votes.
 * @param {Object} db
 * @param {string} organizationId
 * @returns {Promise<{ votes: Array }>}
 */
async function listOrganizationVotes(db, organizationId, userId = null) {
  const rows = await TransactionManager.queryAll(db, `
    SELECT ov.id, ov.organization_id, ov.title, ov.description, ov.vote_type, ov.proposed_by_user_id,
      ov.approved_by_rep_id, ov.threshold, ov.status, ov.voting_starts_at, ov.voting_ends_at,
      ov.target_document_id, ov.result_yes, ov.result_no, ov.result_abstain, ov.created_at,
      vb.vote_choice as user_vote_choice
    FROM organization_votes ov
    LEFT JOIN vote_ballots vb ON vb.vote_id = ov.id AND vb.user_id = ?
    WHERE ov.organization_id = ?
    ORDER BY ov.created_at DESC
  `, [userId, organizationId]);

  const votes = rows.map(v => {
    const raw = v.threshold ?? 0.5;
    const normalized = raw <= 1 ? raw * 100 : raw;
    const choice = v.user_vote_choice;
    const userVoteChoice =
      choice === 'yes' || choice === 'no' || choice === 'abstain' ? choice : undefined;
    return {
      id: v.id,
      organizationId: v.organization_id,
      title: v.title,
      description: v.description,
      voteType: v.vote_type,
      proposedByUserId: v.proposed_by_user_id,
      approvedByRepId: v.approved_by_rep_id,
      threshold: normalized,
      status: v.status,
      votingStartsAt: v.voting_starts_at,
      votingEndsAt: v.voting_ends_at,
      targetDocumentId: v.target_document_id,
      resultYes: v.result_yes || 0,
      resultNo: v.result_no || 0,
      resultAbstain: v.result_abstain || 0,
      createdAt: v.created_at,
      userVoteChoice,
    };
  });
  return { votes };
}

/**
 * Create organization vote. Throws on validation/permission/voting not enabled.
 * @param {Object} db
 * @param {string} organizationId
 * @param {string} userId
 * @param {Object} body - title, description, vote_type, target_document_id, voting_start_date, voting_end_date (camel or snake)
 * @param {Object} req - for logAudit
 * @returns {Promise<Object>} { vote: { id, organizationId, title, ... } }
 */
async function createOrganizationVote(db, organizationId, userId, body, req) {
  const title = body.title;
  const description = body.description;
  const voteType = body.vote_type ?? body.voteType;
  const targetDocumentId = body.target_document_id ?? body.targetDocumentId;
  const votingStartDate = body.voting_start_date ?? body.votingStartDate;
  const votingEndDate = body.voting_end_date ?? body.votingEndDate;

  if (!title || typeof title !== 'string' || !title.trim()) {
    throw ApiError.validation('Vote title is required', null, 'MISSING_TITLE');
  }
  if (!voteType || typeof voteType !== 'string' || !voteType.trim()) {
    throw ApiError.validation('Vote type is required', null, 'MISSING_VOTE_TYPE');
  }
  const validVoteTypes = ['policy', 'document_change', 'document_amendment_adoption', 'membership', 'dissolution', 'other', 'representative_removal'];
  if (!validVoteTypes.includes(voteType)) {
    throw ApiError.validation(`Invalid vote type. Must be one of: ${validVoteTypes.join(', ')}`, null, 'INVALID_VOTE_TYPE');
  }
  if (voteType === 'document_change' && !targetDocumentId) {
    throw ApiError.validation('Target document ID is required for document change votes', null, 'MISSING_TARGET_DOCUMENT');
  }

  if (voteType === 'document_change' && targetDocumentId) {
    const existingVote = await TransactionManager.query(db, `
      SELECT id, title, status FROM organization_votes
      WHERE organization_id = ? AND vote_type = 'document_change' AND target_document_id = ?
      AND status IN ('proposed', 'approved')
      LIMIT 1
    `, [organizationId, targetDocumentId]);
    if (existingVote) {
      throw ApiError.validation(
        'An amendment request is already pending for this document. Wait for the current vote to complete before requesting another.',
        { existingVoteId: existingVote.id, status: existingVote.status },
        'DUPLICATE_AMENDMENT_REQUEST'
      );
    }
  }

  if (voteType === 'document_change') {
    const member = await isActiveMember(db, userId, organizationId);
    if (!member) throw ApiError.forbidden('You must be an active member to request amendments', 'NOT_ACTIVE_MEMBER');
  } else {
    const isRep = await isRepresentative(db, userId, organizationId);
    if (!isRep) throw ApiError.forbidden('Only representatives can create votes', 'NOT_REPRESENTATIVE');
  }

  const org = await TransactionManager.query(db,
    'SELECT voting_enabled, voting_threshold FROM organizations WHERE id = ?',
    [organizationId]
  );
  const votingEnabled = org?.voting_enabled === true || org?.voting_enabled === true;
  if (!org || !votingEnabled) {
    throw ApiError.forbidden('Voting is not enabled for this organization', 'VOTING_NOT_ENABLED');
  }

  const voteId = uuidv4();
  const rawThreshold = org.voting_threshold ?? 0.5;
  const threshold = rawThreshold <= 1 ? rawThreshold * 100 : rawThreshold;

  let votingStartsAt = null;
  let votingEndsAt = null;
  if (votingStartDate) {
    votingStartsAt = new Date(votingStartDate);
    if (isNaN(votingStartsAt.getTime())) throw ApiError.validation('Invalid voting start date', null, 'INVALID_VOTING_START_DATE');
  }
  if (votingEndDate) {
    votingEndsAt = new Date(votingEndDate);
    if (isNaN(votingEndsAt.getTime())) throw ApiError.validation('Invalid voting end date', null, 'INVALID_VOTING_END_DATE');
    if (votingStartsAt && votingEndsAt <= votingStartsAt) {
      throw ApiError.validation('Voting end date must be after start date', null, 'INVALID_VOTING_DATE_RANGE');
    }
  }

  await TransactionManager.execute(db, `INSERT INTO organization_votes (
    id, organization_id, title, description, vote_type, proposed_by_user_id,
    threshold, status, voting_starts_at, voting_ends_at, target_document_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?, ?)`, [
    voteId, organizationId, title.trim(), description || null, voteType, userId, threshold,
    votingStartsAt ? votingStartsAt.toISOString() : null,
    votingEndsAt ? votingEndsAt.toISOString() : null,
    targetDocumentId || null
  ]);

  await logAudit(db, organizationId, 'vote_proposed', userId, null, { voteType, title }, req);
  return {
    vote: {
      id: voteId,
      organizationId,
      title,
      description,
      voteType,
      proposedBy: userId,
      threshold,
      status: 'proposed',
      votingStartsAt: votingStartsAt ? votingStartsAt.toISOString() : null,
      votingEndsAt: votingEndsAt ? votingEndsAt.toISOString() : null,
      createdAt: new Date().toISOString()
    }
  };
}

/**
 * Approve organization vote (representatives only).
 * @param {Object} db
 * @param {string} organizationId
 * @param {string} voteId
 * @param {string} userId
 * @param {Object} req
 * @returns {Promise<{ success: boolean }>}
 */
async function approveVote(db, organizationId, voteId, userId, req) {
  const isRep = await isRepresentative(db, userId, organizationId);
  if (!isRep) throw ApiError.forbidden('Only representatives can approve votes', 'NOT_REPRESENTATIVE');

  const result = await TransactionManager.execute(db, `UPDATE organization_votes SET
    approved_by_rep_id = ?, status = 'approved', voting_starts_at = ?
    WHERE id = ? AND organization_id = ? AND status = 'proposed'`, [
    userId, new Date().toISOString(), voteId, organizationId
  ]);

  if (result.changes === 0) {
    throw ApiError.notFound('Vote', 'VOTE_NOT_FOUND_OR_ALREADY_APPROVED');
  }

  await logAudit(db, organizationId, 'vote_approved', userId, null, { voteId }, req);
  return { success: true };
}

/**
 * Decline organization vote (representatives only). Sends rejection email to proposer.
 * @param {Object} db
 * @param {string} organizationId
 * @param {string} voteId
 * @param {string} userId
 * @param {Object} body - { reason }
 * @param {Object} req
 * @returns {Promise<{ success: boolean }>}
 */
async function declineVote(db, organizationId, voteId, userId, body, req) {
  const isRep = await isRepresentative(db, userId, organizationId);
  if (!isRep) throw ApiError.forbidden('Only representatives can decline votes', 'NOT_REPRESENTATIVE');

  const vote = await TransactionManager.query(db, `
    SELECT id, title, proposed_by_user_id FROM organization_votes
    WHERE id = ? AND organization_id = ? AND status = 'proposed'
  `, [voteId, organizationId]);

  if (!vote) throw ApiError.notFound('Vote', 'VOTE_NOT_FOUND_OR_ALREADY_PROCESSED');

  const reason = (body.reason || '').trim();
  const result = await TransactionManager.execute(db, `UPDATE organization_votes SET
    status = 'cancelled', rejected_by_rep_id = ?, rejection_reason = ?, rejected_at = ?
    WHERE id = ? AND organization_id = ? AND status = 'proposed'`, [
    userId, reason, new Date().toISOString(), voteId, organizationId
  ]);

  if (result.changes === 0) throw ApiError.notFound('Vote', 'VOTE_NOT_FOUND_OR_ALREADY_PROCESSED');

  await logAudit(db, organizationId, 'vote_declined', userId, null, { voteId, reason: reason?.substring?.(0, 200) }, req);

  const proposer = await TransactionManager.query(db, 'SELECT id, name, email FROM users WHERE id = ?', [vote.proposed_by_user_id]);
  const repUser = await TransactionManager.query(db, 'SELECT name FROM users WHERE id = ?', [userId]);
  if (proposer?.email) {
    sendRepresentativeRejectionEmail({
      toEmail: proposer.email,
      proposerName: proposer.name || 'Member',
      representativeName: repUser?.name || 'Representative',
      itemTitle: vote.title,
      itemType: 'organization_vote',
      reason
    }).catch((emailErr) => {
      logger.error('Failed to send vote decline email', {
        error: emailErr.message,
        voteId,
        proposerId: vote.proposed_by_user_id,
      });
    });
  }

  const webSocketManager = require('../modules/websocket');
  webSocketManager.broadcastOrganizationUpdate(organizationId, 'vote-declined', { voteId, organizationId });

  return { success: true };
}

/**
 * Cast vote in organization vote. Uses vote lock; throws on invalid choice or already voted.
 * @param {Object} db
 * @param {string} organizationId
 * @param {string} voteId
 * @param {string} userId
 * @param {Object} body - { choice: 'yes'|'no'|'abstain' }
 * @param {Object} req
 * @returns {Promise<{ success: boolean, ballotId, receiptId, contestId, voteType, voteRecordedAt }>}
 */
async function castOrganizationVote(db, organizationId, voteId, userId, body, req) {
  const isActive = await isActiveMember(db, userId, organizationId);
  if (!isActive) throw ApiError.forbidden('Only active members can vote', 'NOT_ACTIVE_MEMBER');

  const choice = body.choice;
  let ballotId;
  let voteRecordedAt;

  await votingLockManager.withVoteLock('organization_vote', voteId, async () => {
    const vote = await TransactionManager.query(db, `
      SELECT id, organization_id, title, description, vote_type, proposed_by_user_id, 
        approved_by_rep_id, threshold, status, voting_starts_at, voting_ends_at, 
        target_document_id, result_yes, result_no, result_abstain, created_at
      FROM organization_votes
      WHERE id = ? AND organization_id = ? AND status = 'approved'
    `, [voteId, organizationId]);

    if (!vote) throw ApiError.notFound('Vote', 'VOTE_NOT_FOUND_OR_NOT_ACTIVE');

    const existing = await TransactionManager.query(db,
      'SELECT id FROM vote_ballots WHERE vote_id = ? AND user_id = ?',
      [voteId, userId]
    );
    if (existing) throw ApiError.validation('Already voted', null, 'ALREADY_VOTED');

    const allowedCountFields = ['result_yes', 'result_no', 'result_abstain'];
    const countFieldMap = { yes: 'result_yes', no: 'result_no', abstain: 'result_abstain' };
    const countField = countFieldMap[choice];
    if (!countField || !allowedCountFields.includes(countField)) {
      logger.error('Invalid vote choice for count field', { choice, voteId, userId });
      throw ApiError.validation('Invalid vote choice', null, 'INVALID_VOTE_CHOICE');
    }
    validateFieldNames([countField], allowedCountFields);

    ballotId = uuidv4();
    voteRecordedAt = new Date().toISOString();
    const voteHash = computeVoteHash('organization', {
      contestId: voteId,
      userId,
      choice,
      timestamp: voteRecordedAt,
      receiptId: ballotId
    });
    await TransactionManager.executeInTransaction(db, async (txDb) => {
      await TransactionManager.execute(txDb, `
        INSERT INTO vote_ballots (id, vote_id, user_id, membership_status, vote_choice, receipt_id, vote_hash)
        VALUES (?, ?, ?, 'active', ?, ?, ?)
      `, [ballotId, voteId, userId, choice, ballotId, voteHash]);
      await TransactionManager.execute(txDb, `
        UPDATE organization_votes SET ${countField} = ${countField} + 1 WHERE id = ?
      `, [voteId]);
      await voteVerificationLog.appendLogEntry(txDb, {
        voteType: 'organization',
        contestId: voteId,
        choice,
        timestamp: voteRecordedAt,
        receiptId: ballotId,
        voteHash
      });
    });
  });

  UnifiedVotingService.invalidateCache(organizationId, 'organization', voteId);

  const allBallots = await TransactionManager.queryAll(db, `
    SELECT vb.id, vb.vote_id, vb.user_id, vb.vote_choice, vb.created_at,
           u.name as user_name, u.email as user_email
    FROM vote_ballots vb
    LEFT JOIN users u ON vb.user_id = u.id
    WHERE vb.vote_id = ?
    ORDER BY vb.created_at ASC
  `, [voteId]);

  const normalizedVotes = allBallots.map(b => ({
    id: b.id,
    user_id: b.user_id,
    vote: b.vote_choice === 'yes' ? 'PRO' : b.vote_choice === 'no' ? 'CONTRA' : 'NEUTRAL',
    created_at: b.created_at,
    user_name: b.user_name,
    user_email: b.user_email
  }));
  const isAnonymous = false;
  const formattedVotes = UnifiedVotingService.formatVotesForResponse(normalizedVotes, isAnonymous, userId);

  try {
    const webSocketManager = require('../modules/websocket');
    webSocketManager.broadcastOrganizationUpdate(organizationId, 'organization-vote-cast', {
      organizationId,
      voteId,
      userId,
      vote: choice,
      action: 'cast',
      allVotes: formattedVotes,
      isAnonymous
    });
  } catch (wsError) {
    logger.warn('Failed to broadcast organization vote update', { error: wsError.message, voteId, organizationId });
  }

  return {
    success: true,
    ballotId,
    receiptId: ballotId,
    contestId: voteId,
    voteType: 'organization',
    voteRecordedAt
  };
}

/**
 * Complete organization vote. Representative only; applies quorum/threshold; may remove rep or open amendments.
 * @param {Object} db
 * @param {string} organizationId
 * @param {string} voteId
 * @param {string} userId
 * @param {Object} req
 * @returns {Promise<{ success: boolean, vote: Object }>}
 */
async function completeOrganizationVote(db, organizationId, voteId, userId, req) {
  const isRep = await isRepresentative(db, userId, organizationId);
  if (!isRep) throw ApiError.forbidden('Only representatives can complete votes', 'NOT_REPRESENTATIVE');

  const vote = await TransactionManager.query(db, `SELECT id, organization_id, title, description, vote_type, proposed_by_user_id, 
    approved_by_rep_id, threshold, status, voting_starts_at, voting_ends_at, 
    target_document_id, result_yes, result_no, result_abstain, created_at
    FROM organization_votes
    WHERE id = ? AND organization_id = ? AND status = 'approved'`, [voteId, organizationId]);

  if (!vote) throw ApiError.notFound('Vote', 'VOTE_NOT_FOUND_OR_NOT_APPROVED');

  const totalYes = vote.result_yes || 0;
  const totalNo = vote.result_no || 0;
  const totalAbstain = vote.result_abstain || 0;
  const totalVotes = totalYes + totalNo + totalAbstain;
  if (totalVotes === 0) {
    throw ApiError.validation('No votes have been cast yet', null, 'NO_VOTES_CAST');
  }

  const rules = await TransactionManager.query(db, `SELECT default_acceptance_threshold, default_quorum_percentage, 
    mistrust_vote_quorum_percentage, bootstrap_mode
    FROM organization_governance_rules WHERE organization_id = ?`, [organizationId]);
  const memberCountResult = await TransactionManager.query(db,
    `SELECT COUNT(*) as count FROM organization_members 
    WHERE organization_id = ? AND status = 'active'`,
    [organizationId]
  );
  const memberCount = memberCountResult ? memberCountResult.count : 0;

  const approvalRate = (totalYes / totalVotes) * 100;
  const rawThreshold = vote.threshold ?? (rules?.default_acceptance_threshold ?? 75.0);
  const threshold = rawThreshold <= 1 ? rawThreshold * 100 : rawThreshold;
  const quorumPercentage = vote.vote_type === 'representative_removal'
    ? (rules?.mistrust_vote_quorum_percentage || 0.5)
    : (rules?.default_quorum_percentage || 0.5);
  const quorumRequired = Math.ceil(memberCount * quorumPercentage);
  const quorumMet = totalVotes >= quorumRequired;
  const approvalMet = approvalRate >= threshold;

  if (!quorumMet) {
    throw ApiError.validation(
      'Participation threshold must be met before completing the vote',
      null,
      'PARTICIPATION_THRESHOLD_NOT_MET'
    );
  }

  const passed = quorumMet && approvalMet;
  const newStatus = passed ? 'passed' : 'failed';
  await TransactionManager.execute(db, `UPDATE organization_votes SET status = ? WHERE id = ?`, [newStatus, voteId]);

  const webSocketManager = require('../modules/websocket');

  if (vote.vote_type === 'representative_removal' && passed) {
    try {
      const voteDescription = JSON.parse(vote.description || '{}');
      const targetRepId = voteDescription.targetRepresentativeId;

      if (targetRepId) {
        const repCountResult = await TransactionManager.query(db,
          'SELECT COUNT(*) as count FROM organization_representatives WHERE organization_id = ? AND status = ?',
          [organizationId, 'active']
        );
        const repCount = repCountResult ? repCountResult.count : 0;

        if (repCount <= 1) {
          await TransactionManager.execute(db, `UPDATE organization_votes SET status = 'failed' WHERE id = ?`, [voteId]);
          throw ApiError.validation('Cannot remove last representative', {
            details: 'Removing this representative would leave the organization with no representatives'
          }, 'CANNOT_REMOVE_LAST_REP');
        }

        const isBootstrapMode = rules?.bootstrap_mode === true || rules?.bootstrap_mode === true;
        if (isBootstrapMode && repCount <= 1) {
          await TransactionManager.execute(db, `UPDATE organization_votes SET status = 'failed' WHERE id = ?`, [voteId]);
          throw ApiError.validation('Cannot remove last representative during bootstrap mode', null, 'BOOTSTRAP_LAST_REP');
        }

        await TransactionManager.executeInTransaction(db, async (txDb) => {
          await TransactionManager.execute(txDb, `UPDATE organization_representatives 
            SET status = 'removed', removed_at = CURRENT_TIMESTAMP 
            WHERE organization_id = ? AND user_id = ? AND status = 'active'`,
            [organizationId, targetRepId]);
          await logAudit(txDb, organizationId, 'rep_removed_via_mistrust_vote', userId, targetRepId, {
            voteId,
            approvalRate,
            totalVotes,
            quorumMet
          }, req);
        });

        webSocketManager.broadcastOrganizationUpdate(organizationId, 'representative-removed', {
          organizationId,
          removedRepresentativeId: targetRepId,
          voteId
        });
      }
    } catch (parseError) {
      if (parseError instanceof ApiError) throw parseError;
      logger.error('Error processing mistrust vote removal', {
        error: parseError.message,
        voteId,
        organizationId
      });
    }
  }

  if (vote.vote_type === 'document_change' && passed && vote.target_document_id) {
    try {
      const DocumentStatusManager = require('../modules/document-status');
      await TransactionManager.execute(db, `
        UPDATE documents SET amendments_open = 1, amendments_opened_at = CURRENT_TIMESTAMP,
          amendments_closed_at = NULL, amendment_adoption_vote_id = NULL, amendment_snapshot_json = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [vote.target_document_id]);
      await DocumentStatusManager.logStatusChange(db, vote.target_document_id, 'agreed', 'agreed', userId, 'amendments_opened');
      webSocketManager.broadcastDocumentUpdate(vote.target_document_id, 'document-updated', { amendmentsOpen: true });
      webSocketManager.broadcastOrganizationUpdate(organizationId, 'document-updated', {
        documentId: vote.target_document_id,
        amendmentsOpen: true
      });
    } catch (amendError) {
      logger.error('Error opening document for amendments', {
        error: amendError.message,
        voteId,
        targetDocumentId: vote.target_document_id
      });
    }
  }

  if (vote.vote_type === 'document_amendment_adoption' && vote.target_document_id) {
    const DocumentStatusManager = require('../modules/document-status');
    const AmendmentSnapshotService = require('./AmendmentSnapshotService');
    const doc = await TransactionManager.query(db,
      'SELECT id, amendment_snapshot_json, amendment_adoption_vote_id FROM documents WHERE id = ?',
      [vote.target_document_id]
    );
    if (passed && doc?.amendment_snapshot_json) {
      try {
        await AmendmentSnapshotService.applySnapshot(db, vote.target_document_id, doc.amendment_snapshot_json);
        await TransactionManager.execute(db, `
          UPDATE documents SET amendment_adoption_vote_id = NULL, amendment_snapshot_json = NULL,
            amendments_closed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [vote.target_document_id]);
        await DocumentStatusManager.logStatusChange(db, vote.target_document_id, 'agreed', 'agreed', userId, 'amendment_adopted');
        webSocketManager.broadcastDocumentUpdate(vote.target_document_id, 'document-updated', {
          amendmentsOpen: false,
          amendmentAdoptionVoteId: null,
        });
      } catch (applyErr) {
        logger.error('Error applying amendment snapshot', {
          error: applyErr.message,
          voteId,
          documentId: vote.target_document_id
        });
      }
    } else if (!passed) {
      try {
        await AmendmentSnapshotService.clearCandidates(db, vote.target_document_id);
        await TransactionManager.execute(db, `
          UPDATE documents SET amendment_adoption_vote_id = NULL, amendment_snapshot_json = NULL,
            amendments_closed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [vote.target_document_id]);
        await DocumentStatusManager.logStatusChange(db, vote.target_document_id, 'agreed', 'agreed', userId, 'amendment_adoption_rejected');
        webSocketManager.broadcastDocumentUpdate(vote.target_document_id, 'document-updated', {
          amendmentAdoptionVoteId: null,
        });
      } catch (rejectErr) {
        logger.error('Error clearing amendment adoption after failed vote', {
          error: rejectErr.message,
          voteId,
          documentId: vote.target_document_id
        });
      }
    }
  }

  await logAudit(db, organizationId, 'vote_completed', userId, null, {
    voteId,
    voteType: vote.vote_type,
    status: newStatus,
    approvalRate,
    totalVotes,
    quorumMet
  }, req);

  webSocketManager.broadcastOrganizationUpdate(organizationId, 'organization-vote-completed', {
    organizationId,
    voteId,
    status: newStatus,
    voteType: vote.vote_type
  });

  return {
    success: true,
    vote: {
      id: voteId,
      status: newStatus,
      approvalRate,
      totalVotes,
      quorumMet,
      approvalMet,
      passed
    }
  };
}

module.exports = OrganizationService;
module.exports.getOrganizationsForUser = getOrganizationsForUser;
module.exports.getOrganizationsForUserFallback = getOrganizationsForUserFallback;
module.exports.getOrganizationWithMembers = getOrganizationWithMembers;
module.exports.inviteMembers = inviteMembers;
module.exports.addMember = addMember;
module.exports.removeMember = removeMember;
module.exports.leaveOrganization = leaveOrganization;
module.exports.checkOrganizationHasDocuments = checkOrganizationHasDocuments;
module.exports.deleteOrganizationHard = deleteOrganizationHard;
module.exports.checkDataConsistency = checkDataConsistency;
module.exports.logAudit = logAudit;
module.exports.acceptInvitationByToken = acceptInvitationByToken;
module.exports.acceptInvitationById = acceptInvitationById;
module.exports.addRepresentative = addRepresentative;
module.exports.updateOrganizationSettings = updateOrganizationSettings;
module.exports.setOverviewPin = setOverviewPin;
module.exports.createOrganization = createOrganization;
module.exports.validateInvitationToken = validateInvitationToken;
module.exports.declineInvitationByToken = declineInvitationByToken;
module.exports.getPendingInvitationsForUser = getPendingInvitationsForUser;
module.exports.declineInvitationById = declineInvitationById;
module.exports.getOrganizationInvitations = getOrganizationInvitations;
module.exports.resendInvitation = resendInvitation;
module.exports.listOrganizationVotes = listOrganizationVotes;
module.exports.createOrganizationVote = createOrganizationVote;
module.exports.approveVote = approveVote;
module.exports.declineVote = declineVote;
module.exports.castOrganizationVote = castOrganizationVote;
module.exports.completeOrganizationVote = completeOrganizationVote;
