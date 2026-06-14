const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { authenticateUser, createTestDocument, createTestParagraph, createTestProposal, safeDeleteTestDatabase, addActiveDocumentCollaboratorForTests } = require('../utils/test-helpers');

let server;
let authToken;
let testUserId;
let testDocumentId;
let testParagraphId;
let testProposalId;
let testDbPath;

describe('Comments API Integration Tests', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3010, returnServer: true });

    await new Promise(resolve => setTimeout(resolve, 3000));

    authToken = await authenticateUser(server, 'alice@example.com', 'SecurePass123!');
    
    const loginResponse = await request(server)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'SecurePass123!' });
    testUserId = loginResponse.body.user.id;

    // Create test document, paragraph, and proposal
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

  describe('POST /api/documents/:documentId/paragraphs/:paragraphId/proposals/:proposalId/comments', () => {
    test('should create a comment successfully', async () => {
      const commentData = {
        text: 'This is a test comment'
      };

      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(commentData)
        .expect(201);

      expect(response.body).toHaveProperty('comment');
      expect(response.body.comment.text).toBe(commentData.text);
      expect(response.body.comment.userId).toBe(testUserId);
      expect(response.body.comment.commentableType).toBe('proposal');
      expect(response.body.comment.commentableId).toBe(testProposalId);
      // Backward compatibility
      expect(response.body.comment.proposalId).toBe(testProposalId);
    });

    test('should create a reply comment with parentId', async () => {
      // First create a parent comment
      const parentComment = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: 'Parent comment' })
        .expect(201);

      const parentId = parentComment.body.comment.id;

      // Create reply
      const replyData = {
        text: 'This is a reply comment',
        parentId: parentId
      };

      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(replyData)
        .expect(201);

      expect(response.body.comment.parentId).toBe(parentId);
      expect(response.body.comment.text).toBe(replyData.text);
    });

    test('should reject empty comment text', async () => {
      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: '' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should reject comment on non-existent proposal', async () => {
      const fakeProposalId = 'fake-proposal-id';
      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${fakeProposalId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: 'Test comment' })
        .expect(404);

      expect(response.body.error).toContain('not found');
    });

    test('should reject comment without authentication', async () => {
      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/comments`)
        .send({ text: 'Test comment' })
        .expect(401);
    });
  });

  describe('GET /api/documents/:documentId/paragraphs/:paragraphId/proposals/:proposalId/comments', () => {
    test('should retrieve comments for a proposal', async () => {
      // Create a comment first
      await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: 'Test comment for retrieval' })
        .expect(201);

      const response = await request(server)
        .get(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('comments');
      expect(Array.isArray(response.body.comments)).toBe(true);
      expect(response.body.comments.length).toBeGreaterThan(0);
    });

    test('should support pagination', async () => {
      const response = await request(server)
        .get(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .query({ limit: 10, offset: 0 })
        .expect(200);

      expect(response.body).toHaveProperty('limit', 10);
      expect(response.body).toHaveProperty('offset', 0);
      expect(response.body).toHaveProperty('total');
    });
  });

  describe('PUT /api/documents/:documentId/paragraphs/:paragraphId/proposals/:proposalId/comments/:commentId', () => {
    test('should update own comment within edit window', async () => {
      // Create a comment
      const createResponse = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: 'Original comment text' })
        .expect(201);

      const commentId = createResponse.body.comment.id;

      // Update the comment
      const updateData = {
        text: 'Updated comment text'
      };

      const response = await request(server)
        .put(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.comment.text).toBe(updateData.text);
      expect(response.body.comment.editCount).toBeGreaterThan(0);
    });

    test('should reject updating another user\'s comment', async () => {
      // Create comment as Alice
      const createResponse = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: 'Alice\'s comment' })
        .expect(201);

      const commentId = createResponse.body.comment.id;

      // Login as Bob and give him document access so the comment-ownership check
      // (not the document-access check) is exercised.
      const bobLogin = await request(server)
        .post('/api/auth/login')
        .send({ email: 'bob@example.com', password: 'SecurePass123!' });
      const bobToken = bobLogin.body.token;
      await addActiveDocumentCollaboratorForTests(server, testDocumentId, authToken, {
        id: bobLogin.body.user.id,
        email: 'bob@example.com',
        password: 'SecurePass123!',
      });

      // Try to update Alice's comment
      const response = await request(server)
        .put(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ text: 'Bob trying to edit' })
        .expect(403);

      expect(response.body.error).toContain('own comments');
    });
  });

  describe('DELETE /api/documents/:documentId/paragraphs/:paragraphId/proposals/:proposalId/comments/:commentId', () => {
    test('should delete own comment', async () => {
      // Create a comment
      const createResponse = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: 'Comment to be deleted' })
        .expect(201);

      const commentId = createResponse.body.comment.id;

      // Delete the comment
      const response = await request(server)
        .delete(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.message).toBe('Comment deleted successfully');
    });

    test('should reject deleting another user\'s comment', async () => {
      // Create comment as Alice
      const createResponse = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: 'Alice\'s comment' })
        .expect(201);

      const commentId = createResponse.body.comment.id;

      // Login as Bob and give him document access so the comment-ownership check
      // (not the document-access check) is exercised.
      const bobLogin = await request(server)
        .post('/api/auth/login')
        .send({ email: 'bob@example.com', password: 'SecurePass123!' });
      const bobToken = bobLogin.body.token;
      await addActiveDocumentCollaboratorForTests(server, testDocumentId, authToken, {
        id: bobLogin.body.user.id,
        email: 'bob@example.com',
        password: 'SecurePass123!',
      });

      // Try to delete Alice's comment
      const response = await request(server)
        .delete(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(403);

      expect(response.body.error).toContain('own comments');
    });
  });
});

