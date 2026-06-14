/**
 * WP5: Agreed View integration tests
 * - GET /documents/:id/agreed after vote-to-approval flow
 * - includePending (with/without amendments open)
 * - options.acceptanceThreshold (0% not coerced to 75)
 * - reEvaluateAllProposalsForDocument (sanity: content unchanged)
 */

const request = require('supertest');
const {
  authenticateUser,
  createTestDocument,
  createTestParagraph,
  createTestProposal,
  safeDeleteTestDatabase
} = require('../utils/test-helpers');

let server;
let authToken;
let testUserId;
let testDbPath;

describe('Agreed View Integration Tests (WP5)', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3014, returnServer: true });

    await new Promise((resolve) => setTimeout(resolve, 3000));

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
    await new Promise((resolve) => setTimeout(resolve, 100));
    await safeDeleteTestDatabase(testDbPath);
  });

  describe('GET /documents/:id/agreed', () => {
    test('should return agreed view with history after proposal is approved by vote', async () => {
      const doc = await createTestDocument(server, authToken, {
        title: 'Agreed View Test Doc',
        options: { acceptanceThreshold: 75 }
      });
      const para = await createTestParagraph(server, authToken, doc.id, {
        text: 'Original body',
        order_index: 2
      });
      const proposalText = 'Approved content for agreed view';
      const prop = await createTestProposal(server, authToken, doc.id, para.id, {
        text: proposalText,
        type: 'BODY'
      });

      await request(server)
        .post(
          `/api/documents/${doc.id}/paragraphs/${para.id}/proposals/${prop.id}/vote`
        )
        .set('Authorization', `Bearer ${authToken}`)
        .send({ vote: 'PRO' })
        .expect(200);

      // The accepted-history/agreed view is rebuilt asynchronously after the vote
      // response is sent, so poll until the approved proposal appears in history.
      let agreedRes;
      let paraWithHistory;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        agreedRes = await request(server)
          .get(`/api/documents/${doc.id}/agreed`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);
        paraWithHistory = (agreedRes.body.document.paragraphs || []).find(
          (p) => p.id === para.id
        );
        if (paraWithHistory && Array.isArray(paraWithHistory.history) && paraWithHistory.history.length > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      expect(agreedRes.body.document).toBeDefined();
      expect(Array.isArray(agreedRes.body.document.paragraphs)).toBe(true);
      expect(paraWithHistory).toBeDefined();
      expect(Array.isArray(paraWithHistory.history)).toBe(true);
      expect(paraWithHistory.history.length).toBeGreaterThan(0);

      const winning = paraWithHistory.history[0];
      const displayText =
        winning.newText ?? winning.new_text ?? winning.text ?? '';
      expect(displayText).toBe(proposalText);
      expect(winning.approvalPercentage).toBe(100);
      expect(winning.acceptedAt || winning.createdAt).toBeDefined();
    });

    test('should return options.acceptanceThreshold 0 when document has 0% threshold', async () => {
      const doc = await createTestDocument(server, authToken, {
        title: 'Zero Threshold Doc',
        options: { acceptanceThreshold: 0 }
      });

      const agreedRes = await request(server)
        .get(`/api/documents/${doc.id}/agreed`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(agreedRes.body.document.options).toBeDefined();
      expect(agreedRes.body.document.options.acceptanceThreshold).toBe(0);
    });

    test('should return 200 and no pending entries when includePending=true but amendments not open', async () => {
      const doc = await createTestDocument(server, authToken, {
        title: 'No Amendments Open',
        options: { acceptanceThreshold: 75 }
      });
      await createTestParagraph(server, authToken, doc.id, {
        text: 'Body',
        order_index: 2
      });

      const agreedRes = await request(server)
        .get(`/api/documents/${doc.id}/agreed?includePending=true`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(agreedRes.body.document).toBeDefined();
      expect(agreedRes.body.document.amendmentsOpen).toBe(false);
      agreedRes.body.document.paragraphs.forEach((p) => {
        const hasPending = (p.history || []).some((h) => h.isPending === true);
        expect(hasPending).toBe(false);
      });
    });
  });

  describe('reEvaluateAllProposalsForDocument', () => {
    test('should not change agreed content when called (sanity)', async () => {
      const doc = await createTestDocument(server, authToken, {
        title: 'Re-eval Sanity Doc',
        options: { acceptanceThreshold: 75 }
      });
      const para = await createTestParagraph(server, authToken, doc.id, {
        text: 'Original',
        order_index: 2
      });
      const prop = await createTestProposal(server, authToken, doc.id, para.id, {
        text: 'Re-eval approved text'
      });
      await request(server)
        .post(
          `/api/documents/${doc.id}/paragraphs/${para.id}/proposals/${prop.id}/vote`
        )
        .set('Authorization', `Bearer ${authToken}`)
        .send({ vote: 'PRO' })
        .expect(200);

      const db =
        server._serverManager?.app?.locals?.db ||
        server.app?.locals?.db ||
        server.locals?.db;
      const votesRoute = require('../../server/routes/votes');
      const reEvaluateAllProposalsForDocument =
        votesRoute.reEvaluateAllProposalsForDocument;
      expect(reEvaluateAllProposalsForDocument).toBeDefined();

      await reEvaluateAllProposalsForDocument(db, doc.id);

      const agreedRes = await request(server)
        .get(`/api/documents/${doc.id}/agreed`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const paraWithHistory = agreedRes.body.document.paragraphs.find(
        (p) => p.id === para.id
      );
      expect(paraWithHistory).toBeDefined();
      expect(paraWithHistory.history.length).toBeGreaterThan(0);
      const text =
        paraWithHistory.history[0].newText ??
        paraWithHistory.history[0].new_text ??
        paraWithHistory.history[0].text;
      expect(text).toBe('Re-eval approved text');
    });
  });
});
