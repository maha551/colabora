/**
 * Integration tests for ballot export API (Agent B).
 * Tests: 400 missing/invalid params, 404 contest not found, 403 when contest not closed,
 * 200 with no forbidden fields (anonymity) and determinism.
 */

const request = require('supertest');
const path = require('path');
const {
  authenticateUser,
  createTestDocument,
  createTestParagraph,
  createTestProposal,
  safeDeleteTestDatabase
} = require('../utils/test-helpers');

let server;
let authToken;
let testDocumentId;
let testParagraphId;
let testProposalId;
let testDbPath;

describe('Ballot export API', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';
    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3016, returnServer: true });
    await new Promise(resolve => setTimeout(resolve, 3000));

    authToken = await authenticateUser(server, 'alice@example.com', 'SecurePass123!');

    const document = await createTestDocument(server, authToken, {
      title: 'Ballot export test doc',
      ownershipType: 'personal'
    });
    testDocumentId = document.id;

    const paragraph = await createTestParagraph(server, authToken, testDocumentId);
    testParagraphId = paragraph.id;

    const proposal = await createTestProposal(server, authToken, testDocumentId, testParagraphId);
    testProposalId = proposal.id;
  });

  afterAll(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    await safeDeleteTestDatabase(testDbPath);
  });

  describe('GET /api/verification/ballots', () => {
    test('returns 401 without auth', async () => {
      await request(server)
        .get('/api/verification/ballots')
        .query({ voteType: 'paragraph', contestId: testProposalId })
        .expect(401);
    });

    test('returns 400 when voteType missing', async () => {
      const res = await request(server)
        .get('/api/verification/ballots')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ contestId: testProposalId })
        .expect(400);
      expect(res.body.code || res.body.error).toBeDefined();
    });

    test('returns 400 when contestId missing', async () => {
      await request(server)
        .get('/api/verification/ballots')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ voteType: 'paragraph' })
        .expect(400);
    });

    test('returns 400 for invalid voteType', async () => {
      await request(server)
        .get('/api/verification/ballots')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ voteType: 'invalid_type', contestId: testProposalId })
        .expect(400);
    });

    test('returns 404 for non-existent contest', async () => {
      await request(server)
        .get('/api/verification/ballots')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ voteType: 'paragraph', contestId: 'non-existent-id-12345' })
        .expect(404);
    });

    test('returns 403 when contest is not closed', async () => {
      const db = server._dbManager && server._dbManager.db;
      if (!db) return;
      await db('documents').where({ id: testDocumentId }).update({ status: 'voting' });
      const res = await request(server)
        .get('/api/verification/ballots')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ voteType: 'paragraph', contestId: testProposalId });
      await db('documents').where({ id: testDocumentId }).update({ status: 'draft' });
      expect(res.status).toBe(403);
      expect(res.body.code === 'CONTEST_NOT_CLOSED' || res.body.error).toBeTruthy();
    });

    test('returns 200 and ballots array for closed paragraph contest (draft doc)', async () => {
      const res = await request(server)
        .get('/api/verification/ballots')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ voteType: 'paragraph', contestId: testProposalId })
        .expect(200);

      expect(res.body).toHaveProperty('contestId', testProposalId);
      expect(res.body).toHaveProperty('voteType', 'paragraph');
      expect(Array.isArray(res.body.ballots)).toBe(true);
      expect(res.body).toHaveProperty('closedAt');
      expect(res.body.announcedResult).toBeDefined();
      expect(res.body.announcedResult).toMatchObject({
        pro: expect.any(Number),
        contra: expect.any(Number),
        neutral: expect.any(Number),
        total: expect.any(Number)
      });
    });

    test('exported ballots do not contain forbidden fields (anonymous)', async () => {
      const res = await request(server)
        .get('/api/verification/ballots')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ voteType: 'paragraph', contestId: testProposalId })
        .expect(200);

      const forbidden = ['user_id', 'user_name', 'user_email', 'anonymous_token', 'voter_token'];
      for (const ballot of res.body.ballots || []) {
        for (const key of forbidden) {
          expect(ballot).not.toHaveProperty(key);
        }
      }
    });

    test('determinism: same contest exported twice yields identical ballots', async () => {
      const res1 = await request(server)
        .get('/api/verification/ballots')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ voteType: 'paragraph', contestId: testProposalId })
        .expect(200);

      const res2 = await request(server)
        .get('/api/verification/ballots')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ voteType: 'paragraph', contestId: testProposalId })
        .expect(200);

      expect(res1.body.ballots).toEqual(res2.body.ballots);
    });

    test('returns 403 when user lacks contest access', async () => {
      const bobToken = await authenticateUser(server, 'bob@example.com', 'SecurePass123!');
      await request(server)
        .get('/api/verification/ballots')
        .set('Authorization', `Bearer ${bobToken}`)
        .query({ voteType: 'paragraph', contestId: testProposalId })
        .expect(403);
    });
  });

  describe('GET /api/verification/verify', () => {
    test('returns 200 with match true and computed equal to announcedResult for closed contest', async () => {
      const res = await request(server)
        .get('/api/verification/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ voteType: 'paragraph', contestId: testProposalId })
        .expect(200);

      expect(res.body).toHaveProperty('match', true);
      expect(res.body).toHaveProperty('contestId', testProposalId);
      expect(res.body).toHaveProperty('voteType', 'paragraph');
      expect(res.body.computed).toMatchObject({
        pro: expect.any(Number),
        contra: expect.any(Number),
        neutral: expect.any(Number),
        total: expect.any(Number)
      });
      expect(res.body.announcedResult).toBeDefined();
      expect(res.body.computed).toEqual(res.body.announcedResult);
    });

    test('returns 401 without auth', async () => {
      await request(server)
        .get('/api/verification/verify')
        .query({ voteType: 'paragraph', contestId: testProposalId })
        .expect(401);
    });

    test('returns 400 when voteType missing', async () => {
      await request(server)
        .get('/api/verification/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ contestId: testProposalId })
        .expect(400);
    });
  });
});
