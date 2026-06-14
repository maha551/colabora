const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { authenticateUser, createTestUser, safeDeleteTestDatabase, acceptOrganizationInvitationForUser } = require('../utils/test-helpers');

let server;
let adminToken;
let repToken;
let testUserId;
let orgId;
let testDbPath;
let newMemberUser;

describe('Organization Members API Integration Tests', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3018, returnServer: true });

    await new Promise(resolve => setTimeout(resolve, 3000));

    adminToken = await authenticateUser(server, 'admin@colabora.local', 'AdminSecurePass123!');
    
    const loginResponse = await request(server)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'SecurePass123!' });
    testUserId = loginResponse.body.user.id;

    // Create organization
    const orgResponse = await request(server)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Member Test Organization',
        description: 'Organization for testing member management',
        representatives: [testUserId]
      });

    orgId = orgResponse.body.organization.id;

    // Login as representative
    repToken = await authenticateUser(server, 'alice@example.com', 'SecurePass123!');

    // Create a user to add as member
    const db = server.app.locals.db;
    newMemberUser = await createTestUser(db, {
      name: 'New Member',
      email: 'newmember@test.com',
      password: 'TestPass123!'
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => {
        server.close((err) => {
          if (err) console.warn('Error closing server:', err.message);
          resolve();
        });
      });
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      await safeDeleteTestDatabase(testDbPath);
    } catch (error) {
      console.warn('Could not clean up test database:', error.message);
    }
  });

  describe('POST /api/organizations/:organizationId/members', () => {
    test('should send membership invitation when adding by user id', async () => {
      const response = await request(server)
        .post(`/api/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${repToken}`)
        .send({ userId: newMemberUser.id, status: 'active' })
        .expect(200);

      expect(response.body.invitationSent).toBe(true);
      expect(response.body.invitation).toBeDefined();
      expect(response.body.invitation.email).toBe(newMemberUser.email);

      await acceptOrganizationInvitationForUser(server, orgId, newMemberUser);

      const orgResponse = await request(server)
        .get(`/api/organizations/${orgId}`)
        .set('Authorization', `Bearer ${repToken}`)
        .expect(200);

      const membership = orgResponse.body.organization.members.find(m => m.userId === newMemberUser.id);
      expect(membership).toBeDefined();
      expect(membership.status).toBe('active');
    });

    test('should reject inviting user who is already an active member', async () => {
      const response = await request(server)
        .post(`/api/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${repToken}`)
        .send({ userId: newMemberUser.id, status: 'active' })
        .expect(400);

      expect(response.body.error).toContain('already a member');
    });

    test('should reject adding member without permission', async () => {
      const bobToken = await authenticateUser(server, 'bob@example.com', 'SecurePass123!');
      const newUser = await createTestUser(server.app.locals.db, {
        name: 'Another User',
        email: 'another@test.com'
      });

      const response = await request(server)
        .post(`/api/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ userId: newUser.id, status: 'active' })
        .expect(403);

      expect(response.body.error).toMatch(/member of this organization|representatives|permission/i);
    });

    test('should reject request without authentication', async () => {
      const response = await request(server)
        .post(`/api/organizations/${orgId}/members`)
        .send({ userId: newMemberUser.id })
        .expect(401);
    });
  });

  describe('POST /api/organizations/:organizationId/members/invite', () => {
    test('should invite member by email', async () => {
      const response = await request(server)
        .post(`/api/organizations/${orgId}/members/invite`)
        .set('Authorization', `Bearer ${repToken}`)
        .send({ emails: ['invited@test.com'] })
        .expect(200);

      expect(response.body).toHaveProperty('invitations');
      expect(response.body.invitations).toBeGreaterThan(0);
    });

    test('should invite multiple members', async () => {
      const response = await request(server)
        .post(`/api/organizations/${orgId}/members/invite`)
        .set('Authorization', `Bearer ${repToken}`)
        .send({ emails: ['member1@test.com', 'member2@test.com'] })
        .expect(200);

      expect(response.body.invitations).toBeGreaterThanOrEqual(1);
    });

    test('should reject invitation without permission', async () => {
      const bobToken = await authenticateUser(server, 'bob@example.com', 'SecurePass123!');

      const response = await request(server)
        .post(`/api/organizations/${orgId}/members/invite`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ emails: ['test@example.com'] })
        .expect(403);

      expect(response.body.error).toMatch(/member of this organization|permission/i);
    });
  });

  describe('POST /api/organizations/invitations/:token/accept', () => {
    test('should accept organization invitation', async () => {
      // First create an invitation
      const inviteResponse = await request(server)
        .post(`/api/organizations/${orgId}/members/invite`)
        .set('Authorization', `Bearer ${repToken}`)
        .send({ emails: ['accepttest@test.com'] })
        .expect(200);

      // Get the invitation token from database
      const db = server.app.locals.db;
      const invitation = await db('organization_invitations')
        .select('invitation_token')
        .where({ email: 'accepttest@test.com', organization_id: orgId })
        .first();

      if (invitation) {
        // Create a user for accepting
        const acceptingUser = await createTestUser(db, {
          name: 'Accepting User',
          email: 'accepttest@test.com',
          password: 'TestPass123!'
        });

        const userToken = await authenticateUser(server, 'accepttest@test.com', 'TestPass123!');

        const response = await request(server)
          .post(`/api/organizations/invitations/${invitation.invitation_token}/accept`)
          .set('Authorization', `Bearer ${userToken}`)
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('organization');
      }
    });

    test('should reject invalid invitation token', async () => {
      const fakeToken = 'invalid-token-12345';
      const response = await request(server)
        .post(`/api/organizations/invitations/${fakeToken}/accept`)
        .set('Authorization', `Bearer ${repToken}`)
        .expect(404);

      expect(response.body.error).toContain('not found');
    });

    test('should promote existing member to representative when accepting representative invitation', async () => {
      await request(server)
        .post(`/api/admin/organizations/${orgId}/representatives/invite`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ emails: ['newmember@test.com'] })
        .expect(200);

      const db = server.app.locals.db;
      const invitation = await db('organization_invitations')
        .select('invitation_token')
        .where({
          organization_id: orgId,
          email: 'newmember@test.com',
          invitation_type: 'representative',
          status: 'pending'
        })
        .orderBy('created_at', 'desc')
        .first();

      expect(invitation).toBeDefined();

      const memberToken = await authenticateUser(server, 'newmember@test.com', 'TestPass123!');

      const response = await request(server)
        .post(`/api/organizations/invitations/${invitation.invitation_token}/accept`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.alreadyMember).toBe(true);
      expect(response.body.invitationType).toBe('representative');

      const repRow = await db('organization_representatives')
        .where({
          organization_id: orgId,
          user_id: newMemberUser.id,
          status: 'active'
        })
        .first();

      expect(repRow).toBeDefined();
    });
  });

  describe('DELETE /api/organizations/:organizationId/members/:userId', () => {
    test('should remove member from organization', async () => {
      // First add a member
      const memberToRemove = await createTestUser(server.app.locals.db, {
        name: 'Member To Remove',
        email: 'toremove@test.com'
      });

      await request(server)
        .post(`/api/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${repToken}`)
        .send({ userId: memberToRemove.id, status: 'active' })
        .expect(200);

      await acceptOrganizationInvitationForUser(server, orgId, memberToRemove);

      // Then remove them
      const response = await request(server)
        .delete(`/api/organizations/${orgId}/members/${memberToRemove.id}`)
        .set('Authorization', `Bearer ${repToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should reject removing member without permission', async () => {
      const bobToken = await authenticateUser(server, 'bob@example.com', 'SecurePass123!');

      const response = await request(server)
        .delete(`/api/organizations/${orgId}/members/${newMemberUser.id}`)
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(403);

      expect(response.body.error).toMatch(/member of this organization|representatives|permission/i);
    });
  });
});

