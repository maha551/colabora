const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const { startApplication } = require('../../server/bootstrap');
const { getServerDb } = require('../utils/test-helpers');
const {
  createRootOrg,
  createChildOrg,
  seedMember,
} = require('../utils/participation-graph-fixtures');

let server;
let adminToken;
let repToken;
let repId;
let otherRepId;

beforeAll(async () => {
  server = await startApplication({ port: 3024, returnServer: true });
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
  otherRepId = bobLogin.body.user.id;
});

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

describe('Participation graph document lineage', () => {
  test('PG5 child agreed doc submits draft to parent org', async () => {
    const root = await createRootOrg(server, adminToken, {
      name: 'PG5 Parent ' + Date.now(),
      representatives: [repId, otherRepId],
    });
    const child = await createChildOrg(server, adminToken, root.id, {
      name: 'PG5 Child ' + Date.now(),
      representatives: [repId],
    });
    await seedMember(server, root.id, repId);
    await seedMember(server, child.id, repId);

    const docRes = await request(server)
      .post('/api/documents')
      .set('Authorization', `Bearer ${repToken}`)
      .send({
        title: 'Child policy ' + Date.now(),
        organizationId: child.id,
        ownershipType: 'organizational',
      })
      .expect(201);
    const docId = docRes.body.document?.id || docRes.body.id;

    const db = getServerDb(server);
    await db('documents').where({ id: docId }).update({ status: 'agreed' });

    const submit = await request(server)
      .post(`/api/documents/${docId}/submit-for-ratification`)
      .set('Authorization', `Bearer ${repToken}`)
      .expect(201);

    expect(submit.body.derivedDocumentId).toBeTruthy();
    expect(submit.body.targetOrganizationId).toBe(root.id);

    const lineage = await db('document_lineage').where({ id: submit.body.lineageId }).first();
    expect(lineage.status).toBe('pending_ratification');
  });
});
