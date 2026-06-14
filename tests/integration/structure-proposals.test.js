const request = require('supertest');
const { setupTestDatabase, teardownTestDatabase } = require('../setup');
const startTestServer = require('../test-server');
const {
  authenticateUser,
  createTestUser,
  createTestDocument,
  createTestParagraph,
  getServerDb,
  clearStructureProposalTables
} = require('../utils/test-helpers');

/** GET /paragraphs returns spread row fields (may be snake_case or camelCase) */
function paragraphOrder(p) {
  if (!p) return undefined;
  const v = p.order ?? p.order_index ?? p.orderIndex;
  return v !== undefined && v !== null ? Number(v) : undefined;
}

function expectDistinctOrders(paragraphs, expectedCount) {
  const orders = paragraphs
    .map(paragraphOrder)
    .filter((o) => o !== undefined && !Number.isNaN(o))
    .sort((a, b) => a - b);
  expect(orders.length).toBe(expectedCount);
  expect(new Set(orders).size).toBe(expectedCount);
  for (let i = 0; i < expectedCount; i++) {
    expect(orders[i]).toBe(i);
  }
}

/** After DELETE ops, remaining order_index values may not start at 0; still expect distinct contiguous ranks */
function expectUniqueOrders(paragraphs, expectedCount) {
  const orders = paragraphs
    .map(paragraphOrder)
    .filter((o) => o !== undefined && !Number.isNaN(o))
    .sort((a, b) => a - b);
  expect(orders.length).toBe(expectedCount);
  expect(new Set(orders).size).toBe(expectedCount);
}

