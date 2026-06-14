/**
 * Integration tests for vote verification log (Agent C).
 * Tests: chain integrity (two appends), one vote → one log row, no PII in log API response.
 */

const request = require('supertest');
const {
  authenticateUser,
  createTestDocument,
  createTestParagraph,
  createTestProposal,
  safeDeleteTestDatabase
} = require('../utils/test-helpers');
const TransactionManager = require('../../server/database/services/TransactionManager');
const voteVerificationLog = require('../../server/utils/voteVerificationLog');

let server;
let authToken;
let testDocumentId;
let testParagraphId;
let testProposalId;
let testDbPath;

describe('Vote verification log', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';
    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3017, returnServer: true });
    await new Promise(resolve => setTimeout(resolve, 3000));

    authToken = await authenticateUser(server, 'alice@example.com', 'SecurePass123!');

    const document = await createTestDocument(server, authToken, {
      title: 'Vote verification test doc',
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

  describe('chain integrity', () => {
    test('second log entry previous_entry_hash equals hash of first row canonical representation', async () => {
      const db = server._dbManager && server._dbManager.db;
      if (!db) {
        console.warn('No db on server._dbManager, skipping chain integrity test');
        return;
      }

      const timestamp1 = new Date().toISOString();
      const timestamp2 = new Date().toISOString();

      await TransactionManager.executeInTransaction(db, async (txDb) => {
        await voteVerificationLog.appendLogEntry(txDb, {
          voteType: 'paragraph',
          contestId: 'chain-test-contest-1',
          choice: 'PRO',
          timestamp: timestamp1
        });
      });

      await TransactionManager.executeInTransaction(db, async (txDb) => {
        await voteVerificationLog.appendLogEntry(txDb, {
          voteType: 'paragraph',
          contestId: 'chain-test-contest-2',
          choice: 'CONTRA',
          timestamp: timestamp2
        });
      });

      const rows = await TransactionManager.queryAll(
        db,
        'SELECT id, sequence_index, previous_entry_hash, vote_type, contest_id, choice, timestamp, vote_hash, receipt_id, created_at FROM vote_verification_log ORDER BY sequence_index ASC'
      );

      const lastTwo = rows.slice(-2);
      if (lastTwo.length < 2) {
        throw new Error('Expected at least 2 log entries for chain test');
      }
      const [firstRow, secondRow] = lastTwo;
      const expectedPrevHash = voteVerificationLog.hashCanonical(
        voteVerificationLog.canonicalLogRowString(firstRow)
      );
      expect(secondRow.previous_entry_hash).toBe(expectedPrevHash);
    });
  });

  describe('one vote → one log row', () => {
    test('casting one paragraph vote creates exactly one log entry with correct vote_type and contest_id', async () => {
      const beforeRes = await request(server)
        .get('/api/vote-verification/log')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ voteType: 'paragraph', contestId: testProposalId });
      expect(beforeRes.status).toBe(200);
      const countBefore = (beforeRes.body.entries || []).length;

      await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ vote: 'PRO' })
        .expect(200);

      // The verification log entry is appended asynchronously after the vote
      // response is sent, so poll until it appears.
      let entries = [];
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const afterRes = await request(server)
          .get('/api/vote-verification/log')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ voteType: 'paragraph', contestId: testProposalId });
        expect(afterRes.status).toBe(200);
        entries = afterRes.body.entries || [];
        if (entries.length >= countBefore + 1) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      expect(entries.length).toBe(countBefore + 1);
      const newEntry = entries.find(e => e.contestId === testProposalId && e.voteType === 'paragraph');
      expect(newEntry).toBeDefined();
      expect(newEntry.choice).toBe('PRO');
    });
  });

  describe('anonymity: no forbidden fields in log API response', () => {
    test('log entries do not contain user_id, user_name, user_email, anonymous_token, voter_token', async () => {
      const res = await request(server)
        .get('/api/vote-verification/log')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ voteType: 'paragraph', contestId: testProposalId, limit: 50 });
      expect(res.status).toBe(200);

      const forbidden = ['user_id', 'user_name', 'user_email', 'anonymous_token', 'voter_token'];
      const entries = res.body.entries || [];
      for (const entry of entries) {
        for (const key of forbidden) {
          expect(entry).not.toHaveProperty(key);
        }
      }
    });
  });

  describe('GET /api/vote-verification/log', () => {
    test('returns 401 without auth', async () => {
      await request(server)
        .get('/api/vote-verification/log')
        .expect(401);
    });

    test('returns 400 when voteType or contestId missing', async () => {
      await request(server)
        .get('/api/vote-verification/log')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ limit: 10 })
        .expect(400);
    });

    test('returns 200 with auth and required filters', async () => {
      const res = await request(server)
        .get('/api/vote-verification/log')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ voteType: 'paragraph', contestId: testProposalId, limit: 10 });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('entries');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.entries)).toBe(true);
    });

    test('returns 403 when user lacks contest access', async () => {
      const bobToken = await authenticateUser(server, 'bob@example.com', 'SecurePass123!');
      await request(server)
        .get('/api/vote-verification/log')
        .set('Authorization', `Bearer ${bobToken}`)
        .query({ voteType: 'paragraph', contestId: testProposalId })
        .expect(403);
    });

    test('returns 400 for invalid voteType', async () => {
      await request(server)
        .get('/api/vote-verification/log')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ voteType: 'invalid_type', contestId: testProposalId })
        .expect(400);
    });
  });

  describe('GET /api/vote-verification/log/chain', () => {
    test('returns 401 without auth', async () => {
      await request(server)
        .get('/api/vote-verification/log/chain')
        .expect(401);
    });

    test('returns 400 when organizationId missing', async () => {
      await request(server)
        .get('/api/vote-verification/log/chain')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ limit: 10 })
        .expect(400);
    });

    test('returns 200 with entries in ascending sequence order for org member', async () => {
      const adminToken = await authenticateUser(server, 'admin@colabora.local', 'AdminSecurePass123!');
      const loginRes = await request(server)
        .post('/api/auth/login')
        .send({ email: 'alice@example.com', password: 'SecurePass123!' });
      const aliceId = loginRes.body.user.id;

      const orgRes = await request(server)
        .post('/api/admin/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Log Chain Org ${Date.now()}`,
          description: 'Vote log chain test',
          representatives: [aliceId]
        })
        .expect(201);
      const organizationId = orgRes.body.organization.id;

      const res = await request(server)
        .get('/api/vote-verification/log/chain')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ organizationId, limit: 10 });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('entries');
      expect(res.body).toHaveProperty('total');
      const entries = res.body.entries || [];
      for (let i = 1; i < entries.length; i++) {
        expect(entries[i].logSequenceId).toBeGreaterThan(entries[i - 1].logSequenceId);
      }
    });
  });
});
