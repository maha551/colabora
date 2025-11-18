const request = require('supertest');
const path = require('path');
const fs = require('fs');

let app;
let authToken;
let testUserId;
let testDocumentId;
let testParagraphId;
let testDbPath;

describe('Documents API Integration Tests', () => {
  beforeAll(async () => {
    // Get the database path (set by setup.js with timestamp)
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Import and start test server
    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3002, returnServer: true }); // Use port 3002 for documents tests

    // Wait for database initialization
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Login and get auth token
    const loginResponse = await request(server)
      .post('/api/auth/login')
      .send({
        email: 'alice@example.com',
        password: 'SecurePass123!'
      });


    authToken = loginResponse.body.token;
    testUserId = loginResponse.body.user.id;
  });

  afterAll(async () => {
    // Close server and wait for it to actually close
    if (server) {
      await new Promise((resolve) => {
        server.close((err) => {
          if (err) {
            console.warn('Error closing server:', err.message);
          }
          resolve();
        });
      });
    }

    // Give scheduler time to stop
    await new Promise(resolve => setTimeout(resolve, 100));
  });

    // Clean up test database
    try {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
    } catch (error) {
      console.warn('Could not clean up test database:', error.message);
    }
  });

  describe('Document CRUD Operations', () => {
    test('should create a new document', async () => {
      const docData = {
        title: 'Integration Test Document'
      };

      const response = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send(docData)
        .expect(201);

      expect(response.body).toHaveProperty('document');
      expect(response.body.document.title).toBe(docData.title);
      expect(response.body.document.owner.id).toBe(testUserId);
      // Check that options are included with defaults
      expect(response.body.document.options).toBeDefined();
      expect(response.body.document.options.acceptanceThreshold).toBe(75);
      expect(response.body.document.options.votingAnonymous).toBe(false);
      expect(response.body.document.options.voteChangeAllowed).toBe(true);

      testDocumentId = response.body.document.id;
    });

    test('should create a document with custom options', async () => {
      const docData = {
        title: 'Document with Custom Options',
        options: {
          acceptanceThreshold: 50,
          votingAnonymous: true,
          voteChangeAllowed: false
        }
      };

      const response = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send(docData)
        .expect(201);

      expect(response.body).toHaveProperty('document');
      expect(response.body.document.title).toBe(docData.title);
      expect(response.body.document.options).toBeDefined();
      expect(response.body.document.options.acceptanceThreshold).toBe(50);
      expect(response.body.document.options.votingAnonymous).toBe(true);
      expect(response.body.document.options.voteChangeAllowed).toBe(false);
    });

    test('should retrieve user documents', async () => {
      const response = await request(server)
        .get('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body.documents)).toBe(true);
      expect(response.body.documents.length).toBeGreaterThan(0);

      const ourDocument = response.body.documents.find(doc => doc.id === testDocumentId);
      expect(ourDocument).toBeDefined();
      expect(ourDocument.title).toBe('Integration Test Document');
    });

    test('should retrieve specific document', async () => {
      const response = await request(server)
        .get(`/api/documents/${testDocumentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('document');
      expect(response.body.document.id).toBe(testDocumentId);
      expect(response.body.document.title).toBe('Integration Test Document');
      expect(response.body.document.paragraphs).toBeDefined();
      // Verify options are included in document retrieval
      expect(response.body.document.options).toBeDefined();
    });

    test('should update document title', async () => {
      const updateData = {
        title: 'Updated Integration Test Document'
      };

      const response = await request(server)
        .put(`/api/documents/${testDocumentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.message).toBe('Document updated successfully');
    });

    test('should reject unauthorized document access', async () => {
      // Create a document with a different user (Bob)
      const bobLogin = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'bob@example.com',
          password: 'SecurePass123!'
        });

      const bobToken = bobLogin.body.token;

      const bobDoc = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ title: 'Bob\'s Private Document' })
        .expect(201);


      // Try to access Bob's document with Alice's token
      // Should return 404 (not found) for security - don't reveal document existence
      await request(server)
        .get(`/api/documents/${bobDoc.body.document.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('Paragraph Management', () => {

    test('should create a new paragraph', async () => {
      const paragraphData = {
        text: 'This is a test paragraph for integration testing.',
        order_index: 1
      };

      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(paragraphData)
        .expect(201);

      expect(response.body).toHaveProperty('paragraph');
      expect(response.body.paragraph.text).toBe(paragraphData.text);
      expect(response.body.paragraph.order_index).toBe(paragraphData.order_index);

      testParagraphId = response.body.paragraph.id;
    });

    test('should retrieve document paragraphs', async () => {
      const response = await request(server)
        .get(`/api/documents/${testDocumentId}/paragraphs`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body.paragraphs)).toBe(true);
      expect(response.body.paragraphs.length).toBeGreaterThan(0);

      const ourParagraph = response.body.paragraphs.find(p => p.id === testParagraphId);
      expect(ourParagraph).toBeDefined();
      expect(ourParagraph.text).toBe('This is a test paragraph for integration testing.');
    });

    test('should update paragraph content', async () => {
      const updateData = {
        text: 'This is an updated test paragraph for integration testing.'
      };

      const response = await request(server)
        .put(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.message).toBe('Paragraph updated successfully');
    });
  });

  describe('Proposal and Voting System', () => {
    let testProposalId;

    test('should create a proposal', async () => {
      const proposalData = {
        text: 'This is a proposed change to the paragraph.',
        type: 'BODY'
      };

      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(proposalData)
        .expect(201);

      expect(response.body).toHaveProperty('proposal');
      expect(response.body.proposal.text).toBe(proposalData.text);
      expect(response.body.proposal.type).toBe(proposalData.type);

      testProposalId = response.body.proposal.id;
    });

    test('should retrieve paragraph proposals', async () => {
      const response = await request(server)
        .get(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body.proposals)).toBe(true);
      expect(response.body.proposals.length).toBeGreaterThan(0);

      const ourProposal = response.body.proposals.find(p => p.id === testProposalId);
      expect(ourProposal).toBeDefined();
    });

    test('should cast a vote on proposal', async () => {
      const voteData = {
        vote: 'PRO'
      };

      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(voteData)
        .expect(200);

      expect(response.body.message).toContain('Vote cast successfully');
    });

    test('should allow vote changes when voteChangeAllowed is true', async () => {
      const voteData = {
        vote: 'CONTRA' // Change from PRO to CONTRA
      };

      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals/${testProposalId}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(voteData)
        .expect(200);

      expect(response.body.message).toContain('Vote');
    });

    test('should prevent vote changes when voteChangeAllowed is false', async () => {
      // Create a document with locked votes
      const lockedDoc = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Locked Votes Document',
          options: {
            voteChangeAllowed: false
          }
        })
        .expect(201);

      const lockedDocId = lockedDoc.body.document.id;
      
      // Create a paragraph and proposal
      const paraResponse = await request(server)
        .post(`/api/documents/${lockedDocId}/paragraphs`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          text: 'Test paragraph',
          order_index: 1
        })
        .expect(201);

      const paraId = paraResponse.body.paragraph.id;

      const proposalResponse = await request(server)
        .post(`/api/documents/${lockedDocId}/paragraphs/${paraId}/proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          text: 'Test proposal',
          type: 'BODY'
        })
        .expect(201);

      const proposalId = proposalResponse.body.proposal.id;

      // Cast initial vote
      await request(server)
        .post(`/api/documents/${lockedDocId}/paragraphs/${paraId}/proposals/${proposalId}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ vote: 'PRO' })
        .expect(200);

      // Try to change vote - should fail
      await request(server)
        .post(`/api/documents/${lockedDocId}/paragraphs/${paraId}/proposals/${proposalId}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ vote: 'CONTRA' })
        .expect(403);
    });
  });


  describe('Input Validation and Security', () => {
    test('should reject invalid document title', async () => {
      const invalidData = {
        title: '' // Empty title
      };

      await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);
    });

    test('should reject overly long document title', async () => {
      const invalidData = {
        title: 'A'.repeat(201) // Exceeds 200 character limit
      };

      await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);
    });

    test('should reject invalid paragraph data', async () => {
      const invalidData = {
        text: '', // Empty text
        order_index: -1 // Negative order
      };

      await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);
    });

    test('should prevent XSS in document titles', async () => {
      const xssData = {
        title: '<script>alert("xss")</script> Safe Title'
      };

      // This should succeed but the script tag should be sanitized
      const response = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send(xssData)
        .expect(201);

      // Title should be sanitized (script tag removed)
      expect(response.body.document.title).not.toContain('<script>');
    });
  });

  describe('Personal Document Creation', () => {
    test('should create a personal document with default settings', async () => {
      const docData = {
        title: 'Personal Test Document',
        description: 'A test personal document',
        ownershipType: 'personal'
      };

      const response = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send(docData)
        .expect(201);

      expect(response.body.document).toBeDefined();
      expect(response.body.document.title).toBe(docData.title);
      expect(response.body.document.description).toBe(docData.description);
      expect(response.body.document.ownershipType).toBe('personal');
      expect(response.body.document.organizationId).toBeNull();
      expect(response.body.document.status).toBe('draft');
      expect(response.body.document.options.acceptanceThreshold).toBe(75);
      expect(response.body.document.options.votingAnonymous).toBe(false);
      expect(response.body.document.options.voteChangeAllowed).toBe(true);
      expect(response.body.document.options.structureProposalsEnabled).toBe(true);
    });

    test('should create a personal document with custom options', async () => {
      const docData = {
        title: 'Personal Custom Document',
        description: 'Personal document with custom settings',
        ownershipType: 'personal',
        options: {
          acceptanceThreshold: 60,
          votingAnonymous: true,
          voteChangeAllowed: false,
          structureProposalsEnabled: false
        }
      };

      const response = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send(docData)
        .expect(201);

      expect(response.body.document.options.acceptanceThreshold).toBe(60);
      expect(response.body.document.options.votingAnonymous).toBe(true);
      expect(response.body.document.options.voteChangeAllowed).toBe(false);
      expect(response.body.document.options.structureProposalsEnabled).toBe(false);
    });
  });

  // ============================================================================
  // ORGANIZATIONAL DOCUMENTS WORKFLOW TESTS
  // ============================================================================

  let orgId;
  let orgToken;
  let memberToken;
  let orgDocumentId;
  let votingDocId;
  let historyDocId;

  test('should create organizational document in proposal status', async () => {
    // Create organization as admin first
    const adminLogin = await request(server)
      .post('/api/auth/login')
      .send({
        email: 'admin@colabora.local',
        password: 'AdminSecurePass123!'
      });

    const adminToken = adminLogin.body.token;

    // Get user IDs for representatives
    const adminUser = adminLogin.body.user;

    const orgResponse = await request(server)
      .post('/api/organizations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Test Organization',
        description: 'Organization for testing organizational documents',
        representatives: [adminUser.id, testUserId] // Use testUserId (Alice) from main setup
      });

    orgId = orgResponse.body.organization.id;
    orgToken = adminToken;
    memberToken = authToken; // Alice's token from main setup

    // Now create organizational document
    const response = await request(server)
      .post('/api/documents')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        title: 'Organizational Test Document',
        description: 'A test organizational document',
        ownershipType: 'organizational',
        organizationId: orgId,
        options: {
          acceptanceThreshold: 75,
          votingAnonymous: true,
          voteChangeAllowed: true
        }
      })
      .expect(201);

    orgDocumentId = response.body.document.id;

    expect(response.body.document.title).toBe('Organizational Test Document');
    expect(response.body.document.status).toBe('proposal');
    expect(response.body.document.ownership_type).toBe('organizational');
    expect(response.body.document.organization_id).toBe(orgId);
    expect(response.body.document.proposal_deadline).toBeDefined();
    expect(response.body.document.acceptance_threshold).toBe(75);
  });

  test('should reject organizational document creation without organization membership', async () => {
    // Login as Bob who is not a member
    const bobLogin = await request(server)
      .post('/api/auth/login')
      .send({
        email: 'bob@example.com',
        password: 'SecurePass123!'
      });

    const bobToken = bobLogin.body.token;

    await request(server)
      .post('/api/documents')
      .set('Authorization', `Bearer ${bobToken}`)
      .send({
        title: 'Unauthorized Document',
        description: 'Should not be created',
        ownershipType: 'organizational',
        organizationId: orgId
      })
      .expect(403);
  });

  test('should get voting status for organizational document', async () => {
    const response = await request(server)
      .get(`/api/documents/${orgDocumentId}/voting-status`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(response.body.document.status).toBe('proposal');
    expect(response.body.document.organizationName).toBe('Test Organization');
    expect(response.body.voting.canVote).toBe(true);
    expect(response.body.voting.totalEligibleVoters).toBeGreaterThan(0);
    expect(response.body.voting.quorumRequired).toBeGreaterThan(0);
  });

  test('should transition to voting after proposal deadline', async () => {
    // Manually trigger the transition (in real scenario, scheduler would do this)
    await request(server)
      .post(`/api/documents/${orgDocumentId}/start-voting`)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);

    // Check status changed
    const statusResponse = await request(server)
      .get(`/api/documents/${orgDocumentId}/voting-status`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(statusResponse.body.document.status).toBe('voting');
    expect(statusResponse.body.document.voting_deadline).toBeDefined();
    expect(statusResponse.body.document.min_voters_required).toBeGreaterThan(0);
  });

  test('should allow organization members to vote', async () => {
    // Create a document already in voting status
    const docResponse = await request(server)
      .post('/api/documents')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        title: 'Voting Test Document',
        description: 'Document for voting tests',
        ownershipType: 'organizational',
        organizationId: orgId
      })
      .expect(201);

    votingDocId = docResponse.body.document.id;

    // Start voting manually
    await request(server)
      .post(`/api/documents/${votingDocId}/start-voting`)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);

    // Get additional voter tokens
    const adminLogin = await request(server)
      .post('/api/auth/login')
      .send({
        email: 'admin@colabora.local',
        password: 'AdminSecurePass123!'
      });

    const voter1Token = memberToken; // Alice
    const voter2Token = adminLogin.body.token; // Admin

    // Alice votes PRO
    await request(server)
      .post(`/api/documents/${votingDocId}/vote`)
      .set('Authorization', `Bearer ${voter1Token}`)
      .send({ vote: 'PRO' })
      .expect(200);

    // Admin votes PRO
    await request(server)
      .post(`/api/documents/${votingDocId}/vote`)
      .set('Authorization', `Bearer ${voter2Token}`)
      .send({ vote: 'PRO' })
      .expect(200);

    // Check voting status
    const statusResponse = await request(server)
      .get(`/api/documents/${votingDocId}/voting-status`)
      .set('Authorization', `Bearer ${voter1Token}`)
      .expect(200);

    expect(statusResponse.body.voting.totalVotes).toBe(2);
    expect(statusResponse.body.voting.voteBreakdown.PRO).toBe(2);
    expect(statusResponse.body.voting.approvalRate).toBe(100);
  });

  test('should allow vote changes if enabled', async () => {
    // Alice changes vote to CONTRA
    await request(server)
      .post(`/api/documents/${votingDocId}/vote`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ vote: 'CONTRA' })
      .expect(200);

    // Check updated voting status
    const statusResponse = await request(server)
      .get(`/api/documents/${votingDocId}/voting-status`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(statusResponse.body.voting.totalVotes).toBe(2);
    expect(statusResponse.body.voting.voteBreakdown.PRO).toBe(1);
    expect(statusResponse.body.voting.voteBreakdown.CONTRA).toBe(1);
    expect(statusResponse.body.voting.approvalRate).toBe(50);
  });

  test('should finalize voting and approve document', async () => {
    // Manually finalize voting
    await request(server)
      .post(`/api/documents/${votingDocId}/finalize-voting`)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);

    // Check final status
    const statusResponse = await request(server)
      .get(`/api/documents/${votingDocId}/voting-status`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(statusResponse.body.document.status).toBe('agreed');
  });

  test('should retrieve document status history', async () => {
    // Create and transition a document to generate history
    const docResponse = await request(server)
      .post('/api/documents')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        title: 'History Test Document',
        description: 'Document for testing status history',
        ownershipType: 'organizational',
        organizationId: orgId
      })
      .expect(201);

    historyDocId = docResponse.body.document.id;

    // Start voting to create status change
    await request(server)
      .post(`/api/documents/${historyDocId}/start-voting`)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);

    const response = await request(server)
      .get(`/api/documents/${historyDocId}/status-history`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(Array.isArray(response.body.history)).toBe(true);
    expect(response.body.history.length).toBeGreaterThan(0);

    // Check that we have proposal -> voting transition
    const transitions = response.body.history.map(h => h.new_status);
    expect(transitions).toContain('voting');
  });

  test('should have scheduler running', async () => {
    // Test that scheduler is initialized and running
    const healthResponse = await request(server)
      .get('/api/health/detailed')
      .expect(200);

    // Scheduler should be mentioned in health check
    expect(healthResponse.body.message).toContain('Scheduler');
  });
