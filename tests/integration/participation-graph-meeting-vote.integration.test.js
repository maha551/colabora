const request = require('supertest');
const { startApplication } = require('../../server/bootstrap');
const { getServerDb } = require('../utils/test-helpers');
const {
  createRootOrg,
  seedMember,
  setSubgroupGovernance,
  ensureParticipationGraphMigrations,
} = require('../utils/participation-graph-fixtures');

let server;
let adminToken;
let repToken;
let otherRepToken;
let repId;
let otherRepId;

beforeAll(async () => {
  server = await startApplication({ port: 3022, returnServer: true });
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const adminLogin = await request(server)
    .post('/api/auth/login')
    .send({ email: 'admin@colabora.local', password: 'AdminSecurePass123!' });
  adminToken = adminLogin.body.token;

  const aliceLogin = await request(server)
    .post('/api/auth/login')
    .send({ email: 'alice@example.com', password: 'SecurePass123!' });
  repToken = aliceLogin.body.token;
  repId = aliceLogin.body.user.id;

  const bobLogin = await request(server)
    .post('/api/auth/login')
    .send({ email: 'bob@example.com', password: 'SecurePass123!' });
  otherRepToken = bobLogin.body.token;
  otherRepId = bobLogin.body.user.id;
});

afterAll(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

describe('Participation graph meeting → org vote', () => {
  test('PG3 links meeting decision to subgroup_creation vote and completes flow', async () => {
    const subgroupName = 'Meeting Subgroup ' + Date.now();
    const root = await createRootOrg(server, adminToken, {
      name: 'PG3 Meeting Root ' + Date.now(),
      representatives: [repId, otherRepId],
    });
    await seedMember(server, root.id, repId);
    await setSubgroupGovernance(server, root.id, { subgroup_creation_requires_vote: true });

    const meetingRes = await request(server)
      .post(`/api/organizations/${root.id}/meetings`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({
        title: 'Floor meeting',
        scheduled_at: new Date().toISOString(),
      })
      .expect(201);
    const meetingId = meetingRes.body.id;

    const decisionRes = await request(server)
      .post(`/api/organizations/${root.id}/meetings/${meetingId}/decisions`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({
        title: subgroupName,
        text: 'The meeting resolved to create a subgroup.',
      })
      .expect(201);
    const decisionId = decisionRes.body.id;

    const propose = await request(server)
      .post(`/api/organizations/${root.id}/subgroups`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({
        name: subgroupName,
        visibility: 'open',
        source_meeting_decision_id: decisionId,
      })
      .expect(200);

    expect(propose.body.mode).toBe('vote_proposed');
    const voteId = propose.body.vote.id;

    const db = getServerDb(server);
    const decisionRow = await db('meeting_decisions').where({ id: decisionId }).first();
    expect(decisionRow.organization_vote_id).toBe(voteId);

    const voteRow = await db('organization_votes').where({ id: voteId }).first();
    expect(voteRow.source_meeting_decision_id).toBe(decisionId);

    await request(server)
      .post(`/api/organizations/${root.id}/votes/${voteId}/approve`)
      .set('Authorization', `Bearer ${otherRepToken}`)
      .expect(200);

    await request(server)
      .post(`/api/organizations/${root.id}/votes/${voteId}/vote`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ choice: 'yes' })
      .expect(200);

    await request(server)
      .post(`/api/organizations/${root.id}/votes/${voteId}/complete`)
      .set('Authorization', `Bearer ${otherRepToken}`)
      .expect(200);

    const children = await request(server)
      .get(`/api/organizations/${root.id}/children`)
      .set('Authorization', `Bearer ${repToken}`)
      .expect(200);

    expect(children.body.children.some((c) => c.name === subgroupName)).toBe(true);
  });

  test('PG3 rejects source meeting decision from another organization', async () => {
    await ensureParticipationGraphMigrations(server);
    const rootA = await createRootOrg(server, adminToken, {
      name: 'PG3 Org A ' + Date.now(),
      representatives: [repId, otherRepId],
    });
    const rootB = await createRootOrg(server, adminToken, {
      name: 'PG3 Org B ' + Date.now(),
      representatives: [repId, otherRepId],
    });
    await seedMember(server, rootA.id, repId);
    await seedMember(server, rootB.id, repId);
    await setSubgroupGovernance(server, rootB.id, { subgroup_creation_requires_vote: true });

    const meetingRes = await request(server)
      .post(`/api/organizations/${rootA.id}/meetings`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ title: 'Org A meeting', scheduled_at: new Date().toISOString() })
      .expect(201);

    const decisionRes = await request(server)
      .post(`/api/organizations/${rootA.id}/meetings/${meetingRes.body.id}/decisions`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ title: 'Foreign link', text: 'Should not link cross-org' })
      .expect(201);

    const bad = await request(server)
      .post(`/api/organizations/${rootB.id}/subgroups`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({
        name: 'Cross org subgroup',
        source_meeting_decision_id: decisionRes.body.id,
      })
      .expect(404);

    expect(bad.body.code || bad.body.error).toBeTruthy();
  });
});
