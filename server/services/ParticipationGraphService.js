'use strict';

const { v4: uuidv4 } = require('uuid');
const TransactionManager = require('../database/services/TransactionManager');
const { ApiError } = require('../middleware/errorHandler');
const { safeJsonStringify } = require('../utils/jsonUtils');

const ORG_TREE_COLUMNS = `
  id, name, primary_parent_id, org_kind, participation_profile,
  tree_depth, tree_path, participation_graph_root_id, is_active
`;

function mapTreeNode(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    primaryParentId: row.primary_parent_id || null,
    orgKind: row.org_kind || 'standard',
    participationProfile: row.participation_profile || 'classical_committee',
    treeDepth: row.tree_depth ?? 0,
    treePath: row.tree_path || `/${row.id}`,
    participationGraphRootId: row.participation_graph_root_id || row.id,
  };
}

function computeTreePath(parentPath, orgId) {
  const base = parentPath && parentPath.length > 0 ? parentPath.replace(/\/$/, '') : '';
  return `${base}/${orgId}`;
}

function parseAncestorIdsFromPath(treePath, excludeOrgId) {
  if (!treePath || typeof treePath !== 'string') return [];
  const segments = treePath.split('/').filter(Boolean);
  if (excludeOrgId) {
    const idx = segments.lastIndexOf(excludeOrgId);
    return idx > 0 ? segments.slice(0, idx) : [];
  }
  return segments.slice(0, -1);
}

async function getOrgTreeRow(db, orgId) {
  return TransactionManager.query(
    db,
    `SELECT ${ORG_TREE_COLUMNS} FROM organizations WHERE id = ? AND is_active = true`,
    [orgId]
  );
}

async function validateNoCycle(db, orgId, newParentId) {
  if (!newParentId) return;
  if (newParentId === orgId) {
    throw ApiError.validation('Organization cannot be its own parent', null, 'CYCLE_DETECTED');
  }

  let currentId = newParentId;
  const visited = new Set();
  while (currentId) {
    if (currentId === orgId) {
      throw ApiError.validation('Reparenting would create a cycle', null, 'CYCLE_DETECTED');
    }
    if (visited.has(currentId)) break;
    visited.add(currentId);
    const row = await TransactionManager.query(
      db,
      'SELECT primary_parent_id FROM organizations WHERE id = ?',
      [currentId]
    );
    currentId = row?.primary_parent_id || null;
  }
}

