const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { authenticateUser, createTestDocument, createTestParagraph, safeDeleteTestDatabase } = require('../utils/test-helpers');

let server;
let authToken;
let testUserId;
let testDocumentId;
let testDbPath;

describe('Export API Integration Tests', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3015, returnServer: true });

    await new Promise(resolve => setTimeout(resolve, 3000));

    authToken = await authenticateUser(server, 'alice@example.com', 'SecurePass123!');
    
    const loginResponse = await request(server)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'SecurePass123!' });
    testUserId = loginResponse.body.user.id;

    const document = await createTestDocument(server, authToken, {
      title: 'Export Test Document',
      description: 'Document for testing export functionality'
    });
    testDocumentId = document.id;

    // Add some paragraphs (order_index 1 is reserved for the auto-created title paragraph).
    await createTestParagraph(server, authToken, testDocumentId, {
      text: 'First paragraph content',
      order_index: 2
    });

    await createTestParagraph(server, authToken, testDocumentId, {
      text: 'Second paragraph content',
      order_index: 3
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

  describe('GET /api/export/documents/:id', () => {
    test('should export document as PDF', async () => {
      const response = await request(server)
        .get(`/api/export/documents/${testDocumentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .query({ format: 'pdf' })
        .expect(200);

      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toContain('.pdf');
      expect(Buffer.isBuffer(response.body)).toBe(true);
    });

    test('should export document as Markdown', async () => {
      const response = await request(server)
        .get(`/api/export/documents/${testDocumentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .query({ format: 'markdown' })
        .expect(200);

      expect(response.headers['content-type']).toContain('text/markdown');
      expect(response.headers['content-disposition']).toContain('.md');
      expect(typeof response.text).toBe('string');
    });

    test('should export document as Word (docx)', async () => {
      const response = await request(server)
        .get(`/api/export/documents/${testDocumentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .query({ format: 'docx' })
        .buffer(true)
        .parse((res, callback) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(response.headers['content-type']).toContain('wordprocessingml');
      expect(response.headers['content-disposition']).toContain('.docx');
      expect(Buffer.isBuffer(response.body)).toBe(true);
    });

    test('should default to PDF format', async () => {
      const response = await request(server)
        .get(`/api/export/documents/${testDocumentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('application/pdf');
    });

    test('should reject invalid format', async () => {
      const response = await request(server)
        .get(`/api/export/documents/${testDocumentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .query({ format: 'invalid' })
        .expect(400);

      expect(response.body.error).toContain('Invalid format');
    });

    test('should reject export of document user does not have access to', async () => {
      // Create a document as Alice
      const aliceDoc = await createTestDocument(server, authToken, {
        title: 'Alice Private Document'
      });

      // Login as Bob
      const bobToken = await authenticateUser(server, 'bob@example.com', 'SecurePass123!');

      // Bob should not be able to export Alice's document
      const response = await request(server)
        .get(`/api/export/documents/${aliceDoc.id}`)
        .set('Authorization', `Bearer ${bobToken}`)
        .query({ format: 'pdf' })
        .expect(404);

      expect(response.body.error).toContain('not found');
    });

    test('should reject export without authentication', async () => {
      const response = await request(server)
        .get(`/api/export/documents/${testDocumentId}`)
        .query({ format: 'pdf' })
        .expect(401);
    });
  });
});

