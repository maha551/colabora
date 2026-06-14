const request = require('supertest');
const { addActiveOrganizationMemberForTests } = require('../utils/test-helpers');

let server;

async function login(email, password) {
  const res = await request(server)
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);
  return res.body;
}

async function createOrgWithMeeting(adminToken, aliceUserId, meetingTitle = 'Protocol meeting') {
  const orgRes = await request(server)
    .post('/api/admin/organizations')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: `Meeting Protocol Org ${Date.now()}`,
      description: 'Protocol regression org',
      representatives: [aliceUserId],
    })
    .expect(201);

  const organizationId = orgRes.body.organization.id;

  const alice = await login('alice@example.com', 'SecurePass123!');
  const meetingRes = await request(server)
    .post(`/api/organizations/${organizationId}/meetings`)
    .set('Authorization', `Bearer ${alice.token}`)
    .send({
      title: meetingTitle,
      scheduled_at: new Date().toISOString(),
    })
    .expect(201);

  return { organizationId, meetingId: meetingRes.body.id, alice };
}

describe('Meetings protocol integration', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.MINUTES_ARCHIVE_ENABLED = 'true';
    process.env.PG_POOL_MAX = '10';

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3001, returnServer: true });

    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    if (server) {
      if (typeof server.stop === 'function') {
        await new Promise((resolve) => server.stop(resolve));
      }
      await new Promise((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  test('update meeting rejects invalid scheduled_at', async () => {
    const admin = await login('admin@colabora.local', 'AdminSecurePass123!');
    const alice = await login('alice@example.com', 'SecurePass123!');

    const orgRes = await request(server)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: 'Meeting Validation Org',
        description: 'Validation checks',
        representatives: [alice.user.id],
      })
      .expect(201);

    const organizationId = orgRes.body.organization.id;

    const meetingRes = await request(server)
      .post(`/api/organizations/${organizationId}/meetings`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({
        title: 'Weekly sync',
        scheduled_at: new Date().toISOString(),
      })
      .expect(201);

    const meetingId = meetingRes.body.id;

    const badUpdate = await request(server)
      .put(`/api/organizations/${organizationId}/meetings/${meetingId}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ scheduled_at: 'not-a-date' })
      .expect(400);

    expect(badUpdate.body.code).toBe('VALIDATION_ERROR');
  });

  test('moderator add/remove validates membership and existence', async () => {
    const admin = await login('admin@colabora.local', 'AdminSecurePass123!');
    const alice = await login('alice@example.com', 'SecurePass123!');

    const orgRes = await request(server)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: 'Meeting Moderators Org',
        description: 'Moderator checks',
        representatives: [alice.user.id],
      })
      .expect(201);
    const organizationId = orgRes.body.organization.id;

    const meetingRes = await request(server)
      .post(`/api/organizations/${organizationId}/meetings`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({
        title: 'Moderators meeting',
        scheduled_at: new Date().toISOString(),
      })
      .expect(201);
    const meetingId = meetingRes.body.id;

    await request(server)
      .post(`/api/organizations/${organizationId}/meetings/${meetingId}/moderators`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ user_id: 'missing-user-id' })
      .expect(404);

    const outsiderRegistration = await request(server)
      .post('/api/auth/register')
      .send(require('../utils/test-helpers').withLegalConsent({
        name: 'Moderator Outsider',
        email: 'moderator.outsider@test.com',
        password: 'OutsiderPass123!',
      }))
      .expect(201);

    await request(server)
      .post(`/api/organizations/${organizationId}/meetings/${meetingId}/moderators`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ user_id: outsiderRegistration.body.user.id })
      .expect(400);

    await request(server)
      .post(`/api/organizations/${organizationId}/members/invite`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ emails: ['moderator.member@test.com'] })
      .expect(200);

    const invitedRegistration = await request(server)
      .post('/api/auth/register')
      .send(require('../utils/test-helpers').withLegalConsent({
        name: 'Moderator Member',
        email: 'moderator.member@test.com',
        password: 'MemberPass123!',
      }))
      .expect(201);

    const addModeratorRes = await request(server)
      .post(`/api/organizations/${organizationId}/meetings/${meetingId}/moderators`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ user_id: invitedRegistration.body.user.id })
      .expect(201);

    expect(addModeratorRes.body.source).toBe('invited');

    await request(server)
      .delete(`/api/organizations/${organizationId}/meetings/${meetingId}/moderators/${invitedRegistration.body.user.id}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(204);

    await request(server)
      .delete(`/api/organizations/${organizationId}/meetings/${meetingId}/moderators/${invitedRegistration.body.user.id}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(404);
  });

  test('meeting vote options preserve input order', async () => {
    const admin = await login('admin@colabora.local', 'AdminSecurePass123!');
    const alice = await login('alice@example.com', 'SecurePass123!');

    const orgRes = await request(server)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: 'Meeting Vote Ordering Org',
        description: 'Vote ordering checks',
        representatives: [alice.user.id],
      })
      .expect(201);
    const organizationId = orgRes.body.organization.id;

    const meetingRes = await request(server)
      .post(`/api/organizations/${organizationId}/meetings`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({
        title: 'Voting meeting',
        scheduled_at: new Date().toISOString(),
      })
      .expect(201);
    const meetingId = meetingRes.body.id;

    const voteRes = await request(server)
      .post(`/api/organizations/${organizationId}/meetings/${meetingId}/votes`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({
        title: 'Priority',
        options: [{ label: 'Third' }, { label: 'First' }, { label: 'Second' }],
      })
      .expect(201);

    const voteId = voteRes.body.id;
    const getVoteRes = await request(server)
      .get(`/api/organizations/${organizationId}/meetings/${meetingId}/votes/${voteId}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);

    const labels = (getVoteRes.body.options || []).map((o) => o.label);
    expect(labels).toEqual(['Third', 'First', 'Second']);
  });

  test('archive-backed timeline returns entityVersion for protocol entities', async () => {
    const admin = await login('admin@colabora.local', 'AdminSecurePass123!');
    const alice = await login('alice@example.com', 'SecurePass123!');

    const orgRes = await request(server)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: 'Meeting Archive Org',
        description: 'Archive checks',
        representatives: [alice.user.id],
      })
      .expect(201);
    const organizationId = orgRes.body.organization.id;

    const meetingRes = await request(server)
      .post(`/api/organizations/${organizationId}/meetings`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({
        title: 'Archive timeline meeting',
        scheduled_at: new Date().toISOString(),
      })
      .expect(201);
    const meetingId = meetingRes.body.id;

    await request(server)
      .post(`/api/organizations/${organizationId}/meetings/${meetingId}/minutes/events`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({
        eventType: 'document_created',
        payload: { title: 'Archived linked doc' },
      })
      .expect(201);

    const timelineRes = await request(server)
      .get(`/api/organizations/${organizationId}/meetings/${meetingId}/minutes/timeline`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);

    const docCreated = (timelineRes.body.items || []).find((item) => item.type === 'event' && item.eventType === 'document_created');
    expect(docCreated).toBeTruthy();
    expect(typeof docCreated.entityVersion).toBe('string');
    expect(docCreated.payload?.documentId).toBeTruthy();
  });

  describe('minutes finalize / unfinalize', () => {
    test('moderator can finalize minutes', async () => {
      const admin = await login('admin@colabora.local', 'AdminSecurePass123!');
      const alice = await login('alice@example.com', 'SecurePass123!');
      const { organizationId, meetingId } = await createOrgWithMeeting(admin.token, alice.user.id, 'Finalize happy path');

      const finalizeRes = await request(server)
        .post(`/api/organizations/${organizationId}/meetings/${meetingId}/minutes/finalize`)
        .set('Authorization', `Bearer ${alice.token}`)
        .expect(200);

      expect(finalizeRes.body.finalizedAt).toBeDefined();

      const meetingRes = await request(server)
        .get(`/api/organizations/${organizationId}/meetings/${meetingId}`)
        .set('Authorization', `Bearer ${alice.token}`)
        .expect(200);

      expect(meetingRes.body.minutesFinalizedAt || meetingRes.body.minutes_finalized_at).toBeDefined();

      const minutesDocumentId = meetingRes.body.minutesDocumentId || meetingRes.body.minutes_document_id;
      expect(minutesDocumentId).toBeTruthy();
      const docRes = await request(server)
        .get(`/api/documents/${minutesDocumentId}`)
        .set('Authorization', `Bearer ${alice.token}`)
        .expect(200);
      expect(docRes.body.document.documentKind).toBe('meeting_minutes');
      expect(docRes.body.document.minutesFinalizedAt).toBeDefined();
    });

    test('non-moderator cannot finalize minutes', async () => {
      const admin = await login('admin@colabora.local', 'AdminSecurePass123!');
      const alice = await login('alice@example.com', 'SecurePass123!');
      const bob = await login('bob@example.com', 'SecurePass123!');
      const { organizationId, meetingId } = await createOrgWithMeeting(admin.token, alice.user.id, 'Finalize forbidden');

      await addActiveOrganizationMemberForTests(server, organizationId, alice.token, {
        id: bob.user.id,
        email: 'bob@example.com',
        password: 'SecurePass123!',
      });

      const finalizeRes = await request(server)
        .post(`/api/organizations/${organizationId}/meetings/${meetingId}/minutes/finalize`)
        .set('Authorization', `Bearer ${bob.token}`)
        .expect(403);

      expect(finalizeRes.body.code).toBe('NOT_MODERATOR');
    });

    test('moderator can unfinalize minutes', async () => {
      const admin = await login('admin@colabora.local', 'AdminSecurePass123!');
      const alice = await login('alice@example.com', 'SecurePass123!');
      const { organizationId, meetingId } = await createOrgWithMeeting(admin.token, alice.user.id, 'Unfinalize happy path');

      await request(server)
        .post(`/api/organizations/${organizationId}/meetings/${meetingId}/minutes/finalize`)
        .set('Authorization', `Bearer ${alice.token}`)
        .expect(200);

      await request(server)
        .post(`/api/organizations/${organizationId}/meetings/${meetingId}/minutes/unfinalize`)
        .set('Authorization', `Bearer ${alice.token}`)
        .expect(200);

      const meetingRes = await request(server)
        .get(`/api/organizations/${organizationId}/meetings/${meetingId}`)
        .set('Authorization', `Bearer ${alice.token}`)
        .expect(200);

      expect(meetingRes.body.minutesFinalizedAt ?? meetingRes.body.minutes_finalized_at ?? null).toBeNull();

      const minutesDocumentId = meetingRes.body.minutesDocumentId || meetingRes.body.minutes_document_id;
      if (minutesDocumentId) {
        const docRes = await request(server)
          .get(`/api/documents/${minutesDocumentId}`)
          .set('Authorization', `Bearer ${alice.token}`)
          .expect(200);
        expect(docRes.body.document.minutesFinalizedAt).toBeNull();
      }
    });

    test('non-moderator cannot unfinalize minutes', async () => {
      const admin = await login('admin@colabora.local', 'AdminSecurePass123!');
      const alice = await login('alice@example.com', 'SecurePass123!');
      const bob = await login('bob@example.com', 'SecurePass123!');
      const { organizationId, meetingId } = await createOrgWithMeeting(admin.token, alice.user.id, 'Unfinalize forbidden');

      await addActiveOrganizationMemberForTests(server, organizationId, alice.token, {
        id: bob.user.id,
        email: 'bob@example.com',
        password: 'SecurePass123!',
      });

      await request(server)
        .post(`/api/organizations/${organizationId}/meetings/${meetingId}/minutes/finalize`)
        .set('Authorization', `Bearer ${alice.token}`)
        .expect(200);

      const unfinalizeRes = await request(server)
        .post(`/api/organizations/${organizationId}/meetings/${meetingId}/minutes/unfinalize`)
        .set('Authorization', `Bearer ${bob.token}`)
        .expect(403);

      expect(unfinalizeRes.body.code).toBe('NOT_ALLOWED');
    });
  });

  describe('post-finalize mutation guards', () => {
    test('brainstorm option after finalize returns 400', async () => {
      const admin = await login('admin@colabora.local', 'AdminSecurePass123!');
      const alice = await login('alice@example.com', 'SecurePass123!');
      const { organizationId, meetingId } = await createOrgWithMeeting(admin.token, alice.user.id, 'Brainstorm guard');

      const brainstormRes = await request(server)
        .post(`/api/organizations/${organizationId}/meetings/${meetingId}/minutes/events`)
        .set('Authorization', `Bearer ${alice.token}`)
        .send({ eventType: 'brainstorm_started', payload: { agendaItemId: null } })
        .expect(201);
      const brainstormEventId = brainstormRes.body.id;

      await request(server)
        .post(`/api/organizations/${organizationId}/meetings/${meetingId}/minutes/finalize`)
        .set('Authorization', `Bearer ${alice.token}`)
        .expect(200);

      const optionRes = await request(server)
        .post(`/api/organizations/${organizationId}/meetings/${meetingId}/brainstorm/options`)
        .set('Authorization', `Bearer ${alice.token}`)
        .send({ brainstormEventId, label: 'Late idea' })
        .expect(400);

      expect(optionRes.body.code).toBe('MINUTES_FINALIZED');
    });

    test('todo delete after finalize returns 400', async () => {
      const admin = await login('admin@colabora.local', 'AdminSecurePass123!');
      const alice = await login('alice@example.com', 'SecurePass123!');
      const bob = await login('bob@example.com', 'SecurePass123!');
      const { organizationId, meetingId } = await createOrgWithMeeting(admin.token, alice.user.id, 'Todo delete guard');

      await addActiveOrganizationMemberForTests(server, organizationId, alice.token, {
        id: bob.user.id,
        email: 'bob@example.com',
        password: 'SecurePass123!',
      });

      const todoRes = await request(server)
        .post(`/api/organizations/${organizationId}/meetings/${meetingId}/todos`)
        .set('Authorization', `Bearer ${alice.token}`)
        .send({
          title: 'Action item',
          due_date: '2026-12-31',
          responsible_user_id: bob.user.id,
        })
        .expect(201);

      await request(server)
        .post(`/api/organizations/${organizationId}/meetings/${meetingId}/minutes/finalize`)
        .set('Authorization', `Bearer ${alice.token}`)
        .expect(200);

      const deleteRes = await request(server)
        .delete(`/api/organizations/${organizationId}/meetings/${meetingId}/todos/${todoRes.body.id}`)
        .set('Authorization', `Bearer ${alice.token}`)
        .expect(400);

      expect(deleteRes.body.code).toBe('MINUTES_FINALIZED');
    });
  });
});

