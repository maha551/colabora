const request = require('supertest');
const { startApplication } = require('../../server/bootstrap');
const { getServerDb } = require('../utils/test-helpers');
const { createRootOrg, seedMember } = require('../utils/participation-graph-fixtures');

let server;
let adminToken;
let repToken;
let repId;

beforeAll(async () => {
  server = await startApplication({ port: 3025, returnServer: true });
  await new Promise((r) => setTimeout(r, 3000));
  adminToken = (await request(server).post('/api/auth/login').send({ email: 'admin@colabora.local', password: 'AdminSecurePass123!' })).body.token;
  repToken = (await request(server).post('/api/auth/login').send({ email: 'alice@example.com', password: 'SecurePass123!' })).body.token;
  repId = (await request(server).post('/api/auth/login').send({ email: 'alice@example.com', password: 'SecurePass123!' })).body.user.id;
});

afterAll(async () => {
  if (server) await new Promise((r) => server.close(r));
});

describe('Participation graph networks', () => {
  test('PG6 affiliate edge without tree parent', async () => {
    const network = await createRootOrg(server, adminToken, { name: 'PG6 Network ' + Date.now(), representatives: [repId] });
    const chapter = await createRootOrg(server, adminToken, { name: 'PG6 Chapter ' + Date.now(), representatives: [repId] });
    await seedMember(server, network.id, repId);
    const db = getServerDb(server);
    await db('organization_governance_rules').where({ organization_id: network.id }).update({ networks_enabled: true });

    const edge = await request(server)
      .post(`/api/organizations/${network.id}/affiliates`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ affiliateOrgId: chapter.id })
      .expect(201);

    expect(edge.body.edgeId).toBeTruthy();
    const list = await request(server)
      .get(`/api/organizations/${network.id}/affiliates`)
      .set('Authorization', `Bearer ${repToken}`)
      .expect(200);
    expect(list.body.affiliates.some((a) => a.affiliateOrgId === chapter.id)).toBe(true);
  });
});
