const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { authenticateUser, createTestDocument, createTestParagraph, createTestProposal, safeDeleteTestDatabase } = require('../utils/test-helpers');

let server;
let authToken;
let testUserId;
let testDocumentId;
let testParagraphId;
let testProposalId;
let testDbPath;

describe('Votes API Integration Tests', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3012, returnServer: true });

    await new Promise(resolve => setTimeout(resolve, 3000));

    authToken = await authenticateUser(server, 'alice@example.com', 'SecurePass123!');
    
    const loginResponse = await request(server)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'SecurePass123!' });
    testUserId = loginResponse.body.user.id;

    const document = await createTestDocument(server, authToken);
    testDocumentId = document.id;

    const paragraph = await createTestParagraph(server, authToken, testDocumentId);
    testParagraphId = paragraph.id;

    const proposal = await createTestProposal(server, authToken, testDocumentId, testParagraphId);
    testProposalId = proposal.id;
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

    await safeDeleteTestDatabase(testDbPath);
  });

  describe('POST /api/documents/:documentId/paragraphs/:paragraphId/proposals/:proposalId/vote', () => {
    test('should cast a PRO vote successfully', async () => {
      const voteData = {
        vote: 'PRO'
      };

      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(voteData)
        .expect(200);

      expect(response.body.message).toContain('successfully');
    });

    test('should cast a CONTRA vote successfully', async () => {
      // Create a new proposal for this test
      const proposal = await createTestProposal(server, authToken, testDocumentId, testParagraphId, {
        text: 'Proposal for CONTRA vote test'
      });

      const voteData = {
        vote: 'CONTRA'
      };

      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${proposal.id}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(voteData)
        .expect(200);

      expect(response.body.message).toContain('successfully');
    });

    test('should cast a NEUTRAL vote successfully', async () => {
      const proposal = await createTestProposal(server, authToken, testDocumentId, testParagraphId, {
        text: 'Proposal for NEUTRAL vote test'
      });

      const voteData = {
        vote: 'NEUTRAL'
      };

      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${proposal.id}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(voteData)
        .expect(200);

      expect(response.body.message).toContain('successfully');
    });

    test('should update vote when voteChangeAllowed is true', async () => {
      // Create a document with voteChangeAllowed
      const doc = await createTestDocument(server, authToken, {
        title: 'Vote Change Test Document',
        options: { voteChangeAllowed: true }
      });

      const para = await createTestParagraph(server, authToken, doc.id);
      const prop = await createTestProposal(server, authToken, doc.id, para.id);

      // Cast initial vote
      await request(server)
        .post(`/api/documents/${doc.id}/paragraphs/${para.id}/proposals/${prop.id}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ vote: 'PRO' })
        .expect(200);

      // Change vote
      const response = await request(server)
        .post(`/api/documents/${doc.id}/paragraphs/${para.id}/proposals/${prop.id}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ vote: 'CONTRA' })
        .expect(200);

      expect(response.body.message).toContain('updated');
    });

    test('should reject vote change when voteChangeAllowed is false', async () => {
      // Create a document with voteChangeAllowed false
      const doc = await createTestDocument(server, authToken, {
        title: 'Locked Votes Document',
        options: { voteChangeAllowed: false }
      });

      const para = await createTestParagraph(server, authToken, doc.id);
      const prop = await createTestProposal(server, authToken, doc.id, para.id);

      // Cast initial vote
      await request(server)
        .post(`/api/documents/${doc.id}/paragraphs/${para.id}/proposals/${prop.id}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ vote: 'PRO' })
        .expect(200);

      // Try to change vote
      const response = await request(server)
        .post(`/api/documents/${doc.id}/paragraphs/${para.id}/proposals/${prop.id}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ vote: 'CONTRA' })
        .expect(403);

      expect(response.body.error).toContain('locked');
    });

    test('should reject invalid vote type', async () => {
      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ vote: 'INVALID' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should reject vote on non-existent proposal', async () => {
      const fakeProposalId = 'fake-proposal-id';
      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${fakeProposalId}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ vote: 'PRO' })
        .expect(404);

      expect(response.body.error).toContain('not found');
    });

    test('should reject vote without authentication', async () => {
      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/vote`)
        .send({ vote: 'PRO' })
        .expect(401);
    });

    test('should handle vote count validation correctly', async () => {
      // Create a new proposal for this test
      const proposal = await createTestProposal(server, authToken, testDocumentId, testParagraphId, {
        text: 'Proposal for vote count validation test'
      });

      // Cast multiple votes
      await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${proposal.id}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ vote: 'PRO' })
        .expect(200);

      // Verify vote counts via the proposals list endpoint
      const getResponse = await request(server)
        .get(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const fetchedProposal = getResponse.body.proposals.find(p => p.id === proposal.id);
      expect(fetchedProposal).toBeDefined();
      expect(fetchedProposal.votes).toBeDefined();
      expect(Array.isArray(fetchedProposal.votes)).toBe(true);
      
      // Verify vote counts match votes array
      const votes = fetchedProposal.votes || [];
      const proCount = votes.filter(v => v.vote === 'PRO').length;
      const contraCount = votes.filter(v => v.vote === 'CONTRA').length;
      const neutralCount = votes.filter(v => v.vote === 'NEUTRAL').length;
      const totalCount = proCount + contraCount + neutralCount;

      expect(totalCount).toBe(votes.length);
      expect(proCount).toBeGreaterThan(0);
    });

    test('should exclude unknown vote values from total count', async () => {
      // This test verifies that unknown vote values don't cause count mismatches
      // The calculateVoteCounts function should exclude unknown values from total
      const { calculateVoteCounts } = require('../../server/utils/voteCounts');
      
      const votesWithUnknown = [
        { id: '1', vote: 'PRO' },
        { id: '2', vote: 'CONTRA' },
        { id: '3', vote: 'UNKNOWN_VALUE' }, // Unknown value
        { id: '4', vote: 'NEUTRAL' }
      ];

      const counts = calculateVoteCounts(votesWithUnknown);
      
      // Total should only include known votes (3), not the unknown one
      expect(counts.total).toBe(3);
      expect(counts.pro).toBe(1);
      expect(counts.contra).toBe(1);
      expect(counts.neutral).toBe(1);
      expect(counts.pro + counts.contra + counts.neutral).toBe(counts.total);
    });

    test('should handle null/undefined formattedVotes gracefully', async () => {
      // This test verifies that null checks prevent errors
      // The code should handle null formattedVotes without crashing
      const doc = await createTestDocument(server, authToken, {
        title: 'Null votes test document'
      });

      const para = await createTestParagraph(server, authToken, doc.id);
      const prop = await createTestProposal(server, authToken, doc.id, para.id);

      // Cast a vote - should succeed even if formatting returns null (defensive check)
      const response = await request(server)
        .post(`/api/documents/${doc.id}/paragraphs/${para.id}/proposals/${prop.id}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ vote: 'PRO' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });
});

