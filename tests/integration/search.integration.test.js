const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { authenticateUser, createTestDocument, createTestParagraph, safeDeleteTestDatabase } = require('../utils/test-helpers');

let server;
let authToken;
let testUserId;
let testDocumentId;
let testDbPath;

describe('Search API Integration Tests', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3014, returnServer: true });

    await new Promise(resolve => setTimeout(resolve, 3000));

    authToken = await authenticateUser(server, 'alice@example.com', 'SecurePass123!');
    
    const loginResponse = await request(server)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'SecurePass123!' });
    testUserId = loginResponse.body.user.id;

    const document = await createTestDocument(server, authToken, {
      title: 'Searchable Test Document',
      description: 'This document should be searchable'
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

  describe('GET /api/search', () => {
    test('should search documents by query', async () => {
      const response = await request(server)
        .get('/api/search')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ q: 'Searchable' })
        .expect(200);

      expect(response.body).toHaveProperty('results');
      expect(response.body).toHaveProperty('count');
      expect(response.body).toHaveProperty('facets');
      expect(Array.isArray(response.body.results)).toBe(true);
      const docHit = response.body.results.find((r) => r.entityType === 'document' && r.id === testDocumentId);
      expect(docHit).toBeDefined();
    });

    test('should return empty results for non-matching query', async () => {
      const response = await request(server)
        .get('/api/search')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ q: 'NonExistentDocument12345' })
        .expect(200);

      expect(response.body.results).toEqual([]);
      expect(response.body.count).toBe(0);
    });

    test('should filter results by organization', async () => {
      // This test would require creating an organizational document
      // For now, just test the endpoint accepts the parameter
      const response = await request(server)
        .get('/api/search')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ q: 'test', organizationId: '00000000-0000-0000-0000-000000000000' })
        .expect(200);

      expect(response.body).toHaveProperty('results');
    });

    test('should support pagination', async () => {
      const response = await request(server)
        .get('/api/search')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ q: 'test', limit: 10, offset: 0 })
        .expect(200);

      expect(response.body.results.length).toBeLessThanOrEqual(10);
    });

    test('should only return documents user has access to', async () => {
      // Create a document as Alice
      const aliceDoc = await createTestDocument(server, authToken, {
        title: 'Alice Private Document'
      });

      // Login as Bob
      const bobToken = await authenticateUser(server, 'bob@example.com', 'SecurePass123!');

      // Bob should not see Alice's private document
      const response = await request(server)
        .get('/api/search')
        .set('Authorization', `Bearer ${bobToken}`)
        .query({ q: 'Alice Private' })
        .expect(200);

      const foundDoc = response.body.results.find((r) => r.entityType === 'document' && r.id === aliceDoc.id);
      expect(foundDoc).toBeUndefined();
    });

    test('should search paragraph body text', async () => {
      const uniqueText = 'ZebraParagraphSearch999';
      const doc = await createTestDocument(server, authToken, {
        title: 'Paragraph Body Search Doc',
      });
      const paragraph = await createTestParagraph(server, authToken, doc.id, {
        text: 'placeholder',
        order_index: 2,
      });

      await request(server)
        .put(`/api/documents/${doc.id}/paragraphs/${paragraph.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: uniqueText })
        .expect(200);

      const response = await request(server)
        .get('/api/search')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ q: uniqueText, types: 'paragraph' })
        .expect(200);

      const hit = response.body.results.find(
        (r) => r.entityType === 'paragraph' && r.paragraphId === paragraph.id
      );
      expect(hit).toBeDefined();
      expect(hit.documentId).toBe(doc.id);
    });

    test('should search meeting protocol content for org members', async () => {
      const adminToken = await authenticateUser(server, 'admin@colabora.local', 'AdminSecurePass123!');
      const uniqueAgenda = 'CheetahAgendaSearch888';

      const orgRes = await request(server)
        .post('/api/admin/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Search Meeting Org',
          description: 'Org for meeting search tests',
          representatives: [testUserId],
        })
        .expect(201);
      const organizationId = orgRes.body.organization.id;

      const meetingRes = await request(server)
        .post(`/api/organizations/${organizationId}/meetings`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Search Protocol Meeting',
          scheduled_at: new Date().toISOString(),
        })
        .expect(201);
      const meetingId = meetingRes.body.id;

      await request(server)
        .post(`/api/organizations/${organizationId}/meetings/${meetingId}/agenda`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: uniqueAgenda })
        .expect(201);

      const response = await request(server)
        .get('/api/search')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ q: uniqueAgenda, types: 'meeting' })
        .expect(200);

      const hit = response.body.results.find(
        (r) => r.entityType === 'meeting' && r.meetingId === meetingId
      );
      expect(hit).toBeDefined();
    });

    test('should filter by types parameter', async () => {
      const response = await request(server)
        .get('/api/search')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ q: 'Searchable', types: 'document' })
        .expect(200);

      expect(response.body.results.every((r) => r.entityType === 'document')).toBe(true);
    });

    test('should reject search without authentication', async () => {
      const response = await request(server)
        .get('/api/search')
        .query({ q: 'test' })
        .expect(401);
    });

    test('should reject empty query', async () => {
      const response = await request(server)
        .get('/api/search')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ q: '' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/search/suggestions', () => {
    test('should only return suggestions for documents user has access to', async () => {
      await createTestDocument(server, authToken, {
        title: 'Alice Private Document'
      });

      const bobToken = await authenticateUser(server, 'bob@example.com', 'SecurePass123!');

      const response = await request(server)
        .get('/api/search/suggestions')
        .set('Authorization', `Bearer ${bobToken}`)
        .query({ q: 'Alice Private' })
        .expect(200);

      const suggestionTexts = response.body.suggestions.map((s) => s.text || s);
      expect(suggestionTexts).not.toContain('Alice Private Document');
    });

    test('should return search suggestions', async () => {
      const response = await request(server)
        .get('/api/search/suggestions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ q: 'Sear' })
        .expect(200);

      expect(response.body).toHaveProperty('suggestions');
      expect(Array.isArray(response.body.suggestions)).toBe(true);
    });

    test('should return empty suggestions for short query', async () => {
      const response = await request(server)
        .get('/api/search/suggestions')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ q: 'S' })
        .expect(200);

      expect(response.body.suggestions).toEqual([]);
    });

    test('should reject suggestions without authentication', async () => {
      const response = await request(server)
        .get('/api/search/suggestions')
        .query({ q: 'test' })
        .expect(401);
    });
  });
});

