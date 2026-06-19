'use strict';

const TransactionManager = require('../database/services/TransactionManager');
const { ApiError } = require('../middleware/errorHandler');
const { safeJsonParse, safeJsonStringify } = require('../utils/jsonUtils');
const { isRepresentative } = require('../modules/permissions');
const { getDirectChildren } = require('./participationGraphSubgroups');

async function getParticipationGraph(db, orgId, userId) {
  const org = await TransactionManager.query(db, 'SELECT id, name, graph_layout_json, participation_graph_root_id FROM organizations WHERE id = ?', [orgId]);
  if (!org) throw ApiError.notFound('Organization');
  const { children } = await getDirectChildren(db, orgId, userId);
  const edges = await TransactionManager.queryAll(
    db,
    `SELECT id, source_org_id, target_org_id, relationship_type, config_json
     FROM organization_relationships
     WHERE (source_org_id = ? OR target_org_id = ?) AND status = 'active'`,
    [orgId, orgId]
  );
  const layout = org.graph_layout_json ? safeJsonParse(org.graph_layout_json, {}) : {};
  return {
    rootOrgId: org.participation_graph_root_id || orgId,
    nodes: [{ id: org.id, name: org.name, kind: 'root' }, ...children.map((c) => ({ id: c.id, name: c.name, kind: 'child' }))],
    edges: edges.map((e) => ({
      id: e.id,
      sourceOrgId: e.source_org_id,
      targetOrgId: e.target_org_id,
      relationshipType: e.relationship_type,
      config: e.config_json,
    })),
    layout,
  };
}

async function saveGraphLayout(db, orgId, userId, layoutJson) {
  const isRep = await isRepresentative(db, userId, orgId);
  if (!isRep) throw ApiError.forbidden('Only representatives can save graph layout', 'NOT_REPRESENTATIVE');
  await TransactionManager.execute(
    db,
    'UPDATE organizations SET graph_layout_json = ? WHERE id = ?',
    [safeJsonStringify(layoutJson), orgId]
  );
  return { success: true };
}

module.exports = {
  getParticipationGraph,
  saveGraphLayout,
};
