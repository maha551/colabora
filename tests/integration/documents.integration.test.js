const request = require('supertest');
const path = require('path');
const fs = require('fs');

let app;
let authToken;
let testUserId;
let testDocumentId;
let testParagraphId;
let testDbPath;

describe('Documents API Integration Tests', () => {
  beforeAll(async () => {
    // Get the database path (set by setup.js with timestamp)
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Import and start test server
    const startTestServer = require('../../server/index');
    server = await startTestServer(3002); // Use port 3002 for documents tests

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
    testUserId = loginResponse.body.user.id;
  });

  afterAll(async () => {
    // Close server and wait for it to actually close
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

    // Clean up test database
    try {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
    } catch (error) {
      console.warn('Could not clean up test database:', error.message);
    }
  });

  describe('Document CRUD Operations', () => {
    test('should create a new document', async () => {
      const docData = {
        title: 'Integration Test Document'
      };

      const response = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send(docData)
        .expect(201);

      expect(response.body).toHaveProperty('document');
      expect(response.body.document.title).toBe(docData.title);
      expect(response.body.document.owner.id).toBe(testUserId);

      testDocumentId = response.body.document.id;
    });

    test('should retrieve user documents', async () => {
      const response = await request(server)
        .get('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body.documents)).toBe(true);
      expect(response.body.documents.length).toBeGreaterThan(0);

      const ourDocument = response.body.documents.find(doc => doc.id === testDocumentId);
      expect(ourDocument).toBeDefined();
      expect(ourDocument.title).toBe('Integration Test Document');
    });

    test('should retrieve specific document', async () => {
      const response = await request(server)
        .get(`/api/documents/${testDocumentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('document');
      expect(response.body.document.id).toBe(testDocumentId);
      expect(response.body.document.title).toBe('Integration Test Document');
      expect(response.body.document.paragraphs).toBeDefined();
    });

    test('should update document title', async () => {
      const updateData = {
        title: 'Updated Integration Test Document'
      };

      const response = await request(server)
        .put(`/api/documents/${testDocumentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.message).toBe('Document updated successfully');
    });

    test('should reject unauthorized document access', async () => {
      // Create a document with a different user (Bob)
      const bobLogin = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'bob@example.com',
          password: 'SecurePass123!'
        });

      const bobToken = bobLogin.body.token;

      const bobDoc = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ title: 'Bob\'s Private Document' })
        .expect(201);


      // Try to access Bob's document with Alice's token
      // Should return 404 (not found) for security - don't reveal document existence
      await request(server)
        .get(`/api/documents/${bobDoc.body.document.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('Paragraph Management', () => {

    test('should create a new paragraph', async () => {
      const paragraphData = {
        text: 'This is a test paragraph for integration testing.',
        order_index: 1
      };

      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(paragraphData)
        .expect(201);

      expect(response.body).toHaveProperty('paragraph');
      expect(response.body.paragraph.text).toBe(paragraphData.text);
      expect(response.body.paragraph.order_index).toBe(paragraphData.order_index);

      testParagraphId = response.body.paragraph.id;
    });

    test('should retrieve document paragraphs', async () => {
      const response = await request(server)
        .get(`/api/documents/${testDocumentId}/paragraphs`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body.paragraphs)).toBe(true);
      expect(response.body.paragraphs.length).toBeGreaterThan(0);

      const ourParagraph = response.body.paragraphs.find(p => p.id === testParagraphId);
      expect(ourParagraph).toBeDefined();
      expect(ourParagraph.text).toBe('This is a test paragraph for integration testing.');
    });

    test('should update paragraph content', async () => {
      const updateData = {
        text: 'This is an updated test paragraph for integration testing.'
      };

      const response = await request(server)
        .put(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.message).toBe('Paragraph updated successfully');
    });
  });

  describe('Proposal and Voting System', () => {
    let testProposalId;

    test('should create a proposal', async () => {
      const proposalData = {
        text: 'This is a proposed change to the paragraph.',
        type: 'BODY'
      };

      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(proposalData)
        .expect(201);

      expect(response.body).toHaveProperty('proposal');
      expect(response.body.proposal.text).toBe(proposalData.text);
      expect(response.body.proposal.type).toBe(proposalData.type);

      testProposalId = response.body.proposal.id;
    });

    test('should retrieve paragraph proposals', async () => {
      const response = await request(server)
        .get(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body.proposals)).toBe(true);
      expect(response.body.proposals.length).toBeGreaterThan(0);

      const ourProposal = response.body.proposals.find(p => p.id === testProposalId);
      expect(ourProposal).toBeDefined();
    });

    test('should cast a vote on proposal', async () => {
      const voteData = {
        vote: 'PRO'
      };

      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(voteData)
        .expect(200);

      expect(response.body.message).toContain('Vote cast successfully');
    });

    test('should prevent duplicate voting', async () => {
      const voteData = {
        vote: 'CONTRA'
      };

      await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(voteData)
        .expect(400); // Should fail due to duplicate vote
    });
  });

  describe('Comments System', () => {
    test('should add a comment to proposal', async () => {
      const commentData = {
        text: 'This is a test comment on the proposal.'
      };

      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(commentData)
        .expect(201);

      expect(response.body).toHaveProperty('comment');
      expect(response.body.comment.text).toBe(commentData.text);
    });
  });

  describe('Input Validation and Security', () => {
    test('should reject invalid document title', async () => {
      const invalidData = {
        title: '' // Empty title
      };

      await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);
    });

    test('should reject overly long document title', async () => {
      const invalidData = {
        title: 'A'.repeat(201) // Exceeds 200 character limit
      };

      await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);
    });

    test('should reject invalid paragraph data', async () => {
      const invalidData = {
        text: '', // Empty text
        order_index: -1 // Negative order
      };

      await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);
    });

    test('should prevent XSS in document titles', async () => {
      const xssData = {
        title: '<script>alert("xss")</script> Safe Title'
      };

      // This should succeed but the script tag should be sanitized
      const response = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send(xssData)
        .expect(201);

      // Title should be sanitized (script tag removed)
      expect(response.body.document.title).not.toContain('<script>');
    });
  });

  describe('Authentication and Authorization', () => {
    test('should require authentication for document operations', async () => {
      await request(server)
        .get('/api/documents')
        .expect(401);
    });

    test('should require authentication for paragraph operations', async () => {
      await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs`)
        .send({ text: 'Test', order_index: 1 })
        .expect(401);
    });

    test('should require authentication for proposal operations', async () => {
      await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/para-1/proposals`)
        .send({ text: 'Test proposal', type: 'BODY' })
        .expect(401);
    });
  });
});
