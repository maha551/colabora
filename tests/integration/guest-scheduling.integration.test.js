process.env.PG_POOL_MAX = process.env.PG_POOL_MAX || '20';

const request = require('supertest');

let server;
let organizationId;
let aliceToken;

async function login(email, password) {
  const res = await request(server)
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);
  return res.body;
}

async function createPollWithSlots(token, title = 'Team sync') {
  const pollRes = await request(server)
    .post(`/api/organizations/${organizationId}/scheduling-polls`)
    .set('Authorization', `Bearer ${token}`)
    .send({ title, description: 'Pick a time' })
    .expect(201);

  const pollId = pollRes.body.poll.id;
  const start = new Date();
  start.setDate(start.getDate() + 7);
  start.setHours(14, 0, 0, 0);
  const end = new Date(start);
  end.setHours(15, 0, 0, 0);
  const start2 = new Date(start);
  start2.setDate(start2.getDate() + 1);

  await request(server)
    .post(`/api/organizations/${organizationId}/scheduling-polls/${pollId}/slots`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      slots: [
        { startAt: start.toISOString(), endAt: end.toISOString() },
        { startAt: start2.toISOString(), endAt: new Date(start2.getTime() + 3600000).toISOString() },
      ],
    })
    .expect(201);

  return pollId;
}

async function getGuestToken(db, pollId) {
  const row = await db('scheduling_poll_guest_links')
    .select('token')
    .where({ scheduling_poll_id: pollId, status: 'active' })
    .first();
  return row?.token;
}

