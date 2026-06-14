/**
 * Contest access checks for vote verification and ballot export routes.
 */

const TransactionManager = require('../database/services/TransactionManager');
const { buildAccessCheck } = require('./documentQueries');
const { resolveContest } = require('./ballotExport');
const { getUserOrganizationStatus } = require('./permissionUtils');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Resolve documentId / organizationId from resolveContest result (handles snake_case variants).
 * @param {Object|null} resolved
 * @returns {{ documentId?: string, organizationId?: string }}
 */
function normalizeResolvedContest(resolved) {
  if (!resolved) return {};
  return {
    documentId: resolved.documentId ?? resolved.document_id ?? null,
    organizationId: resolved.organizationId ?? resolved.organization_id ?? null
  };
}

/**
 * Verify the user can access a document-scoped contest.
 * @throws {ApiError}
 */
async function assertDocumentContestAccess(db, userId, documentId) {
  const row = await TransactionManager.query(db, `
    SELECT d.id
    FROM documents d
    LEFT JOIN document_collaborators dc ON d.id = dc.document_id AND dc.user_id = ?
    LEFT JOIN organization_members om ON d.organization_id = om.organization_id AND om.user_id = ? AND om.status = 'active'
    LEFT JOIN organizations o ON d.organization_id = o.id AND o.is_active = true
    WHERE d.id = ?
      AND ${buildAccessCheck('d')}
  `, [userId, userId, documentId, userId, userId]);

  if (!row) {
    throw ApiError.forbidden('Access denied to this document', 'DOCUMENT_ACCESS_DENIED');
  }
}

/**
 * Verify the user can access an organization-scoped contest.
 * @throws {ApiError}
 */
async function assertOrganizationContestAccess(db, userId, organizationId, userRole = null) {
  const status = await getUserOrganizationStatus(db, userId, organizationId, userRole);
  const hasAccess = status.isRepresentative || status.isActiveMember || status.isAdmin;
  if (!hasAccess) {
    throw ApiError.forbidden(
      'You must be a member of this organization to access this area',
      'MEMBERSHIP_REQUIRED'
    );
  }
}

/**
 * Verify the user can access a vote contest by voteType and contestId.
 * @throws {ApiError}
 */
async function assertContestAccess(db, userId, voteType, contestId, userRole = null) {
  const resolved = await resolveContest(db, voteType, contestId);
  if (!resolved) {
    throw ApiError.notFound('Contest', 'CONTEST_NOT_FOUND');
  }

  const { documentId, organizationId } = normalizeResolvedContest(resolved);

  if (documentId) {
    await assertDocumentContestAccess(db, userId, documentId);
    return;
  }

  if (organizationId) {
    await assertOrganizationContestAccess(db, userId, organizationId, userRole);
    return;
  }

  throw ApiError.forbidden('Access denied to this contest', 'CONTEST_ACCESS_DENIED');
}

/**
 * Fetch contest IDs belonging to an organization (org votes + election sessions).
 * @returns {Promise<string[]>}
 */
async function getOrganizationContestIds(db, organizationId) {
  const orgVotes = await TransactionManager.queryAll(db,
    'SELECT id FROM organization_votes WHERE organization_id = ?',
    [organizationId]
  );
  const sessions = await TransactionManager.queryAll(db,
    'SELECT id FROM voting_sessions WHERE organization_id = ?',
    [organizationId]
  );
  const elections = await TransactionManager.queryAll(db,
    'SELECT id FROM representative_elections WHERE organization_id = ?',
    [organizationId]
  );
  const ruleProposals = await TransactionManager.queryAll(db,
    'SELECT id FROM governance_rule_proposals WHERE organization_id = ?',
    [organizationId]
  );
  const meetingVotes = await TransactionManager.queryAll(db, `
    SELECT mv.id FROM meeting_votes mv
    JOIN meetings m ON m.id = mv.meeting_id
    WHERE m.organization_id = ?
  `, [organizationId]);
  return [
    ...(orgVotes || []).map(r => r.id),
    ...(sessions || []).map(r => r.id),
    ...(elections || []).map(r => r.id),
    ...(ruleProposals || []).map(r => r.id),
    ...(meetingVotes || []).map(r => r.id)
  ];
}

module.exports = {
  normalizeResolvedContest,
  assertDocumentContestAccess,
  assertOrganizationContestAccess,
  assertContestAccess,
  getOrganizationContestIds
};
