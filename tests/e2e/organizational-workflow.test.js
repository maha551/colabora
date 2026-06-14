const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { authenticateUser, waitFor, getServerDb } = require('../utils/test-helpers');

let server;
let adminToken;
let authToken;
let testUserId;
let orgId;
describe('Organizational Workflow E2E Tests', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3027, returnServer: true });

    await new Promise(resolve => setTimeout(resolve, 3000));

    adminToken = await authenticateUser(server, 'admin@colabora.local', 'AdminSecurePass123!');
    authToken = await authenticateUser(server, 'alice@example.com', 'SecurePass123!');
    
    const loginResponse = await request(server)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'SecurePass123!' });
    testUserId = loginResponse.body.user.id;

    // Create organization
    const orgResponse = await request(server)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'E2E Test Organization',
        representatives: [testUserId]
      });

    orgId = orgResponse.body.organization.id;
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

  });

  test('Complete organizational workflow: create org → create doc → proposal period → voting → agreed', async () => {
    // Step 1: Create organizational document
    const docResponse = await request(server)
      .post('/api/documents')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Organizational Workflow Document',
        ownershipType: 'organizational',
        organizationId: orgId
      })
      .expect(201);

    const documentId = docResponse.body.document.id;
    expect(docResponse.body.document.status).toBe('proposal');

    // Step 2: Add body paragraph during proposal period (title paragraph is auto-created at order 1)
    const paraResponse = await request(server)
      .post(`/api/documents/${documentId}/paragraphs`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        text: 'First paragraph for organizational document',
        order_index: 2
      })
      .expect(201);

    const paragraphId = paraResponse.body.paragraph.id;
    const proposalText = 'Proposed change';

    // Step 3: Create proposal
    const proposalResponse = await request(server)
      .post(`/api/documents/${documentId}/paragraphs/${paragraphId}/proposals`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        text: proposalText,
        type: 'BODY'
      })
      .expect(201);

    const proposalId = proposalResponse.body.proposal.id;

    // Step 4: Start voting (transition from proposal to voting)
    await request(server)
      .post(`/api/documents/${documentId}/start-voting`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    let statusResponse = await request(server)
      .get(`/api/documents/${documentId}/voting-status`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(statusResponse.body.document.status).toBe('voting');

    // Step 5: Document-level vote (organizational voting phase — not paragraph-level)
    await waitFor(async () => {
      const voteRes = await request(server)
        .post(`/api/documents/${documentId}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ vote: 'PRO' });
      return voteRes.status === 200;
    }, 20000, 500);

    // Step 6: Finalize voting (Alice is org representative).
    // Documents default vote_change_allowed=true; finalize before deadline returns 400 unless deadline passed.
    const serverDb = getServerDb(server);
    const pastDeadline = new Date(Date.now() - 60 * 1000).toISOString();
    await serverDb('documents').where({ id: documentId }).update({ voting_deadline: pastDeadline });

    await request(server)
      .post(`/api/documents/${documentId}/finalize-voting`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    statusResponse = await request(server)
      .get(`/api/documents/${documentId}/voting-status`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(statusResponse.body.document.status).toBe('agreed');
    expect(statusResponse.body.document.adoptedAt).toBeDefined();

    // Step 7: Agreed view reflects approved proposal text (may update asynchronously)
    await waitFor(async () => {
      const agreedRes = await request(server)
        .get(`/api/documents/${documentId}/agreed`)
        .set('Authorization', `Bearer ${authToken}`);

      if (agreedRes.status !== 200) return false;

      const paraWithHistory = (agreedRes.body.document?.paragraphs || []).find(
        (p) => p.id === paragraphId
      );
      if (!paraWithHistory || !Array.isArray(paraWithHistory.history) || paraWithHistory.history.length === 0) {
        return false;
      }

      const winning = paraWithHistory.history[0];
      const displayText = winning.newText ?? winning.new_text ?? winning.text ?? '';
      return displayText === proposalText;
    });

    const agreedRes = await request(server)
      .get(`/api/documents/${documentId}/agreed`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const paraWithHistory = agreedRes.body.document.paragraphs.find((p) => p.id === paragraphId);
    expect(paraWithHistory).toBeDefined();
    expect(paraWithHistory.history.length).toBeGreaterThan(0);
    const winning = paraWithHistory.history[0];
    const displayText = winning.newText ?? winning.new_text ?? winning.text ?? '';
    expect(displayText).toBe(proposalText);

    // Step 8: Status history includes proposal → voting → agreed
    const historyRes = await request(server)
      .get(`/api/documents/${documentId}/status-history`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(Array.isArray(historyRes.body.history)).toBe(true);
    const transitions = historyRes.body.history.map((h) => h.new_status ?? h.newStatus);
    expect(transitions).toContain('voting');
    expect(transitions).toContain('agreed');
  });
});

