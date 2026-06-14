const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { authenticateUser, createTestDocument, safeDeleteTestDatabase } = require('../utils/test-helpers');

let server;
let authToken;
let testDocumentId;
let testDbPath;

describe('Structure Proposals API Integration Tests', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3029, returnServer: true });

    await new Promise(resolve => setTimeout(resolve, 3000));

    authToken = await authenticateUser(server, 'alice@example.com', 'SecurePass123!');

    const document = await createTestDocument(server, authToken, {
      title: 'Structure Proposal Test Document',
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

  describe('POST /api/documents/:documentId/structure-proposals', () => {
    test('should create structure proposal', async () => {
      const proposalData = {
        title: 'Test Structure Proposal',
        description: 'Proposal to restructure the document',
        operations: [
          { operationType: 'INSERT_NEW', newText: 'New paragraph', newPositionIndex: 1 }
        ]
      };

      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/structure-proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(proposalData)
        .expect(201);

      expect(response.body).toHaveProperty('structureProposal');
      expect(response.body.structureProposal.title).toBe(proposalData.title);
    });

    test('should reject structure proposal on document with disabled feature', async () => {
      const doc = await createTestDocument(server, authToken, {
        title: 'No Structure Proposals',
        options: { structureProposalsEnabled: false }
      });

      const response = await request(server)
        .post(`/api/documents/${doc.id}/structure-proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test',
          description: 'Test',
          operations: [{ operationType: 'INSERT_NEW', newText: 'X', newPositionIndex: 1 }]
        })
        .expect(403);

      expect(response.body.error).toContain('not enabled');
    });
  });

  describe('GET /api/documents/:documentId/structure-proposals', () => {
    test('should retrieve structure proposals', async () => {
      const response = await request(server)
        .get(`/api/documents/${testDocumentId}/structure-proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('structureProposals');
      expect(Array.isArray(response.body.structureProposals)).toBe(true);
    });
  });
});

