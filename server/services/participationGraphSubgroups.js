'use strict';


const { v4: uuidv4 } = require('uuid');
const TransactionManager = require('../database/services/TransactionManager');
const { ApiError } = require('../middleware/errorHandler');
const { safeJsonStringify, safeJsonParse } = require('../utils/jsonUtils');
const { getProfile } = require('../config/participationGraphProfiles');
const GovernanceRulesService = require('./governance/GovernanceRulesService');
const { logAudit } = require('../utils/auditLog');
const { isRepresentative, isActiveMember } = require('../modules/permissions');

const ORG_TREE_COLUMNS = `
  id, name, primary_parent_id, org_kind, participation_profile,
  tree_depth, tree_path, participation_graph_root_id, is_active, subgroup_visibility
`;

async function getOrgTreeRowLocal(db, orgId) {
  return TransactionManager.query(
    db,
    `SELECT ${ORG_TREE_COLUMNS} FROM organizations WHERE id = ? AND is_active = true`,
    [orgId]
  );
}

const SUBGROUP_VISIBILITY = ['open', 'closed', 'secret'];

function normalizeSubgroupVisibility(value, fallback = 'open') {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return SUBGROUP_VISIBILITY.includes(v) ? v : fallback;
}

function computeTreePath(parentPath, orgId) {
  const base = parentPath && parentPath.length > 0 ? parentPath.replace(/\/$/, '') : '';
  return `${base}/${orgId}`;
}

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
    subgroupVisibility: row.subgroup_visibility || 'open',
  };
}

async function getSubgroupGovernanceRules(db, organizationId) {
  const row = await TransactionManager.query(
    db,
    `SELECT participation_graph_enabled, subgroups_enabled, subgroup_creation_requires_vote,
      members_can_propose_subgroup_creation, max_subgroup_depth, default_subgroup_visibility,
      child_dissolution_policy
     FROM organization_governance_rules WHERE organization_id = ?`,
    [organizationId]
  );
  if (!row) return null;
  return {
    participationGraphEnabled: row.participation_graph_enabled === true,
    subgroupsEnabled: row.subgroups_enabled === true,
    subgroupCreationRequiresVote: row.subgroup_creation_requires_vote !== false,
    membersCanProposeSubgroupCreation: row.members_can_propose_subgroup_creation === true,
    maxSubgroupDepth: row.max_subgroup_depth ?? null,
    defaultSubgroupVisibility: row.default_subgroup_visibility || 'open',
    childDissolutionPolicy: row.child_dissolution_policy || 'independent',
  };
}

async function viewerCanSeeChild(db, viewerUserId, childOrgId, visibility) {
  if (visibility !== 'secret') return true;
  if (!viewerUserId) return false;
  return isActiveMember(db, viewerUserId, childOrgId);
}

async function getDirectChildren(db, orgId, viewerUserId = null) {
  const org = await getOrgTreeRowLocal(db, orgId);
  if (!org) throw ApiError.notFound('Organization');

  const rows = await TransactionManager.queryAll(
    db,
    `SELECT id, name, tree_depth, participation_profile, subgroup_visibility
     FROM organizations
     WHERE primary_parent_id = ? AND is_active = true
     ORDER BY name ASC`,
    [orgId]
  );

  const visibleRows = [];
  for (const row of rows) {
    const visibility = row.subgroup_visibility || 'open';
    if (await viewerCanSeeChild(db, viewerUserId, row.id, visibility)) {
      visibleRows.push(row);
    }
  }

  return {
    children: visibleRows.map((row) => ({
      id: row.id,
      name: row.name,
      treeDepth: row.tree_depth ?? 0,
      participationProfile: row.participation_profile || 'classical_committee',
      subgroupVisibility: row.subgroup_visibility || 'open',
    })),
  };
}

function validateSubgroupPayload(body, governance) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    throw ApiError.validation('Subgroup name is required', null, 'MISSING_SUBGROUP_NAME');
  }
  const profile = body.profile || body.participationProfile || 'classical_committee';
  if (!getProfile(profile)) {
    throw ApiError.validation('Invalid participation profile', null, 'INVALID_PROFILE');
  }
  const visibility = normalizeSubgroupVisibility(
    body.visibility ?? body.subgroupVisibility,
    governance?.defaultSubgroupVisibility || 'open'
  );
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  return { name, description, profile, visibility };
}

