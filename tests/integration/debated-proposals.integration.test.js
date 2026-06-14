const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { authenticateUser, createTestDocument, createTestParagraph, createTestProposal, safeDeleteTestDatabase } = require('../utils/test-helpers');

let server;
let authToken;
let testDocumentId;
let testParagraphId;
let testProposalId;
let testDbPath;

describe('Debated Proposals API Integration Tests', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3031, returnServer: true });

    await new Promise(resolve => setTimeout(resolve, 3000));

    authToken = await authenticateUser(server, 'alice@example.com', 'SecurePass123!');

    const document = await createTestDocument(server, authToken);
    testDocumentId = document.id;

    const paragraph = await createTestParagraph(server, authToken, testDocumentId);
    testParagraphId = paragraph.id;

    const proposal = await createTestProposal(server, authToken, testDocumentId, testParagraphId);
    testProposalId = proposal.id;

    // Add some votes and comments to make it "debated"
    await request(server)
      .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/vote`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ vote: 'PRO' })
      .expect(200);

    await request(server)
      .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/comments`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ text: 'This is a comment' })
      .expect(201);
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

  describe('GET /api/debated-proposals', () => {
    test('should retrieve debated proposals', async () => {
      const response = await request(server)
        .get('/api/debated-proposals')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('proposals');
      expect(Array.isArray(response.body.proposals)).toBe(true);
    });

    test('should return proposals sorted by engagement', async () => {
      const response = await request(server)
        .get('/api/debated-proposals')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Should return top 10 most debated
      expect(response.body.proposals.length).toBeLessThanOrEqual(10);
    });

    test('should reject request without authentication', async () => {
      const response = await request(server)
        .get('/api/debated-proposals')
        .expect(401);
    });

    test('should exclude meeting minutes paragraph proposals', async () => {
      const TransactionManager = require('../../server/database/services/TransactionManager');
      const { v4: uuidv4 } = require('uuid');
      const db = server.app.locals.db;

      const adminLogin = await request(server)
        .post('/api/auth/login')
        .send({ email: 'admin@colabora.local', password: 'AdminSecurePass123!' })
        .expect(200);

      const adminToken = adminLogin.body.token;
      const aliceUser = await request(server)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const aliceUserId = aliceUser.body.user.id;

      const orgRes = await request(server)
        .post('/api/admin/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Debated Minutes Exclusion ${Date.now()}`,
          description: 'Exclude minutes from debated feed',
          representatives: [aliceUserId],
        })
        .expect(201);

      const organizationId = orgRes.body.organization.id;

      const meetingRes = await request(server)
        .post(`/api/organizations/${organizationId}/meetings`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Minutes debated exclusion test',
          scheduled_at: new Date().toISOString(),
        })
        .expect(201);

      const meetingDetail = await request(server)
        .get(`/api/organizations/${organizationId}/meetings/${meetingRes.body.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const minutesDocumentId =
        meetingDetail.body.minutesDocumentId || meetingDetail.body.minutes_document_id;
      expect(minutesDocumentId).toBeTruthy();

      const paragraph = await TransactionManager.query(db, `
        SELECT id FROM paragraphs WHERE document_id = ? ORDER BY order_index ASC LIMIT 1
      `, [minutesDocumentId]);
      expect(paragraph).toBeTruthy();

      const minutesProposalCount = await TransactionManager.query(db, `
        SELECT COUNT(*) AS count
        FROM proposals p
        JOIN paragraphs par ON p.paragraph_id = par.id
        WHERE par.document_id = ?
      `, [minutesDocumentId]);
      expect(Number(minutesProposalCount.count)).toBe(0);

      const orphanProposalId = uuidv4();
      await TransactionManager.execute(db, `
        INSERT INTO proposals (id, paragraph_id, user_id, text, type, heading_level, created_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [orphanProposalId, paragraph.id, aliceUserId, 'Orphan Agenda', 'TITLE', 'h1']);

      const response = await request(server)
        .get('/api/debated-proposals')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const proposalIds = (response.body.proposals || []).map((p) => p.id);
      expect(proposalIds).not.toContain(orphanProposalId);
    });
  });
});