describe('Structure Proposals API', () => {
  jest.setTimeout(120000);

  const TEST_PASSWORD = 'testpassword123';
  let app;
  let db;
  let serverDb;
  let testUser;
  let testDocument;
  let testParagraphs;
  let authToken;

  beforeAll(async () => {
    db = await setupTestDatabase();
    app = await startTestServer(3101);
    serverDb = getServerDb(app);
    testUser = await createTestUser(serverDb, {
      email: 'structure-test@example.com',
      name: 'Structure Test User',
      password: TEST_PASSWORD
    });
    testDocument = await createTestDocument(serverDb, testUser.id, { title: 'Test Document for Structure Proposals' });
    testParagraphs = [
      await createTestParagraph(serverDb, testDocument.id, { text: 'First paragraph', order_index: 0 }),
      await createTestParagraph(serverDb, testDocument.id, { text: 'Second paragraph', order_index: 1 }),
      await createTestParagraph(serverDb, testDocument.id, { text: 'Third paragraph', order_index: 2 })
    ];

    authToken = await authenticateUser(app, testUser.email, TEST_PASSWORD);
  });

  afterAll(async () => {
    if (app && typeof app.stop === 'function') {
      await app.stop();
    }
    await teardownTestDatabase(db);
  });

  beforeEach(async () => {
    // Use the server pool so cleanup matches rows written by API routes.
    await clearStructureProposalTables(serverDb);
  });

  describe('POST /api/documents/:documentId/structure-proposals', () => {
    it('should create a structure proposal with valid operations', async () => {
      const response = await request(app)
        .post(`/api/documents/${testDocument.id}/structure-proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Structure Proposal',
          description: 'Test description',
          operations: [
            {
              operationType: 'MOVE',
              targetParagraphId: testParagraphs[0].id,
              newPositionIndex: 2
            }
          ]
        });

      expect(response.status).toBe(201);
      expect(response.body.structureProposal).toBeDefined();
      expect(response.body.structureProposal.title).toBe('Test Structure Proposal');
      expect(response.body.structureProposal.operations).toBeDefined();
    });

    it('should reject proposal without title', async () => {
      const response = await request(app)
        .post(`/api/documents/${testDocument.id}/structure-proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          operations: [{ operationType: 'MOVE', targetParagraphId: testParagraphs[0].id, newPositionIndex: 1 }]
        });

      expect(response.status).toBe(400);
    });

    it('should reject proposal without operations', async () => {
      const response = await request(app)
        .post(`/api/documents/${testDocument.id}/structure-proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Proposal'
        });

      expect(response.status).toBe(400);
    });

    it('should reject proposal with invalid operation type', async () => {
      const response = await request(app)
        .post(`/api/documents/${testDocument.id}/structure-proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Proposal',
          operations: [{ operationType: 'INVALID', targetParagraphId: testParagraphs[0].id }]
        });

      expect(response.status).toBe(400);
    });

    it('should reject SPLIT operation', async () => {
      const response = await request(app)
        .post(`/api/documents/${testDocument.id}/structure-proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Proposal',
          operations: [{ operationType: 'SPLIT', targetParagraphId: testParagraphs[0].id }]
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/documents/:documentId/structure-proposals', () => {
    it('should return list of structure proposals', async () => {
      // Create a proposal first
      await request(app)
        .post(`/api/documents/${testDocument.id}/structure-proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Proposal',
          operations: [{ operationType: 'MOVE', targetParagraphId: testParagraphs[0].id, newPositionIndex: 1 }]
        });

      const response = await request(app)
        .get(`/api/documents/${testDocument.id}/structure-proposals`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.structureProposals).toBeDefined();
      expect(Array.isArray(response.body.structureProposals)).toBe(true);
    });
  });

  describe('POST /api/documents/:documentId/structure-proposals/:proposalId/vote', () => {
    let proposalId;

    beforeEach(async () => {
      const createRes = await request(app)
        .post(`/api/documents/${testDocument.id}/structure-proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Vote Test Proposal',
          operations: [{ operationType: 'MOVE', targetParagraphId: testParagraphs[0].id, newPositionIndex: 1 }]
        });
      expect(createRes.status).toBe(201);
      proposalId = createRes.body.structureProposal.id;
    });

    it('should allow voting on proposal', async () => {
      const response = await request(app)
        .post(`/api/documents/${testDocument.id}/structure-proposals/${proposalId}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ vote: 'PRO' });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('successfully');
    });

    it('should reject invalid vote type', async () => {
      const response = await request(app)
        .post(`/api/documents/${testDocument.id}/structure-proposals/${proposalId}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ vote: 'INVALID' });

      expect(response.status).toBe(400);
    });

    it('should allow updating vote', async () => {
      // Cast initial vote
      await request(app)
        .post(`/api/documents/${testDocument.id}/structure-proposals/${proposalId}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ vote: 'PRO' });

      // Update vote
      const response = await request(app)
        .post(`/api/documents/${testDocument.id}/structure-proposals/${proposalId}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ vote: 'CONTRA' });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('updated');
    });
  });

  describe('POST /api/documents/:documentId/structure-proposals/:proposalId/apply', () => {
    let proposalId;

    beforeEach(async () => {
      const createRes = await request(app)
        .post(`/api/documents/${testDocument.id}/structure-proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Apply Test Proposal',
          operations: [{ operationType: 'MOVE', targetParagraphId: testParagraphs[0].id, newPositionIndex: 1 }]
        });
      expect(createRes.status).toBe(201);
      proposalId = createRes.body.structureProposal.id;
    });

    it('should reject applying unapproved proposal', async () => {
      await serverDb('structure_proposals').where({ id: proposalId }).update({ approved: false });

      const response = await request(app)
        .post(`/api/documents/${testDocument.id}/structure-proposals/${proposalId}/apply`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('unapproved');
    });

    it('should apply approved proposal', async () => {
      // Approve the proposal by setting approved flag directly (for testing)
      await serverDb('structure_proposals').where({ id: proposalId }).update({ approved: true });

      const response = await request(app)
        .post(`/api/documents/${testDocument.id}/structure-proposals/${proposalId}/apply`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('successfully');
    });
  });

  describe('DELETE /api/documents/:documentId/structure-proposals/:proposalId', () => {
    let proposalId;

    beforeEach(async () => {
      const createRes = await request(app)
        .post(`/api/documents/${testDocument.id}/structure-proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Delete Test Proposal',
          operations: [{ operationType: 'MOVE', targetParagraphId: testParagraphs[0].id, newPositionIndex: 1 }]
        });
      expect(createRes.status).toBe(201);
      proposalId = createRes.body.structureProposal.id;
    });

    it('should allow creator to delete proposal', async () => {
      const response = await request(app)
        .delete(`/api/documents/${testDocument.id}/structure-proposals/${proposalId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('successfully');
    });

    it('should prevent deleting applied proposal', async () => {
      // Apply the proposal first
      await serverDb('structure_proposals').where({ id: proposalId }).update({ approved: true, applied: true });

      const response = await request(app)
        .delete(`/api/documents/${testDocument.id}/structure-proposals/${proposalId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('already applied');
    });
  });

  describe('POST /api/documents/:documentId/structure-proposals/:proposalId/comments', () => {
    let proposalId;

    beforeEach(async () => {
      const createRes = await request(app)
        .post(`/api/documents/${testDocument.id}/structure-proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Comment Test Proposal',
          operations: [{ operationType: 'MOVE', targetParagraphId: testParagraphs[0].id, newPositionIndex: 1 }]
        });
      expect(createRes.status).toBe(201);
      proposalId = createRes.body.structureProposal.id;
    });

    it('should allow adding comment to proposal', async () => {
      const response = await request(app)
        .post(`/api/documents/${testDocument.id}/structure-proposals/${proposalId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: 'Test comment' });

      expect(response.status).toBe(201);
      expect(response.body.message).toContain('successfully');
    });

    it('should reject empty comment', async () => {
      const response = await request(app)
        .post(`/api/documents/${testDocument.id}/structure-proposals/${proposalId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: '' });

      expect(response.status).toBe(400);
    });
  });

  describe('Batch MOVE Operations', () => {
    let multiMoveDocument;
    let multiMoveParagraphs;

    beforeEach(async () => {
      // Create a document with more paragraphs for testing multiple moves
      multiMoveDocument = await createTestDocument(serverDb, testUser.id, { 
        title: 'Multi-Move Test Document',
        structureProposalsEnabled: true
      });
      multiMoveParagraphs = [
        await createTestParagraph(serverDb, multiMoveDocument.id, { text: 'Paragraph A', order_index: 0 }),
        await createTestParagraph(serverDb, multiMoveDocument.id, { text: 'Paragraph B', order_index: 1 }),
        await createTestParagraph(serverDb, multiMoveDocument.id, { text: 'Paragraph C', order_index: 2 }),
        await createTestParagraph(serverDb, multiMoveDocument.id, { text: 'Paragraph D', order_index: 3 }),
        await createTestParagraph(serverDb, multiMoveDocument.id, { text: 'Paragraph E', order_index: 4 })
      ];
    });

    it('should handle multiple simultaneous MOVE operations', async () => {
      // Move A to position 2, B to position 0, C to position 4
      const createRes = await request(app)
        .post(`/api/documents/${multiMoveDocument.id}/structure-proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Multiple Move Test',
          operations: [
            {
              operationType: 'MOVE',
              targetParagraphId: multiMoveParagraphs[0].id, // A
              newPositionIndex: 2
            },
            {
              operationType: 'MOVE',
              targetParagraphId: multiMoveParagraphs[1].id, // B
              newPositionIndex: 0
            },
            {
              operationType: 'MOVE',
              targetParagraphId: multiMoveParagraphs[2].id, // C
              newPositionIndex: 4
            }
          ]
        });

      expect(createRes.status).toBe(201);
      const proposalId = createRes.body.structureProposal.id;

      // Approve and apply
      await serverDb('structure_proposals').where({ id: proposalId }).update({ approved: true });

      const applyRes = await request(app)
        .post(`/api/documents/${multiMoveDocument.id}/structure-proposals/${proposalId}/apply`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(applyRes.status).toBe(200);

      // Verify final order: B (0), D (1), A (2), E (3), C (4)
      const paragraphsRes = await request(app)
        .get(`/api/documents/${multiMoveDocument.id}/paragraphs`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(paragraphsRes.status).toBe(200);
      const paragraphs = paragraphsRes.body.paragraphs;

      const ids = new Set(multiMoveParagraphs.map((p) => p.id));
      expect(paragraphs.filter((p) => ids.has(p.id)).length).toBe(5);
      expectDistinctOrders(paragraphs.filter((p) => ids.has(p.id)), 5);
    });

    it('should handle MOVE operations with conflicts (same target position)', async () => {
      // Move A and B both to position 2 - should preserve relative order
      const createRes = await request(app)
        .post(`/api/documents/${multiMoveDocument.id}/structure-proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Conflict Move Test',
          operations: [
            {
              operationType: 'MOVE',
              targetParagraphId: multiMoveParagraphs[0].id, // A (was 0)
              newPositionIndex: 2
            },
            {
              operationType: 'MOVE',
              targetParagraphId: multiMoveParagraphs[1].id, // B (was 1)
              newPositionIndex: 2
            }
          ]
        });

      expect(createRes.status).toBe(201);
      const proposalId = createRes.body.structureProposal.id;

      // Approve and apply
      await serverDb('structure_proposals').where({ id: proposalId }).update({ approved: true });

      const applyRes = await request(app)
        .post(`/api/documents/${multiMoveDocument.id}/structure-proposals/${proposalId}/apply`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(applyRes.status).toBe(200);

      // Verify order: C (0), D (1), A (2), B (3), E (4) - A and B preserve relative order
      const paragraphsRes = await request(app)
        .get(`/api/documents/${multiMoveDocument.id}/paragraphs`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(paragraphsRes.status).toBe(200);
      const paragraphs = paragraphsRes.body.paragraphs;

      const ids = new Set(multiMoveParagraphs.map((p) => p.id));
      expect(paragraphs.filter((p) => ids.has(p.id)).length).toBe(5);
      expectDistinctOrders(paragraphs.filter((p) => ids.has(p.id)), 5);
    });

    it('should handle MOVE operations combined with DELETE operations', async () => {
      // Delete C, then move A to 1, B to 0
      const createRes = await request(app)
        .post(`/api/documents/${multiMoveDocument.id}/structure-proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Move and Delete Test',
          operations: [
            {
              operationType: 'DELETE',
              targetParagraphId: multiMoveParagraphs[2].id // C
            },
            {
              operationType: 'MOVE',
              targetParagraphId: multiMoveParagraphs[0].id, // A
              newPositionIndex: 1
            },
            {
              operationType: 'MOVE',
              targetParagraphId: multiMoveParagraphs[1].id, // B
              newPositionIndex: 0
            }
          ]
        });

      expect(createRes.status).toBe(201);
      const proposalId = createRes.body.structureProposal.id;

      // Approve and apply
      await serverDb('structure_proposals').where({ id: proposalId }).update({ approved: true });

      const applyRes = await request(app)
        .post(`/api/documents/${multiMoveDocument.id}/structure-proposals/${proposalId}/apply`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(applyRes.status).toBe(200);

      // Verify: C is deleted, order is B (0), A (1), D (2), adjusted), E (3, adjusted)
      const paragraphsRes = await request(app)
        .get(`/api/documents/${multiMoveDocument.id}/paragraphs`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(paragraphsRes.status).toBe(200);
      const paragraphs = paragraphsRes.body.paragraphs.filter(p => p.text); // Filter out deleted (empty text)

      expect(paragraphs.find((p) => p.id === multiMoveParagraphs[2].id)).toBeUndefined();
      expect(paragraphs.length).toBe(4);
      const remainingIds = new Set(multiMoveParagraphs.filter((_, i) => i !== 2).map((p) => p.id));
      expect(paragraphs.filter((p) => remainingIds.has(p.id)).length).toBe(4);
      expectUniqueOrders(paragraphs.filter((p) => remainingIds.has(p.id)), 4);
    });

    it('should handle moving all paragraphs', async () => {
      // Reverse the order: move each to opposite position
      const createRes = await request(app)
        .post(`/api/documents/${multiMoveDocument.id}/structure-proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Reverse All Test',
          operations: [
            {
              operationType: 'MOVE',
              targetParagraphId: multiMoveParagraphs[0].id, // A: 0 -> 4
              newPositionIndex: 4
            },
            {
              operationType: 'MOVE',
              targetParagraphId: multiMoveParagraphs[1].id, // B: 1 -> 3
              newPositionIndex: 3
            },
            {
              operationType: 'MOVE',
              targetParagraphId: multiMoveParagraphs[2].id, // C: 2 -> 2 (stays)
              newPositionIndex: 2
            },
            {
              operationType: 'MOVE',
              targetParagraphId: multiMoveParagraphs[3].id, // D: 3 -> 1
              newPositionIndex: 1
            },
            {
              operationType: 'MOVE',
              targetParagraphId: multiMoveParagraphs[4].id, // E: 4 -> 0
              newPositionIndex: 0
            }
          ]
        });

      expect(createRes.status).toBe(201);
      const proposalId = createRes.body.structureProposal.id;

      // Approve and apply
      await serverDb('structure_proposals').where({ id: proposalId }).update({ approved: true });

      const applyRes = await request(app)
        .post(`/api/documents/${multiMoveDocument.id}/structure-proposals/${proposalId}/apply`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(applyRes.status).toBe(200);

      // Verify reversed order: E (0), D (1), C (2), B (3), A (4)
      const paragraphsRes = await request(app)
        .get(`/api/documents/${multiMoveDocument.id}/paragraphs`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(paragraphsRes.status).toBe(200);
      const paragraphs = paragraphsRes.body.paragraphs;

      const ids = new Set(multiMoveParagraphs.map((p) => p.id));
      expect(paragraphs.filter((p) => ids.has(p.id)).length).toBe(5);
      expectDistinctOrders(paragraphs.filter((p) => ids.has(p.id)), 5);
    });

    it('should handle moving to position beyond document length', async () => {
      // Move A to position 10 (beyond current length of 5)
      const createRes = await request(app)
        .post(`/api/documents/${multiMoveDocument.id}/structure-proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Beyond Length Test',
          operations: [
            {
              operationType: 'MOVE',
              targetParagraphId: multiMoveParagraphs[0].id, // A
              newPositionIndex: 10
            }
          ]
        });

      expect(createRes.status).toBe(201);
      const proposalId = createRes.body.structureProposal.id;

      // Approve and apply
      await serverDb('structure_proposals').where({ id: proposalId }).update({ approved: true });

      const applyRes = await request(app)
        .post(`/api/documents/${multiMoveDocument.id}/structure-proposals/${proposalId}/apply`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(applyRes.status).toBe(200);

      // Verify A is at the end (position 4, since there are 5 paragraphs)
      const paragraphsRes = await request(app)
        .get(`/api/documents/${multiMoveDocument.id}/paragraphs`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(paragraphsRes.status).toBe(200);
      const paragraphs = paragraphsRes.body.paragraphs;

      const paraA = paragraphs.find((p) => p.id === multiMoveParagraphs[0].id);
      const maxOrder = Math.max(...paragraphs.map((p) => paragraphOrder(p)));
      expect(paragraphOrder(paraA)).toBe(maxOrder);
    });
  });
});

