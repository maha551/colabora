const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { authenticateUser, createTestDocument, createTestParagraph, safeDeleteTestDatabase } = require('../utils/test-helpers');

let server;
let authToken;
let testUserId;
let testDocumentId;
let testParagraphId;
let testDbPath;

describe('Proposals API Integration Tests', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3011, returnServer: true });

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

    await safeDeleteTestDatabase(testDbPath);
  });

  describe('POST /api/documents/:documentId/paragraphs/:paragraphId/proposals', () => {
    test('should create a BODY proposal successfully', async () => {
      const proposalData = {
        text: 'This is a test proposal for the paragraph body',
        type: 'BODY'
      };

      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(proposalData)
        .expect(201);

      expect(response.body).toHaveProperty('proposal');
      expect(response.body.proposal.text).toBe(proposalData.text);
      expect(response.body.proposal.type).toBe('BODY');
      expect(response.body.proposal.userId).toBe(testUserId);
    });

    test('should create a TITLE proposal with heading level', async () => {
      const proposalData = {
        text: 'New Title Proposal',
        type: 'TITLE',
        headingLevel: 'h2'
      };

      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(proposalData)
        .expect(201);

      expect(response.body.proposal.type).toBe('TITLE');
      expect(response.body.proposal.headingLevel).toBe('h2');
    });

    test('should reject empty proposal text', async () => {
      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: '', type: 'BODY' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should reject proposal on non-existent paragraph', async () => {
      const fakeParagraphId = 'fake-paragraph-id';
      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${fakeParagraphId}/proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: 'Test proposal', type: 'BODY' })
        .expect(404);

      expect(response.body.error).toContain('not found');
    });

    test('should reject proposal without authentication', async () => {
      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals`)
        .send({ text: 'Test proposal', type: 'BODY' })
        .expect(401);
    });
  });

  describe('GET /api/documents/:documentId/paragraphs/:paragraphId/proposals', () => {
    test('should retrieve proposals for a paragraph', async () => {
      // Create a proposal first
      await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: 'Test proposal for retrieval', type: 'BODY' })
        .expect(201);

      const response = await request(server)
        .get(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('proposals');
      expect(Array.isArray(response.body.proposals)).toBe(true);
      expect(response.body.proposals.length).toBeGreaterThan(0);
    });

    test('should include votes and comments in proposal response', async () => {
      const response = await request(server)
        .get(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      if (response.body.proposals.length > 0) {
        const proposal = response.body.proposals[0];
        expect(proposal).toHaveProperty('votes');
        expect(proposal).toHaveProperty('comments');
        expect(Array.isArray(proposal.votes)).toBe(true);
        expect(Array.isArray(proposal.comments)).toBe(true);
      }
    });
  });
});