async function getAncestors(db, orgId) {
  const org = await getOrgTreeRow(db, orgId);
  if (!org) throw ApiError.notFound('Organization');

  const ancestorIds = parseAncestorIdsFromPath(org.tree_path, orgId);
  if (ancestorIds.length === 0) {
    return { ancestors: [] };
  }

  const placeholders = ancestorIds.map(() => '?').join(',');
  const rows = await TransactionManager.queryAll(
    db,
    `SELECT id, name, tree_depth FROM organizations WHERE id IN (${placeholders}) AND is_active = true`,
    ancestorIds
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ancestors = ancestorIds
    .map((id, index) => {
      const row = byId.get(id);
      if (!row) return null;
      return { id: row.id, name: row.name, treeDepth: row.tree_depth ?? index };
    })
    .filter(Boolean);

  return { ancestors };
}

async function getTreeForUser(db, orgId) {
  const org = await getOrgTreeRow(db, orgId);
  if (!org) throw ApiError.notFound('Organization');

  const rootId = org.participation_graph_root_id || orgId;
  const rows = await TransactionManager.queryAll(
    db,
    `SELECT id, name, primary_parent_id, tree_depth, participation_profile, org_kind
     FROM organizations
     WHERE participation_graph_root_id = ? AND is_active = true
     ORDER BY tree_depth ASC, name ASC`,
    [rootId]
  );

  return {
    nodes: rows.map((row) => ({
      id: row.id,
      name: row.name,
      primaryParentId: row.primary_parent_id || null,
      treeDepth: row.tree_depth ?? 0,
      participationProfile: row.participation_profile || 'classical_committee',
      orgKind: row.org_kind || 'standard',
    })),
  };
}

async function recomputeTreePathSubtree(db, orgId) {
  const root = await getOrgTreeRow(db, orgId);
  if (!root) return;

  const queue = [{ id: orgId, treePath: root.tree_path, treeDepth: root.tree_depth, rootId: root.participation_graph_root_id }];
  while (queue.length > 0) {
    const current = queue.shift();
    const children = await TransactionManager.queryAll(
      db,
      'SELECT id FROM organizations WHERE primary_parent_id = ? AND is_active = true',
      [current.id]
    );

    for (const child of children) {
      const childPath = computeTreePath(current.treePath, child.id);
      const childDepth = current.treeDepth + 1;
      await TransactionManager.execute(
        db,
        `UPDATE organizations
         SET tree_path = ?, tree_depth = ?, participation_graph_root_id = ?
         WHERE id = ?`,
        [childPath, childDepth, current.rootId, child.id]
      );
      queue.push({
        id: child.id,
        treePath: childPath,
        treeDepth: childDepth,
        rootId: current.rootId,
      });
    }
  }
}

async function upsertPrimaryParentRelationship(db, childOrgId, parentOrgId) {
  if (!parentOrgId) {
    await TransactionManager.execute(
      db,
      `UPDATE organization_relationships SET status = 'inactive'
       WHERE source_org_id = ? AND relationship_type = 'primary_parent' AND status = 'active'`,
      [childOrgId]
    );
    return;
  }

  const existing = await TransactionManager.query(
    db,
    `SELECT id FROM organization_relationships
     WHERE source_org_id = ? AND relationship_type = 'primary_parent' AND status = 'active'
     LIMIT 1`,
    [childOrgId]
  );

  if (existing) {
    await TransactionManager.execute(
      db,
      'UPDATE organization_relationships SET target_org_id = ?, config_json = ? WHERE id = ?',
      [parentOrgId, safeJsonStringify({}), existing.id]
    );
    return;
  }

  await TransactionManager.execute(
    db,
    `INSERT INTO organization_relationships
     (id, source_org_id, target_org_id, relationship_type, config_json, status, created_at)
     VALUES (?, ?, ?, 'primary_parent', ?, 'active', CURRENT_TIMESTAMP)`,
    [uuidv4(), childOrgId, parentOrgId, safeJsonStringify({})]
  );
}

async function setPrimaryParent(db, orgId, primaryParentId) {
  const org = await getOrgTreeRow(db, orgId);
  if (!org) throw ApiError.notFound('Organization');

  await validateNoCycle(db, orgId, primaryParentId);

  let treePath;
  let treeDepth;
  let rootId;

  if (!primaryParentId) {
    treePath = `/${orgId}`;
    treeDepth = 0;
    rootId = orgId;
  } else {
    const parent = await getOrgTreeRow(db, primaryParentId);
    if (!parent) throw ApiError.notFound('Parent organization');
    treePath = computeTreePath(parent.tree_path || `/${primaryParentId}`, orgId);
    treeDepth = (parent.tree_depth ?? 0) + 1;
    rootId = parent.participation_graph_root_id || primaryParentId;
  }

  await TransactionManager.executeInTransaction(db, async (trx) => {
    await TransactionManager.execute(
      trx,
      `UPDATE organizations
       SET primary_parent_id = ?, tree_path = ?, tree_depth = ?, participation_graph_root_id = ?
       WHERE id = ?`,
      [primaryParentId, treePath, treeDepth, rootId, orgId]
    );
    await upsertPrimaryParentRelationship(trx, orgId, primaryParentId);
  });

  await recomputeTreePathSubtree(db, orgId);

  const updated = await getOrgTreeRow(db, orgId);
  return { organization: mapTreeNode(updated) };
}

function initializeRootOrgFields(orgId, options = {}) {
  const template = options.template || 'classical_cooperative';
  const templates = require('../../docs/rfc/participation-graph-templates.json').templates || {};
  const preset = templates[template] || templates.classical_cooperative || {};
  return {
    primary_parent_id: null,
    org_kind: preset.defaultOrgKind || 'standard',
    participation_profile: preset.defaultSubgroupProfile || 'classical_committee',
    tree_depth: 0,
    tree_path: `/${orgId}`,
    participation_graph_root_id: orgId,
    participationTemplate: template,
    governanceDefaults: preset.rootGovernanceDefaults || {},
  };
}

const participationGraphSubgroups = require('./participationGraphSubgroups');
const participationGraphFederation = require('./participationGraphFederation');
const participationGraphNetworks = require('./participationGraphNetworks');
const participationGraphMatrix = require('./participationGraphMatrix');

module.exports = {
  ...participationGraphSubgroups,
  ...participationGraphFederation,
  ...participationGraphNetworks,
  ...participationGraphMatrix,
  mapTreeNode,
  computeTreePath,
  parseAncestorIdsFromPath,
  validateNoCycle,
  getAncestors,
  getTreeForUser,
  recomputeTreePathSubtree,
  setPrimaryParent,
  initializeRootOrgFields,
};
