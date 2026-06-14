const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { safeDeleteTestDatabase } = require('../utils/test-helpers');

let server;
let authToken;
let testDbPath;

describe('Comprehensive Validation Integration Tests', () => {
  beforeAll(async () => {
    // Get the database path (set by setup.js with timestamp)
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    // Clean up any existing test database
    await safeDeleteTestDatabase(testDbPath);

    // Import and start test server
    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3003, returnServer: true });

    // Wait for database initialization
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Login and get auth token
    const loginResponse = await request(server)
      .post('/api/auth/login')
      .send({
        email: 'alice@example.com',
        password: 'SecurePass123!'
      });

    authToken = loginResponse.body.token;
  });

  afterAll(async () => {
    // Close server
    if (server) {
      await new Promise((resolve) => {
        server.close((err) => {
          if (err) {
            console.warn('Error closing server:', err.message);
          }
          resolve();
        });
      });
    }

    // Give scheduler time to stop
    await new Promise(resolve => setTimeout(resolve, 100));

    // Clean up test database
    try {
      await safeDeleteTestDatabase(testDbPath);
    } catch (error) {
      console.warn('Could not clean up test database:', error.message);
    }
  });

  describe('Empty Field Validation', () => {
    test('should reject empty document title', async () => {
      const response = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: '' })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details.validationErrors).toBeInstanceOf(Array);
      expect(response.body.details.validationErrors.length).toBeGreaterThan(0);
      expect(response.body.details.validationErrors[0].field).toBe('title');
    });

    test('should reject whitespace-only document title', async () => {
      const response = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: '   ' })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details.validationErrors[0].field).toBe('title');
    });

    test('should accept valid document title with whitespace (trimmed)', async () => {
      const response = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: '  Valid Title  ' })
        .expect(201);

      expect(response.body.document.title).toBe('Valid Title');
    });
  });

  describe('Type Validation', () => {
    test('should reject non-string document title', async () => {
      const response = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 123 })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details.validationErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'title',
            message: expect.stringContaining('string')
          })
        ])
      );
    });

    test('should reject invalid UUID for organizationId', async () => {
      const response = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Valid Title',
          ownershipType: 'organizational',
          organizationId: 'not-a-uuid'
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details.validationErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'organization_id',
            message: expect.stringContaining('UUID')
          })
        ])
      );
    });

    test('should reject non-array creatorIds', async () => {
      const response = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Valid Title',
          ownershipType: 'shared',
          creatorIds: 'not-an-array'
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details.validationErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'creator_ids',
            message: expect.stringContaining('array')
          })
        ])
      );
    });
  });

  describe('Error Message Format', () => {
    test('should return structured error response with field, message, reason, expected, and received', async () => {
      const response = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 123 })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('details');
      expect(response.body.details.validationErrors).toBeInstanceOf(Array);
      
      if (response.body.details.validationErrors.length > 0) {
        const firstError = response.body.details.validationErrors[0];
        expect(firstError).toHaveProperty('field');
        expect(firstError).toHaveProperty('message');
        // Enhanced error format includes reason, expected, and received
        expect(firstError).toHaveProperty('reason');
        expect(firstError).toHaveProperty('expected');
        expect(firstError).toHaveProperty('received');
      }
    });
  });

  describe('XSS Sanitization', () => {
    test('should sanitize XSS in document title', async () => {
      const response = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: '<script>alert("xss")</script>Safe Title' })
        .expect(201);

      expect(response.body.document.title).not.toContain('<script>');
      expect(response.body.document.title).not.toContain('</script>');
      expect(response.body.document.title).toContain('Safe Title');
    });
  });

  describe('Required Field Validation', () => {
    test('should reject missing required fields', async () => {
      const response = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details.validationErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'title'
          })
        ])
      );
    });
  });

  describe('Enum Validation', () => {
    test('should reject invalid enum value for vote', async () => {
      // First create a document
      const docResponse = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Test Document' })
        .expect(201);

      const docId = docResponse.body.document.id;

      // Create a dedicated body paragraph. The auto-created title paragraph
      // (order_index 1) only accepts TITLE proposals, so use order_index 2.
      const paraResponse = await request(server)
        .post(`/api/documents/${docId}/paragraphs`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          text: 'Test paragraph',
          order_index: 2
        })
        .expect(201);
      const paraId = paraResponse.body.paragraph.id;

      // Create a proposal
      const proposalResponse = await request(server)
        .post(`/api/documents/${docId}/paragraphs/${paraId}/proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          text: 'Test proposal',
          type: 'BODY'
        })
        .expect(201);

      const proposalId = proposalResponse.body.proposal.id;

      // Try to vote with invalid enum value
      const voteResponse = await request(server)
        .post(`/api/documents/${docId}/paragraphs/${paraId}/proposals/${proposalId}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ vote: 'INVALID_VOTE' })
        .expect(400);

      expect(voteResponse.body.error).toBe('Validation failed');
      expect(voteResponse.body.details.validationErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'vote',
            message: expect.stringContaining('PRO')
          })
        ])
      );
    });
  });
});