describe('Guest scheduling integration', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    server = await require('../../server/bootstrap').startApplication({ port: 3003, returnServer: true });
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const admin = await login('admin@colabora.local', 'AdminSecurePass123!');
    const alice = await login('alice@example.com', 'SecurePass123!');
    aliceToken = alice.token;

    let orgRes;
    for (let attempt = 0; attempt < 10; attempt++) {
      orgRes = await request(server)
        .post('/api/admin/organizations')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          name: `Guest Scheduling Org ${Date.now()}`,
          description: 'Guest scheduling integration tests',
          representatives: [alice.user.id],
        });
      if (orgRes.status === 201) break;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    expect(orgRes.status).toBe(201);

    organizationId = orgRes.body.organization.id;
  }, 120000);

  afterAll(async () => {
    if (server) {
      if (typeof server.stop === 'function') {
        await new Promise((resolve) => server.stop(resolve));
      }
      await new Promise((resolve) => server.close(() => resolve()));
    }
  });

  test('public guest can view poll and save responses without auth', async () => {
    const pollId = await createPollWithSlots(aliceToken, `Guest poll ${Date.now()}`);

    const db = server.app.locals.db;
    const guestToken = await getGuestToken(db, pollId);
    expect(guestToken).toBeTruthy();

    const publicGet = await request(server)
      .get(`/api/public/guest/polls/${guestToken}`)
      .expect(200);

    expect(publicGet.body.slots.length).toBe(2);

    const slotId = publicGet.body.slots[0].id;
    const saveRes = await request(server)
      .put(`/api/public/guest/polls/${guestToken}/responses`)
      .send({
        displayName: 'Guest Alex',
        responses: [{ slotId, response: 'yes' }],
      })
      .expect(200);

    expect(saveRes.body.sessionToken).toBeTruthy();
    expect(saveRes.body.displayName).toBe('Guest Alex');

    const withSession = await request(server)
      .get(`/api/public/guest/polls/${guestToken}`)
      .set('X-Guest-Session', saveRes.body.sessionToken)
      .expect(200);

    expect(withSession.body.guestSession?.displayName).toBe('Guest Alex');
    expect(withSession.body.responseCounts[0].yes).toBeGreaterThanOrEqual(1);
  });

  test('merged counts include member and guest responses', async () => {
    const pollId = await createPollWithSlots(aliceToken, `Merged counts ${Date.now()}`);

    const memberDetail = await request(server)
      .get(`/api/organizations/${organizationId}/scheduling-polls/${pollId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    const slotId = memberDetail.body.slots[0].id;

    const db = server.app.locals.db;
    const guestToken = await getGuestToken(db, pollId);

    await request(server)
      .put(`/api/public/guest/polls/${guestToken}/responses`)
      .send({ displayName: 'Guest B', responses: [{ slotId, response: 'yes' }] })
      .expect(200);

    await request(server)
      .put(`/api/organizations/${organizationId}/scheduling-polls/${pollId}/responses`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ responses: [{ slotId, response: 'yes' }] })
      .expect(200);

    const merged = await request(server)
      .get(`/api/organizations/${organizationId}/scheduling-polls/${pollId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    const slotCounts = merged.body.responseCounts.find((c) => c.slotId === slotId);
    expect(slotCounts.yes).toBeGreaterThanOrEqual(2);
  });

  test('finalize closes guest responses; regenerate invalidates old token', async () => {
    const pollId = await createPollWithSlots(aliceToken, `Finalize guest ${Date.now()}`);

    const db = server.app.locals.db;
    const oldToken = await getGuestToken(db, pollId);
    const slotId = (await request(server)
      .get(`/api/organizations/${organizationId}/scheduling-polls/${pollId}`)
      .set('Authorization', `Bearer ${aliceToken}`)).body.slots[0].id;

    await request(server)
      .post(`/api/organizations/${organizationId}/scheduling-polls/${pollId}/finalize`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ chosenSlotId: slotId })
      .expect(200);

    await request(server)
      .put(`/api/public/guest/polls/${oldToken}/responses`)
      .send({ responses: [{ slotId, response: 'no' }] })
      .expect(409);

    const finalizedGet = await request(server)
      .get(`/api/public/guest/polls/${oldToken}`)
      .expect(200);

    expect(finalizedGet.body.chosenSlot).toBeDefined();

    await request(server)
      .post(`/api/organizations/${organizationId}/scheduling-polls/${pollId}/guest-link/regenerate`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    await request(server).get(`/api/public/guest/polls/${oldToken}`).expect(404);

    const newToken = await getGuestToken(db, pollId);
    await request(server).get(`/api/public/guest/polls/${newToken}`).expect(200);
  });

  test('guest view includes meeting and finalized minutes', async () => {
    const pollId = await createPollWithSlots(aliceToken, `Meeting pack ${Date.now()}`);

    const detail = await request(server)
      .get(`/api/organizations/${organizationId}/scheduling-polls/${pollId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    const slotId = detail.body.slots[0].id;
    await request(server)
      .post(`/api/organizations/${organizationId}/scheduling-polls/${pollId}/finalize`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ chosenSlotId: slotId })
      .expect(200);

    const meetingRes = await request(server)
      .post(`/api/organizations/${organizationId}/meetings/from-scheduling-poll/${pollId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ title: 'Pack meeting', createRoom: false })
      .expect(201);

    const meetingId = meetingRes.body.id;
    await request(server)
      .put(`/api/organizations/${organizationId}/meetings/${meetingId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ meeting_link: 'https://meet.example.com/room' })
      .expect(200);

    await request(server)
      .post(`/api/organizations/${organizationId}/meetings/${meetingId}/minutes/events`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ eventType: 'document_created', payload: { title: 'Welcome pack' } })
      .expect(201);

    await request(server)
      .post(`/api/organizations/${organizationId}/meetings/${meetingId}/minutes/finalize`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    const db = server.app.locals.db;
    const guestToken = await getGuestToken(db, pollId);
    const guestView = await request(server)
      .get(`/api/public/guest/polls/${guestToken}`)
      .expect(200);

    expect(guestView.body.meeting?.meetingLink).toBe('https://meet.example.com/room');
    expect(guestView.body.minutesBlocks).toBeTruthy();
    expect(Array.isArray(guestView.body.minutesBlocks)).toBe(true);
    expect(guestView.body.minutesBlocks.length).toBeGreaterThan(0);
  });
});
