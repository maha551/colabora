const request = require('supertest');
const path = require('path');
const { authenticateUser, createTestDocument, createTestParagraph, createTestProposal, safeDeleteTestDatabase } = require('../utils/test-helpers');

let server;
let authToken;
let testDocumentId;
let testParagraphId;
let testDbPath;

describe('Pending Decisions API Integration Tests', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3026, returnServer: true });

    await new Promise(resolve => setTimeout(resolve, 3000));

    authToken = await authenticateUser(server, 'alice@example.com', 'SecurePass123!');

    const document = await createTestDocument(server, authToken);
    testDocumentId = document.id;

    const paragraph = await createTestParagraph(server, authToken, testDocumentId);
    testParagraphId = paragraph.id;

    await createTestProposal(server, authToken, testDocumentId, testParagraphId);
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

  describe('GET /api/pending-decisions', () => {
    test('should require authentication', async () => {
      await request(server)
        .get('/api/pending-decisions')
        .expect(401);
    });

    test('should return entries and pagination', async () => {
      const response = await request(server)
        .get('/api/pending-decisions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('entries');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.entries)).toBe(true);
      expect(response.body.pagination).toMatchObject({
        total: expect.any(Number),
        limit: expect.any(Number),
        offset: expect.any(Number),
        hasMore: expect.any(Boolean),
      });
    });

    test('should accept limit and offset', async () => {
      const response = await request(server)
        .get('/api/pending-decisions?limit=5&offset=0')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.entries.length).toBeLessThanOrEqual(5);
      expect(response.body.pagination.limit).toBe(5);
      expect(response.body.pagination.offset).toBe(0);
    });

    test('entries should have id, kind, timestamp, payload', async () => {
      const response = await request(server)
        .get('/api/pending-decisions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      for (const entry of response.body.entries) {
        expect(entry).toHaveProperty('id');
        expect(entry).toHaveProperty('kind');
        expect(entry).toHaveProperty('timestamp');
        expect(entry).toHaveProperty('payload');
        expect(['paragraph_proposal', 'election', 'organization_vote', 'rule_proposal', 'structure_proposal', 'tree_proposal', 'document_voting', 'document_amendments_open']).toContain(entry.kind);
      }
    });
  });
});
