const request = require('supertest');
const { startApplication } = require('../../server/bootstrap');
const { getServerDb } = require('../utils/test-helpers');
const { createRootOrg, seedMember } = require('../utils/participation-graph-fixtures');

let server;
let adminToken;
let repToken;
let repId;

beforeAll(async () => {
  server = await startApplication({ port: 3028, returnServer: true });
  await new Promise((r) => setTimeout(r, 3000));
  adminToken = (await request(server).post('/api/auth/login').send({ email: 'admin@colabora.local', password: 'AdminSecurePass123!' })).body.token;
  repToken = (await request(server).post('/api/auth/login').send({ email: 'alice@example.com', password: 'SecurePass123!' })).body.token;
  repId = (await request(server).post('/api/auth/login').send({ email: 'alice@example.com', password: 'SecurePass123!' })).body.user.id;
});

afterAll(async () => {
  if (server) await new Promise((r) => server.close(r));
});

describe('Participation graph editor API', () => {
  test('PG9 reads graph and saves layout', async () => {
    const root = await createRootOrg(server, adminToken, { name: 'PG9 Root ' + Date.now(), representatives: [repId] });
    await seedMember(server, root.id, repId);
    const db = getServerDb(server);
    await db('organization_governance_rules').where({ organization_id: root.id }).update({ visual_graph_editor_enabled: true });

    const graph = await request(server)
      .get(`/api/organizations/${root.id}/participation-graph`)
      .set('Authorization', `Bearer ${repToken}`)
      .expect(200);

    expect(graph.body.nodes.length).toBeGreaterThan(0);

    await request(server)
      .put(`/api/organizations/${root.id}/participation-graph/layout`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ layout: { nodes: { [root.id]: { x: 0, y: 0 } } } })
      .expect(200);
  });
});
