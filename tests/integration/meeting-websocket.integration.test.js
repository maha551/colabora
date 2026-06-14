const io = require('socket.io-client');
const request = require('supertest');
const { addActiveOrganizationMemberForTests } = require('../utils/test-helpers');
const TEST_PORT = 3037;

let server;
let listeningPort;

async function login(email, password) {
  const res = await request(server).post('/api/auth/login').send({ email, password }).expect(200);
  return { token: res.body.token, user: res.body.user };
}

function connectSocket(token) {
  return io(`http://127.0.0.1:${listeningPort}`, {
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
  });
}

function waitForSocketEvent(socket, eventName, predicate, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);

    const handler = (payload) => {
      if (!predicate || predicate(payload)) {
        cleanup();
        resolve(payload);
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off(eventName, handler);
    };

    socket.on(eventName, handler);
  });
}

async function startListeningServer(port) {
  const startApplication = require('../../server/bootstrap').startApplication;
  const webSocketManager = require('../../server/modules/websocket');
  const testServer = await startApplication({ port, returnServer: true });
  await new Promise((resolve, reject) => {
    testServer.listen(port, '127.0.0.1', (err) => (err ? reject(err) : resolve()));
  });
  await webSocketManager.initialize(testServer, null, testServer.app.locals.knex);
  return testServer;
}

describe('Meeting WebSocket integration', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';

    listeningPort = TEST_PORT;
    server = await startListeningServer(listeningPort);

    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => {
        if (typeof server.stop === 'function') {
          server.stop(() => {
            server.close(() => resolve());
          });
        } else {
          server.close(() => resolve());
        }
      });
    }
  });

  test('subscribe-meeting succeeds for org member', async () => {
    const admin = await login('admin@colabora.local', 'AdminSecurePass123!');
    const alice = await login('alice@example.com', 'SecurePass123!');

    const orgRes = await request(server)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'WS Subscribe Org', representatives: [alice.user.id] })
      .expect(201);

    const meetingRes = await request(server)
      .post(`/api/organizations/${orgRes.body.organization.id}/meetings`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ title: 'WS subscribe meeting', scheduled_at: new Date().toISOString() })
      .expect(201);

    const socket = connectSocket(alice.token);
    await new Promise((resolve, reject) => {
      socket.on('connect', resolve);
      socket.on('connect_error', reject);
    });

    socket.emit('subscribe-meeting', meetingRes.body.id);

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(socket.connected).toBe(true);

    socket.disconnect();
  });

  test('subscribe-meeting denied for non-member', async () => {
    const admin = await login('admin@colabora.local', 'AdminSecurePass123!');
    const alice = await login('alice@example.com', 'SecurePass123!');
    const bob = await login('bob@example.com', 'SecurePass123!');

    const orgRes = await request(server)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'WS Deny Org', representatives: [alice.user.id] })
      .expect(201);

    const meetingRes = await request(server)
      .post(`/api/organizations/${orgRes.body.organization.id}/meetings`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ title: 'WS deny meeting', scheduled_at: new Date().toISOString() })
      .expect(201);

    const socket = connectSocket(bob.token);
    await new Promise((resolve, reject) => {
      socket.on('connect', resolve);
      socket.on('connect_error', reject);
    });

    const errorPromise = waitForSocketEvent(
      socket,
      'subscription-error',
      (payload) => payload.type === 'meeting' && payload.id === meetingRes.body.id
    );

    socket.emit('subscribe-meeting', meetingRes.body.id);

    const errorPayload = await errorPromise;
    expect(errorPayload.error).toBe('Access denied');

    socket.disconnect();
  });

  test('finalize broadcasts meeting-update minutes-finalized', async () => {
    const admin = await login('admin@colabora.local', 'AdminSecurePass123!');
    const alice = await login('alice@example.com', 'SecurePass123!');

    const orgRes = await request(server)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'WS Finalize Org', representatives: [alice.user.id] })
      .expect(201);
    const organizationId = orgRes.body.organization.id;

    const meetingRes = await request(server)
      .post(`/api/organizations/${organizationId}/meetings`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ title: 'WS finalize meeting', scheduled_at: new Date().toISOString() })
      .expect(201);
    const meetingId = meetingRes.body.id;

    const socket = connectSocket(alice.token);
    await new Promise((resolve, reject) => {
      socket.on('connect', resolve);
      socket.on('connect_error', reject);
    });

    socket.emit('subscribe-meeting', meetingId);
    await new Promise((resolve) => setTimeout(resolve, 300));

    const updatePromise = waitForSocketEvent(
      socket,
      'meeting-update',
      (payload) => payload.eventType === 'minutes-finalized'
    );

    await request(server)
      .post(`/api/organizations/${organizationId}/meetings/${meetingId}/minutes/finalize`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);

    const update = await updatePromise;
    expect(update.eventType).toBe('minutes-finalized');
    expect(update.data?.finalizedAt).toBeDefined();

    socket.disconnect();
  });

  test('add moderator broadcasts meeting-update moderator-added', async () => {
    const admin = await login('admin@colabora.local', 'AdminSecurePass123!');
    const alice = await login('alice@example.com', 'SecurePass123!');
    const bob = await login('bob@example.com', 'SecurePass123!');

    const orgRes = await request(server)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'WS Moderator Org', representatives: [alice.user.id] })
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
      .send({ title: 'WS moderator meeting', scheduled_at: new Date().toISOString() })
      .expect(201);
    const meetingId = meetingRes.body.id;

    const socket = connectSocket(alice.token);
    await new Promise((resolve, reject) => {
      socket.on('connect', resolve);
      socket.on('connect_error', reject);
    });

    socket.emit('subscribe-meeting', meetingId);
    await new Promise((resolve) => setTimeout(resolve, 300));

    const updatePromise = waitForSocketEvent(
      socket,
      'meeting-update',
      (payload) => payload.eventType === 'moderator-added'
        && payload.data?.userId === bob.user.id
    );

    await request(server)
      .post(`/api/organizations/${organizationId}/meetings/${meetingId}/moderators`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ user_id: bob.user.id })
      .expect(201);

    const update = await updatePromise;
    expect(update.eventType).toBe('moderator-added');
    expect(update.data.userId).toBe(bob.user.id);

    socket.disconnect();
  });
});
