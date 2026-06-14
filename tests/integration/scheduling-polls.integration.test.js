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

describe('Scheduling polls integration (member)', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PG_POOL_MAX = '20';
    if (!server) {
      server = await require('../../server/bootstrap').startApplication({ port: 3004, returnServer: true });
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

  test('member poll CRUD and guest link on detail', async () => {
    const admin = await login('admin@colabora.local', 'AdminSecurePass123!');
    const alice = await login('alice@example.com', 'SecurePass123!');

    const orgRes = await request(server)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: `Scheduling CRUD ${Date.now()}`,
        representatives: [alice.user.id],
      })
      .expect(201);

    const organizationId = orgRes.body.organization.id;

    const pollRes = await request(server)
      .post(`/api/organizations/${organizationId}/scheduling-polls`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ title: 'CRUD poll' })
      .expect(201);

    const pollId = pollRes.body.poll.id;

    const listRes = await request(server)
      .get(`/api/organizations/${organizationId}/scheduling-polls`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);

    expect(listRes.body.polls.some((p) => p.id === pollId)).toBe(true);

    const linkRes = await request(server)
      .get(`/api/organizations/${organizationId}/scheduling-polls/${pollId}/guest-link`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);

    expect(linkRes.body.url).toMatch(/\/guest\/poll\//);
  });
});
