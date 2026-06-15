const request = require('supertest');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getServerDb } = require('./test-helpers');

const MIGRATIONS_DIR = path.join(__dirname, '../../knex/migrations');

/**
 * Apply pending Knex migrations on the server's DB pool (test worker schema).
 * startApplication skips runtime migrations; new columns must be migrated explicitly.
 */
async function ensureParticipationGraphMigrations(server) {
  const db = getServerDb(server);
  await db.migrate.latest({ directory: MIGRATIONS_DIR });
}

/**
 * Create a root organization via admin API (includes participation graph root fields).
 */
async function createRootOrg(server, adminToken, { name, representatives }) {
  await ensureParticipationGraphMigrations(server);
  const response = await request(server)
    .post('/api/admin/organizations')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name,
      description: `${name} test org`,
      representatives,
      membershipPolicy: 'invitation',
      votingThreshold: 0.75,
    })
    .expect(201);

  return response.body.organization;
}

/**
 * Create a child org under parent via admin PATCH parent (dogfooding).
 */
async function createChildOrg(server, adminToken, parentId, { name, representatives }) {
  const child = await createRootOrg(server, adminToken, { name, representatives });
  await request(server)
    .patch(`/api/admin/organizations/${child.id}/parent`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ primaryParentId: parentId })
    .expect(200);
  return child;
}

/**
 * Seed active member using server DB pool (visible to API routes).
 */
async function seedMember(server, organizationId, userId) {
  const db = getServerDb(server);
  const existing = await db('organization_members')
    .where({ organization_id: organizationId, user_id: userId })
    .first();
  if (existing) {
    if (existing.status !== 'active') {
      await db('organization_members')
        .where({ id: existing.id })
        .update({ status: 'active', joined_at: db.fn.now(), left_at: null });
    }
    return existing.id;
  }
  const id = uuidv4();
  await db('organization_members').insert({
    id,
    organization_id: organizationId,
    user_id: userId,
    status: 'active',
    joined_at: db.fn.now(),
  });
  return id;
}

async function setSubgroupGovernance(server, organizationId, overrides = {}) {
  const db = getServerDb(server);
  const patch = {
    participation_graph_enabled: true,
    subgroups_enabled: true,
    subgroup_creation_requires_vote: true,
    members_can_propose_subgroup_creation: false,
    ...overrides,
  };
  await db('organization_governance_rules').where({ organization_id: organizationId }).update(patch);
}

module.exports = {
  setSubgroupGovernance,
  ensureParticipationGraphMigrations,
  createRootOrg,
  createChildOrg,
  seedMember,
};
