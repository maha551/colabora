const request = require('supertest');
const { startApplication } = require('../../server/bootstrap');
const {
  createRootOrg,
  seedMember,
  setSubgroupGovernance,
} = require('../utils/participation-graph-fixtures');

let server;
let adminToken;
let repToken;
let repId;
let otherRepId;
let otherRepToken;

beforeAll(async () => {
  server = await startApplication({ port: 3021, returnServer: true });
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

describe('Participation graph subgroups', () => {
  test('PG2-vote-flow creates child after complete', async () => {
    const subgroupName = 'Subgroup ' + Date.now();
    const root = await createRootOrg(server, adminToken, {
      name: 'PG2 Vote Root ' + Date.now(),
      representatives: [repId, otherRepId],
    });
    await seedMember(server, root.id, repId);
    await setSubgroupGovernance(server, root.id, { subgroup_creation_requires_vote: true });

    const propose = await request(server)
      .post('/api/organizations/' + root.id + '/subgroups')
      .set('Authorization', 'Bearer ' + repToken)
      .send({ name: subgroupName, visibility: 'open' })
      .expect(200);

    expect(propose.body.mode).toBe('vote_proposed');
    const voteId = propose.body.vote.id;

    await request(server)
      .post('/api/organizations/' + root.id + '/votes/' + voteId + '/approve')
      .set('Authorization', 'Bearer ' + otherRepToken)
      .expect(200);

    await request(server)
      .post('/api/organizations/' + root.id + '/votes/' + voteId + '/vote')
      .set('Authorization', 'Bearer ' + repToken)
      .send({ choice: 'yes' })
      .expect(200);

    await request(server)
      .post('/api/organizations/' + root.id + '/votes/' + voteId + '/complete')
      .set('Authorization', 'Bearer ' + otherRepToken)
      .expect(200);

    const children = await request(server)
      .get('/api/organizations/' + root.id + '/children')
      .set('Authorization', 'Bearer ' + repToken)
      .expect(200);

    expect(children.body.children.some((c) => c.name === subgroupName)).toBe(true);
  });

  test('PG2-direct-create when vote not required', async () => {
    const root = await createRootOrg(server, adminToken, {
      name: 'PG2 Direct Root ' + Date.now(),
      representatives: [repId],
    });
    await seedMember(server, root.id, repId);
    await setSubgroupGovernance(server, root.id, { subgroup_creation_requires_vote: false });

    const name = 'Direct Subgroup ' + Date.now();
    const created = await request(server)
      .post('/api/organizations/' + root.id + '/subgroups')
      .set('Authorization', 'Bearer ' + repToken)
      .send({ name, visibility: 'closed' })
      .expect(201);

    expect(created.body.mode).toBe('created');
    expect(created.body.organization.name).toBe(name);
  });

  test('PG2-max-depth-enforced', async () => {
    const root = await createRootOrg(server, adminToken, {
      name: 'PG2 Depth Root ' + Date.now(),
      representatives: [repId],
    });
    await seedMember(server, root.id, repId);
    await setSubgroupGovernance(server, root.id, {
      subgroup_creation_requires_vote: false,
      max_subgroup_depth: 0,
    });

    await request(server)
      .post('/api/organizations/' + root.id + '/subgroups')
      .set('Authorization', 'Bearer ' + repToken)
      .send({ name: 'Too Deep' })
      .expect(400);
  });
});
