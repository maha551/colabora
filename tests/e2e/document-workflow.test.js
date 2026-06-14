const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { authenticateUser, createTestUser, createTestDocument, createTestParagraph, createTestProposal, safeDeleteTestDatabase, addActiveDocumentCollaboratorForTests } = require('../utils/test-helpers');

let server;
let authToken;
let testUserId;
let testDbPath;

describe('Document Workflow E2E Tests', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3020, returnServer: true });

    await new Promise(resolve => setTimeout(resolve, 3000));

    authToken = await authenticateUser(server, 'alice@example.com', 'SecurePass123!');
    
    const loginResponse = await request(server)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'SecurePass123!' });
    testUserId = loginResponse.body.user.id;
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

  test('Complete document lifecycle: create → add paragraphs → create proposals → vote → approve', async () => {
    // Step 1: Create document
    const document = await createTestDocument(server, authToken, {
      title: 'E2E Workflow Document',
      description: 'Document for end-to-end workflow testing'
    });

    expect(document).toBeDefined();
    expect(document.id).toBeDefined();

    // Step 2: Add paragraphs (order_index 1 is reserved for the auto-created title paragraph)
    const paragraph1 = await createTestParagraph(server, authToken, document.id, {
      text: 'First paragraph content',
      order_index: 2
    });

    const paragraph2 = await createTestParagraph(server, authToken, document.id, {
      text: 'Second paragraph content',
      order_index: 3
    });

    expect(paragraph1.id).toBeDefined();
    expect(paragraph2.id).toBeDefined();

    // Step 3: Create proposals
    const proposal1 = await createTestProposal(server, authToken, document.id, paragraph1.id, {
      text: 'Proposed change to first paragraph',
      type: 'BODY'
    });

    const proposal2 = await createTestProposal(server, authToken, document.id, paragraph2.id, {
      text: 'Proposed change to second paragraph',
      type: 'BODY'
    });

    expect(proposal1.id).toBeDefined();
    expect(proposal2.id).toBeDefined();

    // Step 4: Vote on proposals
    const voteResponse1 = await request(server)
      .post(`/api/documents/${document.id}/paragraphs/${paragraph1.id}/proposals/${proposal1.id}/vote`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ vote: 'PRO' })
      .expect(200);

    expect(voteResponse1.body.message).toContain('successfully');

    // Step 5: Add comments
    const commentResponse = await request(server)
      .post(`/api/documents/${document.id}/paragraphs/${paragraph1.id}/proposals/${proposal1.id}/comments`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ text: 'This is a good proposal' })
      .expect(201);

    expect(commentResponse.body.comment).toBeDefined();

    // Step 6: Retrieve document and verify state
    const docResponse = await request(server)
      .get(`/api/documents/${document.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(docResponse.body.document.paragraphs.length).toBeGreaterThanOrEqual(2);
    expect(docResponse.body.document.paragraphs[0].proposals.length).toBeGreaterThan(0);
  });

  test('Document with multiple users: create → add collaborator → collaborator creates proposal', async () => {
    // Create document
    const document = await createTestDocument(server, authToken, {
      title: 'Collaborative Workflow Document'
    });

    // Create another user
    const db = server.app.locals.db;
    const collaborator = await createTestUser(db, {
      name: 'Collaborator User',
      email: 'collab@test.com',
      password: 'TestPass123!'
    });

    // Add collaborator
    await addActiveDocumentCollaboratorForTests(server, document.id, authToken, collaborator);

    // Collaborator logs in
    const collabToken = await authenticateUser(server, 'collab@test.com', 'TestPass123!');

    // Collaborator creates paragraph (order_index 1 is reserved for the title paragraph)
    const paragraph = await createTestParagraph(server, collabToken, document.id, {
      text: 'Paragraph by collaborator',
      order_index: 2
    });

    expect(paragraph.id).toBeDefined();

    // Collaborator creates proposal
    const proposal = await createTestProposal(server, collabToken, document.id, paragraph.id, {
      text: 'Proposal by collaborator',
      type: 'BODY'
    });

    expect(proposal.id).toBeDefined();
  });
});

