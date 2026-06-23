'use strict';

const { v4: uuidv4 } = require('uuid');
const TransactionManager = require('../database/services/TransactionManager');
const { ApiError } = require('../middleware/errorHandler');
const { safeJsonStringify } = require('../utils/jsonUtils');
const { getProfile } = require('../config/participationGraphProfiles');
const { isRepresentative } = require('../modules/permissions');

const PARTICIPATION_KINDS = ['member', 'representative', 'lead_link', 'rep_link', 'liaison', 'observer'];

function mapParticipation(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id || null,
    subjectOrgId: row.subject_org_id || null,
    participationKind: row.participation_kind,
    grantedViaEdgeId: row.granted_via_edge_id || null,
    grantedViaOrgId: row.granted_via_org_id || null,
    status: row.status || 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getFederationGovernance(db, organizationId) {
  const row = await TransactionManager.query(
    db,
    `SELECT federation_electorate_mode, participation_graph_enabled
     FROM organization_governance_rules WHERE organization_id = ?`,
    [organizationId]
  );
  return {
    federationElectorateMode: row?.federation_electorate_mode || 'all_members',
    participationGraphEnabled: row?.participation_graph_enabled === true,
  };
}

async function listParticipations(db, organizationId, { kind = null } = {}) {
  let sql = `SELECT * FROM organization_participations WHERE organization_id = ? AND status = 'active'`;
  const params = [organizationId];
  if (kind) {
    sql += ' AND participation_kind = ?';
    params.push(kind);
  }
  sql += ' ORDER BY created_at ASC';
  const rows = await TransactionManager.queryAll(db, sql, params);
  return { participations: rows.map(mapParticipation) };
}

async function upsertParticipation(db, {
  organizationId,
  userId,
  participationKind,
  grantedViaEdgeId = null,
  grantedViaOrgId = null,
  subjectOrgId = null,
}) {
  if (!PARTICIPATION_KINDS.includes(participationKind)) {
    throw ApiError.validation('Invalid participation kind', null, 'INVALID_PARTICIPATION_KIND');
  }
  const existing = await TransactionManager.query(
    db,
    `SELECT id FROM organization_participations
     WHERE organization_id = ? AND user_id = ? AND participation_kind = ? AND status = 'active'`,
    [organizationId, userId, participationKind]
  );
  if (existing) return mapParticipation(await TransactionManager.query(db, 'SELECT * FROM organization_participations WHERE id = ?', [existing.id]));

  const id = uuidv4();
  await TransactionManager.execute(
    db,
    `INSERT INTO organization_participations
       (id, organization_id, user_id, subject_org_id, participation_kind, granted_via_edge_id, granted_via_org_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [id, organizationId, userId, subjectOrgId, participationKind, grantedViaEdgeId, grantedViaOrgId]
  );
  return mapParticipation(await TransactionManager.query(db, 'SELECT * FROM organization_participations WHERE id = ?', [id]));
}

async function createOrgMemberEdge(db, { apexOrgId, memberOrgId, voteId = null }) {
  const edgeId = uuidv4();
  await TransactionManager.execute(
    db,
    `INSERT INTO organization_relationships
       (id, source_org_id, target_org_id, relationship_type, membership_subject, config_json, status, created_by_vote_id, created_at)
     VALUES (?, ?, ?, 'participates_in', 'organization', ?, 'active', ?, CURRENT_TIMESTAMP)`,
    [edgeId, memberOrgId, apexOrgId, safeJsonStringify({ electorate: 'delegates_only' }), voteId]
  );
  return edgeId;
}

async function ensureFederationChapterLinks(db, { apexOrgId, chapterOrgId, creatorUserId, edgeId }) {
  await upsertParticipation(db, {
    organizationId: chapterOrgId,
    userId: creatorUserId,
    participationKind: 'lead_link',
    grantedViaEdgeId: edgeId,
    grantedViaOrgId: apexOrgId,
  });
  await upsertParticipation(db, {
    organizationId: apexOrgId,
    userId: creatorUserId,
    participationKind: 'rep_link',
    grantedViaEdgeId: edgeId,
    grantedViaOrgId: chapterOrgId,
  });
}

/**
 * Returns whether userId may cast ballots in organizationId org votes.
 */
async function canCastInOrganizationVote(db, organizationId, userId) {
  const gov = await getFederationGovernance(db, organizationId);
  if (gov.federationElectorateMode !== 'delegates_only') {
    return { allowed: true };
  }
  const delegate = await TransactionManager.query(
    db,
    `SELECT id FROM organization_participations
     WHERE organization_id = ? AND user_id = ? AND participation_kind = 'rep_link' AND status = 'active'`,
    [organizationId, userId]
  );
  if (delegate) return { allowed: true };
  const isRep = await isRepresentative(db, userId, organizationId);
  if (isRep) return { allowed: true };
  return { allowed: false, reason: 'Only chapter delegates may vote at federation apex' };
}

async function resolveElectorate(db, organizationId) {
  const gov = await getFederationGovernance(db, organizationId);
  if (gov.federationElectorateMode === 'delegates_only') {
    const rows = await TransactionManager.queryAll(
      db,
      `SELECT user_id FROM organization_participations
       WHERE organization_id = ? AND participation_kind = 'rep_link' AND status = 'active' AND user_id IS NOT NULL`,
      [organizationId]
    );
    return { mode: 'delegates_only', voterUserIds: rows.map((r) => r.user_id) };
  }
  return { mode: 'all_members', voterUserIds: null };
}

async function assignRepLink(db, organizationId, actingUserId, { userId, chapterOrgId }, req) {
  const isRep = await isRepresentative(db, actingUserId, organizationId);
  if (!isRep) throw ApiError.forbidden('Only representatives can assign delegate seats', 'NOT_REPRESENTATIVE');
  const edge = await TransactionManager.query(
    db,
    `SELECT id FROM organization_relationships
     WHERE source_org_id = ? AND target_org_id = ? AND relationship_type = 'participates_in' AND membership_subject = 'organization' AND status = 'active'`,
    [chapterOrgId, organizationId]
  );
  if (!edge) throw ApiError.notFound('Chapter org-member link not found');
  return upsertParticipation(db, {
    organizationId,
    userId,
    participationKind: 'rep_link',
    grantedViaEdgeId: edge.id,
    grantedViaOrgId: chapterOrgId,
  });
}

module.exports = {
  PARTICIPATION_KINDS,
  mapParticipation,
  getFederationGovernance,
  listParticipations,
  upsertParticipation,
  createOrgMemberEdge,
  ensureFederationChapterLinks,
  canCastInOrganizationVote,
  resolveElectorate,
  assignRepLink,
};
