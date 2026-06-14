const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { authenticateUser, createTestDocument, createTestParagraph, createTestProposal, safeDeleteTestDatabase } = require('../utils/test-helpers');

let server;
let authToken;
let testUserId;
let testDocumentId;
let testParagraphId;
let testProposalId;
let testDbPath;

describe('Activity API Integration Tests', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3013, returnServer: true });

    await new Promise(resolve => setTimeout(resolve, 3000));

    authToken = await authenticateUser(server, 'alice@example.com', 'SecurePass123!');
    
    const loginResponse = await request(server)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'SecurePass123!' });
    testUserId = loginResponse.body.user.id;

    const document = await createTestDocument(server, authToken);
    testDocumentId = document.id;

    const paragraph = await createTestParagraph(server, authToken, testDocumentId);
    testParagraphId = paragraph.id;

    const proposal = await createTestProposal(server, authToken, testDocumentId, testParagraphId);
    testProposalId = proposal.id;
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

  describe('GET /api/documents/:documentId/activity', () => {
    test('should retrieve activity feed for a document', async () => {
      // Create some activity
      await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: 'Test comment for activity' })
        .expect(201);

      await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ vote: 'PRO' })
        .expect(200);

      const response = await request(server)
        .get(`/api/documents/${testDocumentId}/activity`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('activities');
      expect(Array.isArray(response.body.activities)).toBe(true);
      expect(response.body.activities.length).toBeGreaterThan(0);
    });

    test('should include different activity types', async () => {
      const response = await request(server)
        .get(`/api/documents/${testDocumentId}/activity`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const activityTypes = response.body.activities.map(a => a.type);
      expect(activityTypes).toContain('proposal_created');
    });

    test('should respect anonymous voting in activity feed', async () => {
      // Create document with anonymous voting
      const doc = await createTestDocument(server, authToken, {
        title: 'Anonymous Voting Document',
        options: { votingAnonymous: true }
      });

      const para = await createTestParagraph(server, authToken, doc.id);
      const prop = await createTestProposal(server, authToken, doc.id, para.id);

      // Cast a vote
      await request(server)
        .post(`/api/documents/${doc.id}/paragraphs/${para.id}/proposals/${prop.id}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ vote: 'PRO' })
        .expect(200);

      const response = await request(server)
        .get(`/api/documents/${doc.id}/activity`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Check that vote activities hide user info when anonymous
      const voteActivities = response.body.activities.filter(a => a.type === 'vote_cast');
      if (voteActivities.length > 0) {
        // User info should be hidden for anonymous votes
        expect(voteActivities[0].userName).toBeUndefined();
      }
    });

    test('should reject access to document user does not have access to', async () => {
      // Create a document as Alice
      const aliceDoc = await createTestDocument(server, authToken, {
        title: 'Alice\'s Private Document'
      });

      // Login as Bob
      const bobToken = await authenticateUser(server, 'bob@example.com', 'SecurePass123!');

      // Try to access Alice's document
      const response = await request(server)
        .get(`/api/documents/${aliceDoc.id}/activity`)
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(403);

      expect(response.body.error).toContain('denied');
    });

    test('should reject request without authentication', async () => {
      const response = await request(server)
        .get(`/api/documents/${testDocumentId}/activity`)
        .expect(401);
    });
  });
});

