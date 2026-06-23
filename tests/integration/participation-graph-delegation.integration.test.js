const request = require('supertest');
const { startApplication } = require('../../server/bootstrap');
const { getServerDb } = require('../utils/test-helpers');
const { createRootOrg, seedMember } = require('../utils/participation-graph-fixtures');

let server;
let adminToken;
let repToken;
let repId;
let otherRepToken;
let otherRepId;

beforeAll(async () => {
  server = await startApplication({ port: 3027, returnServer: true });
  await new Promise((r) => setTimeout(r, 3000));
  adminToken = (await request(server).post('/api/auth/login').send({ email: 'admin@colabora.local', password: 'AdminSecurePass123!' })).body.token;
  const alice = await request(server).post('/api/auth/login').send({ email: 'alice@example.com', password: 'SecurePass123!' });
  repToken = alice.body.token;
  repId = alice.body.user.id;
  const bob = await request(server).post('/api/auth/login').send({ email: 'bob@example.com', password: 'SecurePass123!' });
  otherRepToken = bob.body.token;
  otherRepId = bob.body.user.id;
});

afterAll(async () => {
  if (server) await new Promise((r) => server.close(r));
});

describe('Participation graph delegation', () => {
  test('PG8 creates global delegation', async () => {
    const org = await createRootOrg(server, adminToken, { name: 'PG8 Org ' + Date.now(), representatives: [repId, otherRepId] });
    await seedMember(server, org.id, repId);
    await seedMember(server, org.id, otherRepId);
    const db = getServerDb(server);
    await db('organization_governance_rules').where({ organization_id: org.id }).update({ liquid_delegation_enabled: true });

    const del = await request(server)
      .post(`/api/organizations/${org.id}/delegations`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ delegateUserId: otherRepId, delegationMode: 'global' })
      .expect(201);

    expect(del.body.delegateUserId).toBe(otherRepId);
  });

  test('PG8 rejects delegation cycle', async () => {
    const org = await createRootOrg(server, adminToken, { name: 'PG8 Cycle ' + Date.now(), representatives: [repId, otherRepId] });
    await seedMember(server, org.id, repId);
    await seedMember(server, org.id, otherRepId);
    const db = getServerDb(server);
    await db('organization_governance_rules').where({ organization_id: org.id }).update({ liquid_delegation_enabled: true });

    await request(server)
      .post(`/api/organizations/${org.id}/delegations`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ delegateUserId: otherRepId })
      .expect(201);

    await request(server)
      .post(`/api/organizations/${org.id}/delegations`)
      .set('Authorization', `Bearer ${otherRepToken}`)
      .send({ delegateUserId: repId })
      .expect(400);
  });
});
