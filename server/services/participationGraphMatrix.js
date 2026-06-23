'use strict';

const { v4: uuidv4 } = require('uuid');
const TransactionManager = require('../database/services/TransactionManager');
const { ApiError } = require('../middleware/errorHandler');
const { safeJsonStringify } = require('../utils/jsonUtils');
const { getProfile } = require('../config/participationGraphProfiles');
const { isRepresentative } = require('../modules/permissions');

async function assertMatrixEnabled(db, orgId) {
  const row = await TransactionManager.query(
    db,
    'SELECT matrix_links_enabled FROM organization_governance_rules WHERE organization_id = ?',
    [orgId]
  );
  if (!row?.matrix_links_enabled) {
    throw ApiError.forbidden('Matrix links are not enabled', 'MATRIX_DISABLED');
  }
}

async function createMatrixLink(db, projectOrgId, linkedOrgId, userId, body = {}) {
  await assertMatrixEnabled(db, projectOrgId);
  const isRep = await isRepresentative(db, userId, projectOrgId);
  if (!isRep) throw ApiError.forbidden('Only representatives can add matrix links', 'NOT_REPRESENTATIVE');
  const authority = body.authority || 'balanced';
  const config = safeJsonStringify({ ...(getProfile('matrix_project') || {}), authority });
  const edgeId = uuidv4();
  await TransactionManager.execute(
    db,
    `INSERT INTO organization_relationships
       (id, source_org_id, target_org_id, relationship_type, membership_subject, config_json, status, created_at)
     VALUES (?, ?, ?, 'matrix_link', 'organization', ?, 'active', CURRENT_TIMESTAMP)`,
    [edgeId, projectOrgId, linkedOrgId, config]
  );
  return { edgeId, projectOrgId, linkedOrgId, authority };
}

async function listMatrixLinks(db, orgId) {
  const rows = await TransactionManager.queryAll(
    db,
    `SELECT id, source_org_id, target_org_id, config_json FROM organization_relationships
     WHERE (source_org_id = ? OR target_org_id = ?) AND relationship_type = 'matrix_link' AND status = 'active'`,
    [orgId, orgId]
  );
  return { links: rows };
}

module.exports = {
  assertMatrixEnabled,
  createMatrixLink,
  listMatrixLinks,
};
