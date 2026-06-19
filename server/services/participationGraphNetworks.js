'use strict';

const { v4: uuidv4 } = require('uuid');
const TransactionManager = require('../database/services/TransactionManager');
const { ApiError } = require('../middleware/errorHandler');
const { safeJsonStringify } = require('../utils/jsonUtils');
const { getProfile } = require('../config/participationGraphProfiles');
const { isRepresentative } = require('../modules/permissions');

async function assertNetworksEnabled(db, orgId) {
  const row = await TransactionManager.query(
    db,
    'SELECT networks_enabled FROM organization_governance_rules WHERE organization_id = ?',
    [orgId]
  );
  if (!row?.networks_enabled) {
    throw ApiError.forbidden('Networks are not enabled for this organization', 'NETWORKS_DISABLED');
  }
}

async function listAffiliates(db, orgId) {
  const rows = await TransactionManager.queryAll(
    db,
    `SELECT r.id, r.source_org_id, r.target_org_id, r.config_json, o.name AS affiliate_name
     FROM organization_relationships r
     JOIN organizations o ON o.id = r.source_org_id
     WHERE r.target_org_id = ? AND r.relationship_type = 'affiliate' AND r.status = 'active'
     ORDER BY o.name ASC`,
    [orgId]
  );
  return {
    affiliates: rows.map((r) => ({
      edgeId: r.id,
      affiliateOrgId: r.source_org_id,
      affiliateName: r.affiliate_name,
      config: r.config_json,
    })),
  };
}

async function createAffiliateEdge(db, networkOrgId, affiliateOrgId, userId, body = {}) {
  await assertNetworksEnabled(db, networkOrgId);
  const isRep = await isRepresentative(db, userId, networkOrgId);
  if (!isRep) throw ApiError.forbidden('Only representatives can add affiliates', 'NOT_REPRESENTATIVE');
  const edgeId = uuidv4();
  const config = safeJsonStringify(body.config || getProfile('network_affiliate'));
  await TransactionManager.execute(
    db,
    `INSERT INTO organization_relationships
       (id, source_org_id, target_org_id, relationship_type, membership_subject, config_json, status, created_at)
     VALUES (?, ?, ?, 'affiliate', 'organization', ?, 'active', CURRENT_TIMESTAMP)`,
    [edgeId, affiliateOrgId, networkOrgId, config]
  );
  return { edgeId, affiliateOrgId, networkOrgId };
}

module.exports = {
  assertNetworksEnabled,
  listAffiliates,
  createAffiliateEdge,
};
