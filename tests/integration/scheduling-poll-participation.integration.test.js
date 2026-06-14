process.env.PG_POOL_MAX = process.env.PG_POOL_MAX || '5';

const request = require('supertest');
const { getServerDb } = require('../utils/test-helpers');

let server;

async function login(email, password) {
  const res = await request(server)
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);
  return res.body;
}

function futureIso(hoursFromNow = 48) {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

function pastIso(hoursAgo = 1) {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}

describe('Scheduling poll participation deadlines', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PG_POOL_MAX = '5';
    if (!server) {
      server = await require('../../server/bootstrap').startApplication({ port: 3005, returnServer: true });
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  });

  afterAll(async () => {
    if (server) {
      if (typeof server.stop === 'function') {
        await new Promise((resolve) => server.stop(resolve));
      }
      await new Promise((resolve) => server.close(() => resolve()));
    }
  });

  test('create poll sets default participation deadline', async () => {
    const admin = await login('admin@colabora.local', 'AdminSecurePass123!');
    const alice = await login('alice@example.com', 'SecurePass123!');

    const orgRes = await request(server)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: `Poll deadline default ${Date.now()}`, representatives: [alice.user.id] })
      .expect(201);

    const organizationId = orgRes.body.organization.id;
    const pollRes = await request(server)
      .post(`/api/organizations/${organizationId}/scheduling-polls`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ title: 'Default deadline poll' })
      .expect(201);

    expect(pollRes.body.poll.participationDeadline).toBeTruthy();
    expect(new Date(pollRes.body.poll.participationDeadline).getTime()).toBeGreaterThan(Date.now());
  });

  test('auto-close, manual close, extend, enforce responses, finalize from closed', async () => {
    const admin = await login('admin@colabora.local', 'AdminSecurePass123!');
    const alice = await login('alice@example.com', 'SecurePass123!');

    const orgRes = await request(server)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: `Poll participation ${Date.now()}`,
        representatives: [alice.user.id],
      })
      .expect(201);

    const organizationId = orgRes.body.organization.id;
    const db = getServerDb(server);

    const pollRes = await request(server)
      .post(`/api/organizations/${organizationId}/scheduling-polls`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ title: 'Participation test', participationDeadline: futureIso(72) })
      .expect(201);

    const pollId = pollRes.body.poll.id;

    const slotRes = await request(server)
      .post(`/api/organizations/${organizationId}/scheduling-polls/${pollId}/slots`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({
        slots: [{
          startAt: futureIso(96),
          endAt: futureIso(97),
        }],
      })
      .expect(201);

    const slotId = slotRes.body.slots[0].id;

    await request(server)
      .put(`/api/organizations/${organizationId}/scheduling-polls/${pollId}/responses`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ responses: [{ slotId, response: 'yes' }] })
      .expect(200);

    const closeRes = await request(server)
      .post(`/api/organizations/${organizationId}/scheduling-polls/${pollId}/close`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({})
      .expect(200);

    expect(closeRes.body.poll.status).toBe('closed');
    expect(closeRes.body.participationSummary.respondedCount).toBeGreaterThanOrEqual(1);

    await request(server)
      .put(`/api/organizations/${organizationId}/scheduling-polls/${pollId}/responses`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ responses: [{ slotId, response: 'no' }] })
      .expect(409);

    const finalizeRes = await request(server)
      .post(`/api/organizations/${organizationId}/scheduling-polls/${pollId}/finalize`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ chosenSlotId: slotId })
      .expect(200);

    expect(finalizeRes.body.poll.status).toBe('finalized');

    const extendPollRes = await request(server)
      .post(`/api/organizations/${organizationId}/scheduling-polls`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ title: 'Extend test', participationDeadline: futureIso(24) })
      .expect(201);

    const extendPollId = extendPollRes.body.poll.id;

    await request(server)
      .post(`/api/organizations/${organizationId}/scheduling-polls/${extendPollId}/close`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);

    const extendRes = await request(server)
      .patch(`/api/organizations/${organizationId}/scheduling-polls/${extendPollId}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ participationDeadline: futureIso(48) })
      .expect(200);

    expect(extendRes.body.poll.status).toBe('open');
    expect(extendRes.body.reopened).toBe(true);

    await db('scheduling_polls')
      .where({ id: extendPollId })
      .update({ response_deadline: pastIso(1), status: 'open', participation_closed_at: null });

    const DocumentScheduler = require('../../server/modules/scheduler');
    const scheduler = new DocumentScheduler(db);
    await scheduler.checkSchedulingPollParticipationDeadlines();

    const autoClosed = await request(server)
      .get(`/api/organizations/${organizationId}/scheduling-polls/${extendPollId}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);

    expect(autoClosed.body.poll.status).toBe('closed');
  });
});
