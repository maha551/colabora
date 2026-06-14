process.env.PG_POOL_MAX = process.env.PG_POOL_MAX || '20';

const request = require('supertest');

let server;

async function login(email, password) {
  const res = await request(server)
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);
  return res.body;
}

describe('Overview pin + calendar integration', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PG_POOL_MAX = '20';
    if (!server) {
      server = await require('../../server/bootstrap').startApplication({ port: 3037, returnServer: true });
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

  test('calendar event can be pinned and resolved on organization fetch', async () => {
    const admin = await login('admin@colabora.local', 'AdminSecurePass123!');
    const alice = await login('alice@example.com', 'SecurePass123!');

    const orgRes = await request(server)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: `Overview Pin Org ${Date.now()}`, representatives: [alice.user.id] })
      .expect(201);
    const organizationId = orgRes.body.organization.id;

    const scheduledAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const meetingRes = await request(server)
      .post(`/api/organizations/${organizationId}/meetings`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ title: 'Pinned overview meeting', scheduled_at: scheduledAt })
      .expect(201);

    const from = new Date().toISOString();
    const to = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const calendarRes = await request(server)
      .get(`/api/calendar?organizationId=${organizationId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);

    expect(Array.isArray(calendarRes.body.events)).toBe(true);
    const meetingEvent = calendarRes.body.events.find((e) => e.meetingId === meetingRes.body.id);
    expect(meetingEvent).toBeTruthy();
    expect(meetingEvent.id).toMatch(/^meeting-/);

    const pinRes = await request(server)
      .put(`/api/organizations/${organizationId}/overview-pin`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ eventId: meetingEvent.id })
      .expect(200);

    expect(pinRes.body.overviewPinnedEventId).toBe(meetingEvent.id);
    expect(pinRes.body.overviewPinnedEvent).toBeTruthy();
    expect(pinRes.body.overviewPinnedEvent.title).toContain('Pinned overview meeting');

    const orgDetail = await request(server)
      .get(`/api/organizations/${organizationId}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);

    expect(orgDetail.body.organization.overviewPinnedEventId).toBe(meetingEvent.id);
    expect(orgDetail.body.organization.overviewPinnedEvent).toBeTruthy();
    expect(orgDetail.body.organization.overviewPinnedEvent.title).toContain('Pinned overview meeting');

    await request(server)
      .put(`/api/organizations/${organizationId}/overview-pin`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ eventId: null })
      .expect(200);

    const cleared = await request(server)
      .get(`/api/organizations/${organizationId}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);

    expect(cleared.body.organization.overviewPinnedEventId).toBeNull();
    expect(cleared.body.organization.overviewPinnedEvent).toBeNull();
  });
});
