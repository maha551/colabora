const request = require('supertest');
const path = require('path');
const fs = require('fs');
const {
  authenticateUser,
  createTestDocument,
  createTestUser,
  safeDeleteTestDatabase,
  acceptDocumentCollaboratorInvitationForUser,
  addActiveDocumentCollaboratorForTests,
} = require('../utils/test-helpers');

let server;
let authToken;
let testUserId;
let testDocumentId;
let testDbPath;
let otherUser;

describe('Collaborators API Integration Tests', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3017, returnServer: true });

    await new Promise(resolve => setTimeout(resolve, 3000));

    authToken = await authenticateUser(server, 'alice@example.com', 'SecurePass123!');
    
    const loginResponse = await request(server)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'SecurePass123!' });
    testUserId = loginResponse.body.user.id;

    const document = await createTestDocument(server, authToken, {
      title: 'Collaborator Test Document',
      ownershipType: 'personal'
    });
    testDocumentId = document.id;

    // Create another user for testing
    const db = server.app.locals.db;
    otherUser = await createTestUser(db, {
      name: 'Test Collaborator',
      email: 'collaborator@test.com',
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

  describe('POST /api/documents/:id/collaborators', () => {
    test('should add collaborator by userId', async () => {
      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/collaborators`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ userId: otherUser.id })
        .expect(201);

      expect(response.body.invitationSent).toBe(true);
      expect(response.body.invitation).toBeDefined();
      expect(response.body.invitation.email).toBe(otherUser.email);

      await acceptDocumentCollaboratorInvitationForUser(server, testDocumentId, otherUser);

      const collabToken = await authenticateUser(server, otherUser.email, 'TestPass123!');
      const accessResponse = await request(server)
        .get(`/api/documents/${testDocumentId}`)
        .set('Authorization', `Bearer ${collabToken}`)
        .expect(200);

      expect(accessResponse.body.document.id).toBe(testDocumentId);
    });

    test('should add collaborator by email', async () => {
      // Create a new document for this test
      const doc = await createTestDocument(server, authToken, {
        title: 'Email Collaborator Test'
      });

      const response = await request(server)
        .post(`/api/documents/${doc.id}/collaborators`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ email: otherUser.email })
        .expect(201);

      expect(response.body.invitationSent).toBe(true);
      expect(response.body.invitation.email).toBe(otherUser.email);

      await acceptDocumentCollaboratorInvitationForUser(server, doc.id, otherUser);
    });

    test('should reject adding collaborator to organizational document', async () => {
      // Create organizational document
      const adminToken = await authenticateUser(server, 'admin@colabora.local', 'AdminSecurePass123!');
      
      const orgResponse = await request(server)
        .post('/api/admin/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Org',
          representatives: [testUserId]
        });

      const orgId = orgResponse.body.organization.id;

      const orgDoc = await createTestDocument(server, authToken, {
        title: 'Organizational Document',
        ownershipType: 'organizational',
        organizationId: orgId
      });

      const response = await request(server)
        .post(`/api/documents/${orgDoc.id}/collaborators`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ userId: otherUser.id })
        .expect(403);

      expect(response.body.error).toContain('managed automatically');
    });

    test('should reject adding duplicate collaborator', async () => {
      // Use a fresh document so the first add is not already present.
      const dupDoc = await createTestDocument(server, authToken, { title: 'Duplicate Collaborator Test' });

      await addActiveDocumentCollaboratorForTests(server, dupDoc.id, authToken, otherUser);

      // Try to add again after the user is already an active collaborator
      const response = await request(server)
        .post(`/api/documents/${dupDoc.id}/collaborators`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ userId: otherUser.id })
        .expect(400);

      expect(response.body.error).toContain('already a collaborator');
    });

    test('should reject adding owner as collaborator', async () => {
      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/collaborators`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ userId: testUserId })
        .expect(400);

      expect(response.body.error).toContain('already the document owner');
    });

    test('should reject adding collaborator without permission', async () => {
      // Create document as Alice
      const aliceDoc = await createTestDocument(server, authToken, {
        title: 'Alice Document'
      });

      // Login as Bob
      const bobToken = await authenticateUser(server, 'bob@example.com', 'SecurePass123!');

      // Bob should not be able to add collaborators to Alice's document
      const response = await request(server)
        .post(`/api/documents/${aliceDoc.id}/collaborators`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ userId: otherUser.id })
        .expect(403);

      expect(response.body.error).toContain('Only document owner or admin');
    });

    test('should reject request without authentication', async () => {
      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/collaborators`)
        .send({ userId: otherUser.id })
        .expect(401);
    });
  });

  describe('DELETE /api/documents/:id/collaborators/:userId', () => {
    test('should remove collaborator from document', async () => {
      // Use a fresh document so the add is the first for this collaborator.
      const remDoc = await createTestDocument(server, authToken, { title: 'Remove Collaborator Test' });

      await addActiveDocumentCollaboratorForTests(server, remDoc.id, authToken, otherUser);

      // Then remove them
      const response = await request(server)
        .delete(`/api/documents/${remDoc.id}/collaborators/${otherUser.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.message).toContain('removed successfully');
    });

    test('should reject removing collaborator from organizational document', async () => {
      const adminToken = await authenticateUser(server, 'admin@colabora.local', 'AdminSecurePass123!');
      
      const orgResponse = await request(server)
        .post('/api/admin/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Org 2',
          representatives: [testUserId]
        });

      const orgId = orgResponse.body.organization.id;

      const orgDoc = await createTestDocument(server, authToken, {
        title: 'Organizational Document 2',
        ownershipType: 'organizational',
        organizationId: orgId
      });

      const response = await request(server)
        .delete(`/api/documents/${orgDoc.id}/collaborators/${otherUser.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(response.body.error).toContain('managed automatically');
    });

    test('should reject removing collaborator without permission', async () => {
      const aliceDoc = await createTestDocument(server, authToken, {
        title: 'Alice Document 2'
      });

      const bobToken = await authenticateUser(server, 'bob@example.com', 'SecurePass123!');

      const response = await request(server)
        .delete(`/api/documents/${aliceDoc.id}/collaborators/${otherUser.id}`)
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(403);

      expect(response.body.error).toContain('Only document owner or admin');
    });

    test('should reject request without authentication', async () => {
      const response = await request(server)
        .delete(`/api/documents/${testDocumentId}/collaborators/${otherUser.id}`)
        .expect(401);
    });
  });
});
