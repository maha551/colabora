'use strict';

const { v4: uuidv4 } = require('uuid');
const TransactionManager = require('../database/services/TransactionManager');
const { ApiError } = require('../middleware/errorHandler');
const { isActiveMember } = require('../modules/permissions');

async function assertDelegationEnabled(db, orgId) {
  const row = await TransactionManager.query(
    db,
    'SELECT liquid_delegation_enabled, proxy_voting_enabled FROM organization_governance_rules WHERE organization_id = ?',
    [orgId]
  );
  if (!row?.liquid_delegation_enabled && !row?.proxy_voting_enabled) {
    throw ApiError.forbidden('Delegation is not enabled for this organization', 'DELEGATION_DISABLED');
  }
  return row;
}

async function createDelegation(db, orgId, delegatorUserId, body) {
  await assertDelegationEnabled(db, orgId);
  const delegateUserId = body.delegateUserId ?? body.delegate_user_id;
  const mode = body.delegationMode ?? body.delegation_mode ?? 'global';
  if (!delegateUserId) throw ApiError.validation('delegateUserId is required');
  if (delegateUserId === delegatorUserId) throw ApiError.validation('Cannot delegate to yourself');
  const isMember = await isActiveMember(db, delegatorUserId, orgId);
  if (!isMember) throw ApiError.forbidden('Only active members can delegate', 'NOT_ACTIVE_MEMBER');

  const cycle = await TransactionManager.query(
    db,
    `SELECT id FROM vote_delegations
     WHERE organization_id = ? AND delegator_user_id = ? AND delegate_user_id = ? AND revoked_at IS NULL`,
    [orgId, delegateUserId, delegatorUserId]
  );
  if (cycle) throw ApiError.validation('Delegation cycle detected', null, 'DELEGATION_CYCLE');

  const id = uuidv4();
  await TransactionManager.execute(
    db,
    `INSERT INTO vote_delegations
       (id, organization_id, delegator_user_id, delegate_user_id, delegation_mode, domain_tag, target_contest_type, target_contest_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, orgId, delegatorUserId, delegateUserId, mode,
      body.domainTag ?? body.domain_tag ?? null,
      body.targetContestType ?? body.target_contest_type ?? null,
      body.targetContestId ?? body.target_contest_id ?? null,
    ]
  );
  return { id, organizationId: orgId, delegatorUserId, delegateUserId, delegationMode: mode };
}

async function revokeDelegation(db, orgId, delegationId, userId) {
  const row = await TransactionManager.query(
    db,
    'SELECT delegator_user_id FROM vote_delegations WHERE id = ? AND organization_id = ?',
    [delegationId, orgId]
  );
  if (!row) throw ApiError.notFound('Delegation');
  if (row.delegator_user_id !== userId) throw ApiError.forbidden('Only the delegator can revoke', 'NOT_DELEGATOR');
  await TransactionManager.execute(db, 'UPDATE vote_delegations SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?', [delegationId]);
  return { success: true };
}

async function listDelegations(db, orgId, userId) {
  const rows = await TransactionManager.queryAll(
    db,
    `SELECT * FROM vote_delegations
     WHERE organization_id = ? AND (delegator_user_id = ? OR delegate_user_id = ?) AND revoked_at IS NULL`,
    [orgId, userId, userId]
  );
  return { delegations: rows };
}

/** ponytail: count delegators reachable by delegate for weight (no transitive unless enabled). */
async function countRepresentedWeight(db, orgId, delegateUserId, contestType, contestId) {
  const rows = await TransactionManager.queryAll(
    db,
    `SELECT delegator_user_id FROM vote_delegations
     WHERE organization_id = ? AND delegate_user_id = ? AND revoked_at IS NULL
       AND (target_contest_id IS NULL OR target_contest_id = ?)`,
    [orgId, delegateUserId, contestId || null]
  );
  const directBallot = await TransactionManager.query(
    db,
    'SELECT id FROM vote_ballots WHERE vote_id = ? AND user_id = ?',
    [contestId, delegateUserId]
  );
  return 1 + rows.length + (directBallot ? 0 : 0);
}

module.exports = {
  assertDelegationEnabled,
  createDelegation,
  revokeDelegation,
  listDelegations,
  countRepresentedWeight,
};
