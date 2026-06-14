const request = require('supertest');

let server;

async function login(email, password) {
  const res = await request(server)
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);
  return res.body;
}

describe('Guest scheduling E2E workflow', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PG_POOL_MAX = '10';

    server = await require('../../server/bootstrap').startApplication({ port: 3028, returnServer: true });
    await new Promise((resolve) => setTimeout(resolve, 3000));
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(() => resolve()));
    }
  });

  test('poll → guest vote → finalize → meeting → minutes on unified guest link', async () => {
    const admin = await login('admin@colabora.local', 'AdminSecurePass123!');
    const alice = await login('alice@example.com', 'SecurePass123!');

    const orgRes = await request(server)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: `Guest E2E Org ${Date.now()}`,
        representatives: [alice.user.id],
      })
      .expect(201);

    const organizationId = orgRes.body.organization.id;

    const pollRes = await request(server)
      .post(`/api/organizations/${organizationId}/scheduling-polls`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ title: 'E2E guest poll', description: 'Find a time' })
      .expect(201);

    const pollId = pollRes.body.poll.id;
    const start = new Date();
    start.setDate(start.getDate() + 14);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start);
    end.setHours(11, 0, 0, 0);

    const slotsRes = await request(server)
      .post(`/api/organizations/${organizationId}/scheduling-polls/${pollId}/slots`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ slots: [{ startAt: start.toISOString(), endAt: end.toISOString() }] })
      .expect(201);

    const slotId = slotsRes.body.slots[0].id;

    const db = server.app.locals.db;
    const guestRow = await db('scheduling_poll_guest_links')
      .select('token')
      .where({ scheduling_poll_id: pollId, status: 'active' })
      .first();
    expect(guestRow?.token).toBeTruthy();

    const guestToken = guestRow.token;

    await request(server)
      .get(`/api/public/guest/polls/${guestToken}`)
      .expect(200);

    const guestSave = await request(server)
      .put(`/api/public/guest/polls/${guestToken}/responses`)
      .send({
        displayName: 'External Guest',
        responses: [{ slotId, response: 'yes' }],
      })
      .expect(200);

    expect(guestSave.body.sessionToken).toBeTruthy();

    await request(server)
      .put(`/api/organizations/${organizationId}/scheduling-polls/${pollId}/responses`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ responses: [{ slotId, response: 'yes' }] })
      .expect(200);

    await request(server)
      .post(`/api/organizations/${organizationId}/scheduling-polls/${pollId}/finalize`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ chosenSlotId: slotId })
      .expect(200);

    const meetingRes = await request(server)
      .post(`/api/organizations/${organizationId}/meetings/from-scheduling-poll/${pollId}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ title: 'E2E meeting', createRoom: false })
      .expect(201);

    const meetingId = meetingRes.body.id;

    await request(server)
      .put(`/api/organizations/${organizationId}/meetings/${meetingId}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ meeting_link: 'https://video.example.com/e2e-room' })
      .expect(200);

    await request(server)
      .post(`/api/organizations/${organizationId}/meetings/${meetingId}/minutes/events`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ eventType: 'document_created', payload: { title: 'E2E minutes note' } })
      .expect(201);

    await request(server)
      .post(`/api/organizations/${organizationId}/meetings/${meetingId}/minutes/finalize`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);

    const finalGuestView = await request(server)
      .get(`/api/public/guest/polls/${guestToken}`)
      .set('X-Guest-Session', guestSave.body.sessionToken)
      .expect(200);

    expect(finalGuestView.body.chosenSlot).toBeDefined();
    expect(finalGuestView.body.meeting?.meetingLink).toBe('https://video.example.com/e2e-room');
    expect(finalGuestView.body.minutesBlocks).toBeTruthy();
    expect(finalGuestView.body.guestSession?.displayName).toBe('External Guest');
  });
});
