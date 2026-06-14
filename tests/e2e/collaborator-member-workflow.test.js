const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { authenticateUser, createTestDocument, createTestUser, safeDeleteTestDatabase, addActiveDocumentCollaboratorForTests, acceptDocumentCollaboratorInvitationForUser } = require('../utils/test-helpers');

let server;
let authToken;
let testUserId;
let testDbPath;

describe('Collaborator & Member Management Workflow E2E Tests', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3028, returnServer: true });

    await new Promise(resolve => setTimeout(resolve, 3000));

    authToken = await authenticateUser(server, 'alice@example.com', 'SecurePass123!');
    
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

  test('Complete collaborator workflow: create doc → add by userId → add by email → remove', async () => {
    // Create document
    const document = await createTestDocument(server, authToken, {
      title: 'Collaborator Workflow Document',
      ownershipType: 'personal'
    });

    // Create users
    const db = server.app.locals.db;
    const user1 = await createTestUser(db, {
      name: 'Collaborator 1',
      email: 'collab1@test.com',
      password: 'TestPass123!'
    });

    const user2 = await createTestUser(db, {
      name: 'Collaborator 2',
      email: 'collab2@test.com',
      password: 'TestPass123!'
    });

    // Add collaborator by userId
    await addActiveDocumentCollaboratorForTests(server, document.id, authToken, user1);

    // Add collaborator by email
    await request(server)
      .post(`/api/documents/${document.id}/collaborators`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ email: user2.email })
      .expect(201);
    await acceptDocumentCollaboratorInvitationForUser(server, document.id, user2);

    // Verify collaborators can access document
    const user1Token = await authenticateUser(server, 'collab1@test.com', 'TestPass123!');
    await request(server)
      .get(`/api/documents/${document.id}`)
      .set('Authorization', `Bearer ${user1Token}`)
      .expect(200);

    // Remove collaborator
    await request(server)
      .delete(`/api/documents/${document.id}/collaborators/${user1.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Verify removed collaborator cannot access
    await request(server)
      .get(`/api/documents/${document.id}`)
      .set('Authorization', `Bearer ${user1Token}`)
      .expect(404);
  });

  test('Complete member workflow: create org → invite member → accept invitation → auto-sync collaborators', async () => {
    const adminToken = await authenticateUser(server, 'admin@colabora.local', 'AdminSecurePass123!');
    const memberEmail = `newmember-${Date.now()}@test.com`;

    // Create organization
    const orgResponse = await request(server)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Member Workflow Org',
        representatives: [testUserId]
      });

    const orgId = orgResponse.body.organization.id;

    // Create organizational document
    const docResponse = await request(server)
      .post('/api/documents')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Org Document',
        ownershipType: 'organizational',
        organizationId: orgId
      });

    const docId = docResponse.body.document.id;

    // Create the invited user before sending the invite email
    const db = server.app.locals.db;
    await createTestUser(db, {
      name: 'New Member',
      email: memberEmail,
      password: 'TestPass123!'
    });

    // Invite member
    await request(server)
      .post(`/api/organizations/${orgId}/members/invite`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ emails: [memberEmail] })
      .expect(200);

    // Get invitation token
    const invitation = await db('organization_invitations')
      .select('invitation_token')
      .where({ email: memberEmail, organization_id: orgId })
      .first();

    if (invitation) {
      const memberToken = await authenticateUser(server, memberEmail, 'TestPass123!');

      // Accept invitation
      await request(server)
        .post(`/api/organizations/invitations/${invitation.invitation_token}/accept`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      // Verify member can access organizational document (auto-synced as collaborator)
      await request(server)
        .get(`/api/documents/${docId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);
    }
  });
});

