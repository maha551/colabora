const request = require('supertest');
const { startApplication } = require('../../server/bootstrap');
const { safeDeleteTestDatabase, addActiveOrganizationMemberForTests } = require('../utils/test-helpers');

let server;
let testDbPath;
let adminToken;
let aliceToken;
let bobToken;
let bobId;
let aliceId;
let organizationId;
let rootDocId;
let siblingDocId;
let childDocId;

async function login(email, password) {
  const response = await request(server).post('/api/auth/login').send({ email, password }).expect(200);
  return { token: response.body.token, user: response.body.user };
}

async function createOrganizationDocument(token, payload) {
  const response = await request(server)
    .post('/api/documents')
    .set('Authorization', `Bearer ${token}`)
    .send({
      ownershipType: 'organizational',
      organizationId,
      ...payload
    })
    .expect(201);
  return response.body.document;
}

describe('Document Tree Proposals API Integration Tests', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';
    await safeDeleteTestDatabase(testDbPath);

    server = await startApplication({ port: 3030, returnServer: true });
    await new Promise(resolve => setTimeout(resolve, 3000));

    const admin = await login('admin@colabora.local', 'AdminSecurePass123!');
    const alice = await login('alice@example.com', 'SecurePass123!');
    const bob = await login('bob@example.com', 'SecurePass123!');
    adminToken = admin.token;
    aliceToken = alice.token;
    bobToken = bob.token;
    bobId = bob.user.id;
    aliceId = alice.user.id;

    const orgResponse = await request(server)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Tree Proposal Org ${Date.now()}`,
        description: 'Integration test organization',
        representatives: [aliceId],
        membershipPolicy: 'invitation'
      })
      .expect(201);
    organizationId = orgResponse.body.organization.id;

    await request(server)
      .post(`/api/organizations/${organizationId}/members`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ userId: aliceId, status: 'active' });

    const rootDoc = await createOrganizationDocument(aliceToken, { title: 'Root Document', description: 'root', sortOrder: 10 });
    rootDocId = rootDoc.id;
    const siblingDoc = await createOrganizationDocument(aliceToken, { title: 'Sibling Document', description: 'sibling', sortOrder: 20 });
    siblingDocId = siblingDoc.id;
    const childDoc = await createOrganizationDocument(aliceToken, {
      title: 'Child Document',
      description: 'child',
      parentId: rootDocId,
      sortOrder: 30
    });
    childDocId = childDoc.id;
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await safeDeleteTestDatabase(testDbPath);
  });

  test('rejects unauthenticated create', async () => {
    await request(server)
      .post('/api/document-tree-proposals')
      .send({ documentId: rootDocId, operationType: 'MOVE', targetParentId: siblingDocId })
      .expect(401);
  });

  test('rejects MOVE no-op proposal', async () => {
    const response = await request(server)
      .post('/api/document-tree-proposals')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ documentId: rootDocId, operationType: 'MOVE' })
      .expect(400);

    expect(response.body.code).toBe('MOVE_NO_OP');
  });

  test('rejects DELETE when document has children', async () => {
    const response = await request(server)
      .post('/api/document-tree-proposals')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ documentId: rootDocId, operationType: 'DELETE' })
      .expect(400);

    expect(response.body.code).toBe('DELETE_HAS_CHILDREN');
  });

  test('rejects REORDER with out-of-range and non-integer values', async () => {
    const nonInt = await request(server)
      .post('/api/document-tree-proposals')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ documentId: siblingDocId, operationType: 'REORDER', newOrder: 1.5 })
      .expect(400);
    expect(nonInt.body.code).toBe('REORDER_INVALID_NEW_ORDER');

    const outOfRange = await request(server)
      .post('/api/document-tree-proposals')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ documentId: siblingDocId, operationType: 'REORDER', newOrder: 10001 })
      .expect(400);
    expect(outOfRange.body.code).toBe('REORDER_NEW_ORDER_OUT_OF_RANGE');
  });

  test('supports MOVE proposal lifecycle create -> vote -> complete -> apply', async () => {
    const createResponse = await request(server)
      .post('/api/document-tree-proposals')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        documentId: siblingDocId,
        operationType: 'MOVE',
        targetParentId: rootDocId,
        reason: 'Group related documents'
      })
      .expect(201);
    const proposalId = createResponse.body.proposal.id;

    const listResponse = await request(server)
      .get(`/api/document-tree-proposals/${siblingDocId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(Array.isArray(listResponse.body.proposals)).toBe(true);
    expect(listResponse.body.proposals.some((p) => p.id === proposalId)).toBe(true);

    await request(server)
      .post(`/api/document-tree-proposals/${proposalId}/vote`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ vote: 'PRO' })
      .expect(200);

    const completeResponse = await request(server)
      .post(`/api/document-tree-proposals/${proposalId}/complete`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    expect(completeResponse.body.applied).toBe(true);
    expect(completeResponse.body.outcome).toBe('approved');

    const movedDoc = await request(server)
      .get(`/api/documents/${siblingDocId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(movedDoc.body.document.parentId).toBe(rootDocId);
  });

  test('supports REORDER proposal lifecycle and applies new sort order', async () => {
    const createResponse = await request(server)
      .post('/api/document-tree-proposals')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        documentId: rootDocId,
        operationType: 'REORDER',
        newOrder: 55,
        reason: 'Prioritize this document'
      })
      .expect(201);
    const proposalId = createResponse.body.proposal.id;

    await request(server)
      .post(`/api/document-tree-proposals/${proposalId}/vote`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ vote: 'PRO' })
      .expect(200);

    const completeResponse = await request(server)
      .post(`/api/document-tree-proposals/${proposalId}/complete`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    expect(completeResponse.body.applied).toBe(true);
    const reorderedDoc = await request(server)
      .get(`/api/documents/${rootDocId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(reorderedDoc.body.document.sortOrder).toBe(55);
  });

  test('supports DELETE proposal lifecycle and removes document', async () => {
    const deleteTarget = await createOrganizationDocument(aliceToken, {
      title: 'Delete Target',
      description: 'leaf to delete',
      parentId: rootDocId,
      sortOrder: 60
    });

    const createResponse = await request(server)
      .post('/api/document-tree-proposals')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        documentId: deleteTarget.id,
        operationType: 'DELETE',
        reason: 'No longer needed'
      })
      .expect(201);
    const proposalId = createResponse.body.proposal.id;

    await request(server)
      .post(`/api/document-tree-proposals/${proposalId}/vote`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ vote: 'PRO' })
      .expect(200);

    const completeResponse = await request(server)
      .post(`/api/document-tree-proposals/${proposalId}/complete`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(completeResponse.body.applied).toBe(true);

    await request(server)
      .get(`/api/documents/${deleteTarget.id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(404);
  });

  test('blocks users without document access from voting tree proposals', async () => {
    const createResponse = await request(server)
      .post('/api/document-tree-proposals')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        documentId: childDocId,
        operationType: 'REORDER',
        newOrder: 70
      })
      .expect(201);
    const proposalId = createResponse.body.proposal.id;

    const voteResponse = await request(server)
      .post(`/api/document-tree-proposals/${proposalId}/vote`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ vote: 'PRO' })
      .expect(404);
    expect(voteResponse.body.code).toBe('DOCUMENT_NOT_FOUND_OR_ACCESS_DENIED');
  });

  test('blocks non-representative org members from completing tree proposals', async () => {
    await addActiveOrganizationMemberForTests(server, organizationId, aliceToken, {
      id: bobId,
      email: 'bob@example.com',
      password: 'SecurePass123!',
    });

    // Use a fresh document — only one pending tree proposal is allowed per document.
    const targetDoc = await createOrganizationDocument(aliceToken, {
      title: 'Non-Rep Complete Target', description: 'leaf', parentId: rootDocId, sortOrder: 71
    });

    const createResponse = await request(server)
      .post('/api/document-tree-proposals')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        documentId: targetDoc.id,
        operationType: 'REORDER',
        newOrder: 71
      })
      .expect(201);
    const proposalId = createResponse.body.proposal.id;

    await request(server)
      .post(`/api/document-tree-proposals/${proposalId}/vote`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ vote: 'PRO' })
      .expect(200);

    const completeResponse = await request(server)
      .post(`/api/document-tree-proposals/${proposalId}/complete`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(403);
    expect(completeResponse.body.code).toBe('NOT_REPRESENTATIVE');
  });

  test('blocks non-creators from deleting tree proposals', async () => {
    // Use a fresh document — only one pending tree proposal is allowed per document.
    const targetDoc = await createOrganizationDocument(aliceToken, {
      title: 'Non-Creator Delete Target', description: 'leaf', parentId: rootDocId, sortOrder: 72
    });

    const createResponse = await request(server)
      .post('/api/document-tree-proposals')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        documentId: targetDoc.id,
        operationType: 'REORDER',
        newOrder: 72
      })
      .expect(201);
    const proposalId = createResponse.body.proposal.id;

    const deleteResponse = await request(server)
      .delete(`/api/document-tree-proposals/${proposalId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(403);
    expect(deleteResponse.body.code).toBe('NOT_AUTHORIZED');
  });
});

