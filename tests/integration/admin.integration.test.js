const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { authenticateUser, createTestUser, safeDeleteTestDatabase, acceptOrganizationInvitationForUser } = require('../utils/test-helpers');

let server;
let adminToken;
let testUserId;
let testDbPath;

describe('Admin API Integration Tests', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3019, returnServer: true });

    await new Promise(resolve => setTimeout(resolve, 3000));

    adminToken = await authenticateUser(server, 'admin@colabora.local', 'AdminSecurePass123!');
    
    const loginResponse = await request(server)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'SecurePass123!' });
    testUserId = loginResponse.body.user.id;
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

  describe('GET /api/admin/dashboard', () => {
    test('should retrieve admin dashboard stats', async () => {
      const response = await request(server)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Responses are camelCased by the transformResponse middleware.
      expect(response.body).toHaveProperty('stats');
      expect(response.body.stats).toHaveProperty('totalUsers');
      expect(response.body.stats).toHaveProperty('totalOrganizations');
      expect(response.body.stats).toHaveProperty('totalDocuments');
      expect(response.body.stats).toHaveProperty('activeOrganizations');
    });

    test('should reject access without admin role', async () => {
      const userToken = await authenticateUser(server, 'alice@example.com', 'SecurePass123!');

      const response = await request(server)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.error.toLowerCase()).toContain('admin');
    });
  });

  describe('POST /api/admin/organizations', () => {
    test('should create organization as admin', async () => {
      const orgData = {
        name: 'Admin Created Organization',
        description: 'Organization created by admin',
        representatives: [testUserId],
        membershipPolicy: 'invitation',
        votingThreshold: 0.6
      };

      const response = await request(server)
        .post('/api/admin/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(orgData)
        .expect(201);

      expect(response.body).toHaveProperty('organization');
      expect(response.body.organization.name).toBe(orgData.name);
      expect(response.body.organization.representatives).toContain(testUserId);
    });

    test('should create organization with email invitations', async () => {
      const orgData = {
        name: 'Email Invite Organization',
        description: 'Organization with email invitations',
        representativeEmails: ['rep1@test.com', 'rep2@test.com'],
        membershipPolicy: 'invitation',
        votingThreshold: 0.5
      };

      const response = await request(server)
        .post('/api/admin/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(orgData)
        .expect(201);

      expect(response.body.organization.name).toBe(orgData.name);
      expect(response.body.message).toContain('invitations sent');
    });

    test('should reject organization creation without admin role', async () => {
      const userToken = await authenticateUser(server, 'alice@example.com', 'SecurePass123!');

      const response = await request(server)
        .post('/api/admin/organizations')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Unauthorized Org',
          representatives: [testUserId]
        })
        .expect(403);
    });
  });

  describe('GET /api/admin/organizations', () => {
    test('should list all organizations', async () => {
      const response = await request(server)
        .get('/api/admin/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('organizations');
      expect(Array.isArray(response.body.organizations)).toBe(true);
    });

    test('should include organization metadata', async () => {
      const response = await request(server)
        .get('/api/admin/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      if (response.body.organizations.length > 0) {
        const org = response.body.organizations[0];
        expect(org).toHaveProperty('id');
        expect(org).toHaveProperty('name');
        expect(org).toHaveProperty('memberCount');
        expect(org).toHaveProperty('documentCount');
      }
    });
  });

  describe('PATCH /api/admin/organizations/:id/status', () => {
    test('should activate organization', async () => {
      // Create organization first
      const orgResponse = await request(server)
        .post('/api/admin/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Status Test Org',
          representatives: [testUserId]
        })
        .expect(201);

      const orgId = orgResponse.body.organization.id;

      const response = await request(server)
        .patch(`/api/admin/organizations/${orgId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: true })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should deactivate organization', async () => {
      const orgResponse = await request(server)
        .post('/api/admin/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Deactivate Test Org',
          representatives: [testUserId]
        })
        .expect(201);

      const orgId = orgResponse.body.organization.id;

      const response = await request(server)
        .patch(`/api/admin/organizations/${orgId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/admin/users', () => {
    test('should list all users', async () => {
      const response = await request(server)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('users');
      expect(Array.isArray(response.body.users)).toBe(true);
    });

    test('should include user metadata', async () => {
      const response = await request(server)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      if (response.body.users.length > 0) {
        const user = response.body.users[0];
        expect(user).toHaveProperty('id');
        expect(user).toHaveProperty('name');
        expect(user).toHaveProperty('email');
        expect(user).toHaveProperty('organizationsCount');
      }
    });
  });

  describe('POST /api/admin/promote-admin/:userId', () => {
    test('should promote user to admin', async () => {
      const db = server.app.locals.db;
      const regularUser = await createTestUser(db, {
        name: 'Regular User',
        email: 'regular@test.com',
        password: 'TestPass123!',
        role: 'user'
      });

      const response = await request(server)
        .post(`/api/admin/promote-admin/${regularUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.promotedUser.role).toBe('admin');
    });

    test('should reject promoting already admin user', async () => {
      const db = server.app.locals.db;
      const adminUser = await db('users').where('role', 'admin').first();
      const response = await request(server)
        .post(`/api/admin/promote-admin/${adminUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.error).toContain('already an admin');
    });

    test('should reject promotion without admin role', async () => {
      const userToken = await authenticateUser(server, 'alice@example.com', 'SecurePass123!');

      await request(server)
        .post(`/api/admin/promote-admin/${testUserId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });

  describe('Admin organization member management', () => {
    test('admin can add and remove member without being representative', async () => {
      const db = server.app.locals.db;
      const memberUser = await createTestUser(db, {
        name: 'Future Member',
        email: 'futuremember@test.com',
        password: 'TestPass123!',
        role: 'user',
      });

      const orgResponse = await request(server)
        .post('/api/admin/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Admin Member Test Org', representatives: [testUserId] })
        .expect(201);

      const orgId = orgResponse.body.organization.id;

      await request(server)
        .post(`/api/admin/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: memberUser.id })
        .expect(200);

      await acceptOrganizationInvitationForUser(server, orgId, memberUser);

      const detail = await request(server)
        .get(`/api/admin/organizations/${orgId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(detail.body.organization.members.some((m) => m.userId === memberUser.id)).toBe(true);

      await request(server)
        .delete(`/api/admin/organizations/${orgId}/members/${memberUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('POST /api/admin/organizations/:organizationId/representatives/invite', () => {
    test('should invite representatives via email', async () => {
      // Create organization first
      const orgResponse = await request(server)
        .post('/api/admin/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Rep Invite Test Org',
          representatives: [testUserId]
        })
        .expect(201);

      const orgId = orgResponse.body.organization.id;

      const response = await request(server)
        .post(`/api/admin/organizations/${orgId}/representatives/invite`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ emails: ['rep@test.com'] })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.invitations).toBeGreaterThan(0);
    });
  });
});

