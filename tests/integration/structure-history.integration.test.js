const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { authenticateUser, createTestDocument, safeDeleteTestDatabase } = require('../utils/test-helpers');

let server;
let authToken;
let testDocumentId;
let testDbPath;

describe('Structure History API Integration Tests', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3033, returnServer: true });

    await new Promise(resolve => setTimeout(resolve, 3000));

    authToken = await authenticateUser(server, 'alice@example.com', 'SecurePass123!');

    const document = await createTestDocument(server, authToken, {
      title: 'Structure History Test',
      options: { structureProposalsEnabled: true }
    });
    testDocumentId = document.id;
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

  describe('GET /api/documents/:documentId/structure-history', () => {
    test('should retrieve structure history', async () => {
      const response = await request(server)
        .get(`/api/documents/${testDocumentId}/structure-history`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('versions');
      expect(Array.isArray(response.body.versions)).toBe(true);
    });

    test('should reject access to document with disabled structure proposals', async () => {
      const doc = await createTestDocument(server, authToken, {
        title: 'No Structure History',
        options: { structureProposalsEnabled: false }
      });

      const response = await request(server)
        .get(`/api/documents/${doc.id}/structure-history`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(response.body.error).toContain('not available');
    });

    test('should reject request without authentication', async () => {
      const response = await request(server)
        .get(`/api/documents/${testDocumentId}/structure-history`)
        .expect(401);
    });
  });
});