async function assertSubgroupDepthAllowed(db, parentOrg, governance) {
  const maxDepth = governance?.maxSubgroupDepth;
  if (maxDepth == null) return;
  const nextDepth = (parentOrg.tree_depth ?? 0) + 1;
  if (nextDepth > maxDepth) {
    throw ApiError.validation('Maximum subgroup depth reached', { maxDepth }, 'MAX_SUBGROUP_DEPTH');
  }
}

async function createSubgroupRecord(db, parentOrgId, creatorUserId, payload, options = {}) {
  const { voteId = null, req = null } = options;
  const governance = await getSubgroupGovernanceRules(db, parentOrgId);
  if (!governance?.subgroupsEnabled) {
    throw ApiError.forbidden('Subgroups are not enabled for this organization', 'SUBGROUPS_DISABLED');
  }

  const parent = await getOrgTreeRowLocal(db, parentOrgId);
  if (!parent) throw ApiError.notFound('Organization');

  const subgroup = validateSubgroupPayload(payload, governance);
  await assertSubgroupDepthAllowed(db, parent, governance);

  const childId = uuidv4();
  const treePath = computeTreePath(parent.tree_path || `/${parentOrgId}`, childId);
  const treeDepth = (parent.tree_depth ?? 0) + 1;
  const rootId = parent.participation_graph_root_id || parentOrgId;
  const repsJson = safeJsonStringify([creatorUserId]);

  await TransactionManager.executeInTransaction(db, async (trx) => {
    await TransactionManager.execute(
      trx,
      `INSERT INTO organizations (
        id, name, description, representatives, membership_policy, voting_enabled, voting_threshold,
        is_active, primary_parent_id, org_kind, participation_profile, created_by_user_id,
        tree_depth, tree_path, participation_graph_root_id, subgroup_visibility, created_by_admin_id
      ) VALUES (?, ?, ?, ?, 'invitation', true, 0.75, true, ?, 'standard', ?, ?, ?, ?, ?, ?, ?)`,
      [
        childId, subgroup.name, subgroup.description || '', repsJson, parentOrgId, subgroup.profile,
        creatorUserId, treeDepth, treePath, rootId, subgroup.visibility, creatorUserId,
      ]
    );

    await TransactionManager.execute(
      trx,
      `INSERT INTO organization_relationships
       (id, source_org_id, target_org_id, relationship_type, config_json, status, created_by_vote_id, created_at)
       VALUES (?, ?, ?, 'primary_parent', ?, 'active', ?, CURRENT_TIMESTAMP)`,
      [uuidv4(), childId, parentOrgId, safeJsonStringify(getProfile(subgroup.profile)), voteId]
    );

    await TransactionManager.execute(
      trx,
      `INSERT INTO organization_members (id, organization_id, user_id, status, joined_at)
       VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)`,
      [uuidv4(), childId, creatorUserId]
    );
    await TransactionManager.execute(
      trx,
      `INSERT INTO organization_representatives (id, organization_id, user_id, status, added_at)
       VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)`,
      [uuidv4(), childId, creatorUserId]
    );

    await GovernanceRulesService.createDefaultGovernanceRules(trx, childId);
    await TransactionManager.execute(
      trx,
      `UPDATE organization_governance_rules SET
        participation_graph_enabled = true,
        subgroups_enabled = true,
        subgroup_creation_requires_vote = ?,
        default_subgroup_visibility = ?
       WHERE organization_id = ?`,
      [
        governance.subgroupCreationRequiresVote,
        governance.defaultSubgroupVisibility,
        childId,
      ]
    );

    await logAudit(trx, parentOrgId, 'subgroup_created', creatorUserId, null, {
      name: subgroup.name,
      visibility: subgroup.visibility,
      profile: subgroup.profile,
      childOrganizationId: childId,
      voteId,
    }, req);

    if (subgroup.profile === 'federation_chapter') {
      const { createOrgMemberEdge, ensureFederationChapterLinks } = require('./participationGraphFederation');
      const edgeId = await createOrgMemberEdge(trx, {
        apexOrgId: parentOrgId,
        memberOrgId: childId,
        voteId,
      });
      await ensureFederationChapterLinks(trx, {
        apexOrgId: parentOrgId,
        chapterOrgId: childId,
        creatorUserId,
        edgeId,
      });
    }
  });

  const created = await getOrgTreeRowLocal(db, childId);
  return {
    organization: mapTreeNode(created),
  };
}

