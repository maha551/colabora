const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { authenticateUser, createTestUser, createTestDocument, createTestParagraph, createTestProposal, safeDeleteTestDatabase, addActiveDocumentCollaboratorForTests } = require('../utils/test-helpers');

let server;
let authToken;
let testUserId;
let testDbPath;

describe('Critical Paths Regression Tests', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3021, returnServer: true });

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

  test('Critical Path: User login → Create document → View document', async () => {
    // Login
    const loginResponse = await request(server)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'SecurePass123!' })
      .expect(200);

    expect(loginResponse.body.token).toBeDefined();
    const token = loginResponse.body.token;

    // Create document
    const docResponse = await request(server)
      .post('/api/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Critical Path Document' })
      .expect(201);

    const docId = docResponse.body.document.id;

    // View document
    const viewResponse = await request(server)
      .get(`/api/documents/${docId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(viewResponse.body.document.id).toBe(docId);
  });

  test('Critical Path: Add collaborator → Collaborator accesses document', async () => {
    // Create document
    const document = await createTestDocument(server, authToken, {
      title: 'Collaborator Access Test'
    });

    // Create user
    const db = server.app.locals.db;
    const collaborator = await createTestUser(db, {
      name: 'Test Collaborator',
      email: 'testcollab@test.com',
      password: 'TestPass123!'
    });

    // Add collaborator
    await addActiveDocumentCollaboratorForTests(server, document.id, authToken, collaborator);

    // Collaborator accesses document
    const collabToken = await authenticateUser(server, 'testcollab@test.com', 'TestPass123!');

    const response = await request(server)
      .get(`/api/documents/${document.id}`)
      .set('Authorization', `Bearer ${collabToken}`)
      .expect(200);

    expect(response.body.document.id).toBe(document.id);
  });

  test('Critical Path: Create proposal → Vote → Check approval', async () => {
    const document = await createTestDocument(server, authToken);
    const paragraph = await createTestParagraph(server, authToken, document.id);
    const proposal = await createTestProposal(server, authToken, document.id, paragraph.id);

    // Vote
    await request(server)
      .post(`/api/documents/${document.id}/paragraphs/${paragraph.id}/proposals/${proposal.id}/vote`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ vote: 'PRO' })
      .expect(200);

    // Check proposal status
    const docResponse = await request(server)
      .get(`/api/documents/${document.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const foundProposal = docResponse.body.document.paragraphs
      .find(p => p.id === paragraph.id)
      ?.proposals?.find(prop => prop.id === proposal.id);

    expect(foundProposal).toBeDefined();
    expect(foundProposal.votes.length).toBeGreaterThan(0);
  });

  test('Critical Path: Admin creates organization → Adds members → Members create documents', async () => {
    const adminToken = await authenticateUser(server, 'admin@colabora.local', 'AdminSecurePass123!');

    // Create organization
    const orgResponse = await request(server)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Critical Path Organization',
        representatives: [testUserId]
      })
      .expect(201);

    const orgId = orgResponse.body.organization.id;

    // Member creates organizational document
    const docResponse = await request(server)
      .post('/api/documents')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Organizational Document',
        ownershipType: 'organizational',
        organizationId: orgId
      })
      .expect(201);

    expect(docResponse.body.document.organizationId).toBe(orgId);
    expect(docResponse.body.document.status).toBe('proposal');
  });
});

