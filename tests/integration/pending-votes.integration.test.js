const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { authenticateUser, createTestDocument, createTestParagraph, createTestProposal, safeDeleteTestDatabase } = require('../utils/test-helpers');

let server;
let authToken;
let testDocumentId;
let testParagraphId;
let testProposalId;
let testDbPath;

describe('Pending Votes API Integration Tests', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3025, returnServer: true });

    await new Promise(resolve => setTimeout(resolve, 3000));

    authToken = await authenticateUser(server, 'alice@example.com', 'SecurePass123!');

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

  describe('GET /api/pending-votes', () => {
    test('should retrieve pending votes for user', async () => {
      const response = await request(server)
        .get('/api/pending-votes')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('proposals');
      expect(Array.isArray(response.body.proposals)).toBe(true);
    });

    test('should only return proposals user has not voted on', async () => {
      // Create a proposal
      const proposal = await createTestProposal(server, authToken, testDocumentId, testParagraphId, {
        text: 'Proposal for pending votes test'
      });

      // Get pending votes (should include the new proposal)
      const beforeVote = await request(server)
        .get('/api/pending-votes')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const foundBefore = beforeVote.body.proposals.find(p => p.id === proposal.id);
      expect(foundBefore).toBeDefined();

      // Vote on the proposal
      await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${proposal.id}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ vote: 'PRO' })
        .expect(200);

      // Get pending votes again (should not include voted proposal)
      const afterVote = await request(server)
        .get('/api/pending-votes')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const foundAfter = afterVote.body.proposals.find(p => p.id === proposal.id);
      expect(foundAfter).toBeUndefined();
    });

    test('should reject request without authentication', async () => {
      const response = await request(server)
        .get('/api/pending-votes')
        .expect(401);
    });
  });
});

