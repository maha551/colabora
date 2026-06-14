const request = require('supertest');
const { safeDeleteTestDatabase, addActiveOrganizationMemberForTests } = require('../utils/test-helpers');

let server;
let testDbPath;

async function login(email, password) {
  const res = await request(server).post('/api/auth/login').send({ email, password }).expect(200);
  return { token: res.body.token, user: res.body.user };
}

describe('Meeting todos access control', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';
    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3036, returnServer: true });
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await safeDeleteTestDatabase(testDbPath);
  });

  test('GET /todos returns 404 when meeting does not belong to organization', async () => {
    const admin = await login('admin@colabora.local', 'AdminSecurePass123!');
    const alice = await login('alice@example.com', 'SecurePass123!');

    const orgA = await request(server)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Todos Org A', representatives: [alice.user.id] })
      .expect(201);
    const orgB = await request(server)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Todos Org B', representatives: [alice.user.id] })
      .expect(201);

    const meetingRes = await request(server)
      .post(`/api/organizations/${orgA.body.organization.id}/meetings`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ title: 'Org A meeting', scheduled_at: new Date().toISOString() })
      .expect(201);

    await request(server)
      .get(`/api/organizations/${orgB.body.organization.id}/meetings/${meetingRes.body.id}/todos`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(404);
  });

  test('PATCH /todos rejects non-moderators before minutes are finalized', async () => {
    const admin = await login('admin@colabora.local', 'AdminSecurePass123!');
    const alice = await login('alice@example.com', 'SecurePass123!');
    const bob = await login('bob@example.com', 'SecurePass123!');

    const orgRes = await request(server)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Todos Moderator Org', representatives: [alice.user.id] })
      .expect(201);
    const organizationId = orgRes.body.organization.id;

    await addActiveOrganizationMemberForTests(server, organizationId, alice.token, {
      id: bob.user.id,
      email: 'bob@example.com',
      password: 'SecurePass123!',
    });

    const meetingRes = await request(server)
      .post(`/api/organizations/${organizationId}/meetings`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ title: 'Todo gate meeting', scheduled_at: new Date().toISOString() })
      .expect(201);
    const meetingId = meetingRes.body.id;

    const todoRes = await request(server)
      .post(`/api/organizations/${organizationId}/meetings/${meetingId}/todos`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({
        title: 'Follow up',
        due_date: '2026-12-31',
        responsible_user_id: bob.user.id
      })
      .expect(201);
    const todoId = todoRes.body.id;

    const patchRes = await request(server)
      .patch(`/api/organizations/${organizationId}/meetings/${meetingId}/todos/${todoId}`)
      .set('Authorization', `Bearer ${bob.token}`)
      .send({ title: 'Changed by non-moderator' })
      .expect(403);

    expect(patchRes.body.code).toBe('NOT_MODERATOR');
  });

  test('PATCH /todos after finalize: owner may update status only', async () => {
    const admin = await login('admin@colabora.local', 'AdminSecurePass123!');
    const alice = await login('alice@example.com', 'SecurePass123!');
    const bob = await login('bob@example.com', 'SecurePass123!');

    const orgRes = await request(server)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Todos Post-Finalize Org', representatives: [alice.user.id] })
      .expect(201);
    const organizationId = orgRes.body.organization.id;

    await addActiveOrganizationMemberForTests(server, organizationId, alice.token, {
      id: bob.user.id,
      email: 'bob@example.com',
      password: 'SecurePass123!',
    });

    const meetingRes = await request(server)
      .post(`/api/organizations/${organizationId}/meetings`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ title: 'Post-finalize todo meeting', scheduled_at: new Date().toISOString() })
      .expect(201);
    const meetingId = meetingRes.body.id;

    const todoRes = await request(server)
      .post(`/api/organizations/${organizationId}/meetings/${meetingId}/todos`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({
        title: 'Owner follow up',
        due_date: '2026-12-31',
        responsible_user_id: bob.user.id,
      })
      .expect(201);
    const todoId = todoRes.body.id;

    await request(server)
      .post(`/api/organizations/${organizationId}/meetings/${meetingId}/minutes/finalize`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);

    const statusPatch = await request(server)
      .patch(`/api/organizations/${organizationId}/meetings/${meetingId}/todos/${todoId}`)
      .set('Authorization', `Bearer ${bob.token}`)
      .send({ status: 'done' })
      .expect(200);

    expect(statusPatch.body.status).toBe('done');

    const titlePatch = await request(server)
      .patch(`/api/organizations/${organizationId}/meetings/${meetingId}/todos/${todoId}`)
      .set('Authorization', `Bearer ${bob.token}`)
      .send({ title: 'Renamed by owner after finalize' })
      .expect(400);

    expect(titlePatch.body.code).toBe('VALIDATION_ERROR');
  });
});