async function proposeOrCreateSubgroup(db, parentOrgId, userId, body, req) {
  const governance = await getSubgroupGovernanceRules(db, parentOrgId);
  if (!governance?.subgroupsEnabled) {
    throw ApiError.forbidden('Subgroups are not enabled for this organization', 'SUBGROUPS_DISABLED');
  }

  const parent = await getOrgTreeRowLocal(db, parentOrgId);
  if (!parent) throw ApiError.notFound('Organization');

  const payload = validateSubgroupPayload(body, governance);
  await assertSubgroupDepthAllowed(db, parent, governance);

  const isRep = await isRepresentative(db, userId, parentOrgId);
  const isMember = await isActiveMember(db, userId, parentOrgId);
  if (!isMember) {
    throw ApiError.forbidden('Only organization members can create subgroups', 'NOT_ACTIVE_MEMBER');
  }

  const canPropose = isRep || governance.membersCanProposeSubgroupCreation;
  if (!canPropose) {
    throw ApiError.forbidden('You cannot propose subgroup creation', 'CANNOT_PROPOSE_SUBGROUP');
  }

  if (governance.subgroupCreationRequiresVote) {
    const OrganizationService = require('./OrganizationService');
    const sourceMeetingDecisionId = body.sourceMeetingDecisionId ?? body.source_meeting_decision_id ?? null;
    const metadata = {
      name: payload.name,
      description: payload.description,
      profile: payload.profile,
      visibility: payload.visibility,
    };
    const result = await OrganizationService.createOrganizationVote(
      db,
      parentOrgId,
      userId,
      {
        title: `Create subgroup: ${payload.name}`,
        description: payload.description || null,
        voteType: 'subgroup_creation',
        metadataJson: metadata,
        ...(sourceMeetingDecisionId ? { sourceMeetingDecisionId } : {}),
      },
      req
    );
    return { mode: 'vote_proposed', vote: result.vote, metadata };
  }

  if (!isRep) {
    throw ApiError.forbidden('Only representatives can create subgroups directly', 'NOT_REPRESENTATIVE');
  }

  const created = await createSubgroupRecord(db, parentOrgId, userId, payload, { req });
  return { mode: 'created', ...created };
}

async function materializeSubgroupFromVote(db, parentOrgId, vote, completingUserId, req) {
  const metadata = typeof vote.metadata_json === 'string'
    ? safeJsonParse(vote.metadata_json, null)
    : vote.metadata_json;
  if (!metadata || !metadata.name) {
    throw ApiError.validation('Vote metadata is missing subgroup details', null, 'INVALID_SUBGROUP_METADATA');
  }
  const proposerId = vote.proposed_by_user_id || completingUserId;
  return createSubgroupRecord(db, parentOrgId, proposerId, metadata, {
    voteId: vote.id,
    req,
  });
}

async function applyChildDissolutionPolicy(db, organizationId, policy) {
  if (policy !== 'cascade_deactivate') return;
  const children = await TransactionManager.queryAll(
    db,
    'SELECT id FROM organizations WHERE primary_parent_id = ? AND is_active = true',
    [organizationId]
  );
  for (const child of children) {
    await TransactionManager.execute(db, 'UPDATE organizations SET is_active = false WHERE id = ?', [child.id]);
  }
}

module.exports = {
  SUBGROUP_VISIBILITY,
  normalizeSubgroupVisibility,
  getSubgroupGovernanceRules,
  getDirectChildren,
  validateSubgroupPayload,
  assertSubgroupDepthAllowed,
  createSubgroupRecord,
  proposeOrCreateSubgroup,
  materializeSubgroupFromVote,
  applyChildDissolutionPolicy,
};
