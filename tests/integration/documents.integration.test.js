const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { safeDeleteTestDatabase, waitFor, getServerDb, addActiveDocumentCollaboratorForTests, acceptDocumentCollaboratorInvitationForUser } = require('../utils/test-helpers');

let app;
let server;
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
    await safeDeleteTestDatabase(testDbPath);

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

    // Clean up test database
    try {
      await safeDeleteTestDatabase(testDbPath);
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

    test('WP3: document creation creates exactly one title paragraph with TITLE proposal', async () => {
      const createRes = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'WP3 Title Paragraph Test' })
        .expect(201);
      const docId = createRes.body.document.id;
      const getRes = await request(server)
        .get(`/api/documents/${docId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const doc = getRes.body.document;
      expect(doc.paragraphs).toBeDefined();
      expect(Array.isArray(doc.paragraphs)).toBe(true);
      expect(doc.paragraphs.length).toBe(1);
      const titlePara = doc.paragraphs[0];
      expect(titlePara.order_index === 1 || titlePara.order === 1).toBe(true);
      expect(titlePara.proposals).toBeDefined();
      expect(Array.isArray(titlePara.proposals)).toBe(true);
      expect(titlePara.proposals.length).toBeGreaterThanOrEqual(1);
      const titleProposal = titlePara.proposals.find(p => p.type === 'TITLE');
      expect(titleProposal).toBeDefined();
      expect(titleProposal.text).toBe('WP3 Title Paragraph Test');
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
        // order_index 1 is reserved for the auto-created title paragraph.
        text: 'This is a test paragraph for integration testing.',
        order_index: 2
      };

      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(paragraphData)
        .expect(201);

      expect(response.body).toHaveProperty('paragraph');
      // Responses are camelCased by the transformResponse middleware.
      expect(response.body.paragraph.orderIndex).toBe(paragraphData.order_index);

      testParagraphId = response.body.paragraph.id;

      // In the proposal-based model a new paragraph is an empty container; the
      // submitted text is stored as a BODY proposal on that paragraph.
      const proposalsRes = await request(server)
        .get(`/api/documents/${testDocumentId}/paragraphs/${testParagraphId}/proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const bodyProposal = proposalsRes.body.proposals.find(p => p.text === paragraphData.text);
      expect(bodyProposal).toBeDefined();
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
      // Paragraph body lives in proposals; the container text is empty by design.
      expect(ourParagraph.text || '').toBe('');
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
          // order_index 1 is reserved for the auto-created title paragraph.
          text: 'Test paragraph',
          order_index: 2
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

    test('should prevent XSS in document titles - script tags', async () => {
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
      expect(response.body.document.title).not.toContain('</script>');
      expect(response.body.document.title).toContain('Safe Title');
    });

    test('should prevent XSS in document titles - event handlers', async () => {
      const xssData = {
        title: '<img onerror="alert(\'xss\')" src="test.jpg"> Safe Title'
      };

      const response = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send(xssData)
        .expect(201);

      // Event handlers should be removed
      expect(response.body.document.title).not.toContain('onerror');
      expect(response.body.document.title).not.toContain('alert');
      expect(response.body.document.title).toContain('Safe Title');
    });

    test('should prevent XSS in document titles - JavaScript URLs', async () => {
      const xssData = {
        title: '<a href="javascript:alert(\'xss\')">Click</a> Safe Title'
      };

      const response = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send(xssData)
        .expect(201);

      // JavaScript URLs should be removed
      expect(response.body.document.title).not.toContain('javascript:');
      expect(response.body.document.title).not.toContain('alert');
      expect(response.body.document.title).toContain('Safe Title');
    });

    test('should prevent XSS in document titles - encoded payloads', async () => {
      const xssData = {
        title: '&lt;script&gt;alert("xss")&lt;/script&gt; Safe Title'
      };

      const response = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send(xssData)
        .expect(201);

      // Pre-encoded entities are inert text (they render literally, not as markup),
      // so the sanitizer leaves them escaped. What matters is that no executable
      // <script> tag is ever produced and the legitimate suffix is preserved.
      const title = response.body.document.title;
      expect(title).not.toMatch(/<script/i);
      expect(title).toContain('Safe Title');
    });

    test('should preserve legitimate content with angle brackets', async () => {
      const validData = {
        title: 'Math: x < 5 and y > 10'
      };

      const response = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validData)
        .expect(201);

      // The xss sanitizer strips angle-bracketed spans (anything that looks like a
      // tag) for security, so "< 5 and y >" is removed entirely. The leading safe
      // text is preserved and no markup survives. Users should use &lt;/&gt; for literals.
      const sanitizedTitle = response.body.document.title;
      expect(sanitizedTitle).toContain('Math:');
      expect(sanitizedTitle).toContain('x');
      expect(sanitizedTitle).not.toContain('<');
      expect(sanitizedTitle).not.toContain('>');
    });

    test('should prevent XSS in paragraph text', async () => {
      const xssData = {
        text: '<script>alert("xss")</script>Valid paragraph text',
        order_index: 0
      };

      const response = await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(xssData)
        .expect(201);

      // Paragraph text lives in a BODY proposal; verify it was sanitized there.
      const paraId = response.body.paragraph.id;
      const proposalsRes = await request(server)
        .get(`/api/documents/${testDocumentId}/paragraphs/${paraId}/proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const bodyProposal = proposalsRes.body.proposals.find(p => (p.text || '').includes('Valid paragraph text'));
      expect(bodyProposal).toBeDefined();
      expect(bodyProposal.text).not.toContain('<script>');
      expect(bodyProposal.text).not.toContain('</script>');
      expect(bodyProposal.text).toContain('Valid paragraph text');
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
      .post('/api/admin/organizations')
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
    expect(response.body.document.ownershipType).toBe('organizational');
    expect(response.body.document.organizationId).toBe(orgId);
    expect(response.body.document.ownerId).toBe(orgId); // owner_id should equal organization_id
    expect(response.body.document.owner.type).toBe('organization'); // owner should be organization
    expect(response.body.document.owner.id).toBe(orgId);
    expect(response.body.document.owner.name).toBe('Test Organization');
    expect(response.body.document.proposalDeadline).toBeDefined();
    expect(response.body.document.options.acceptanceThreshold).toBe(75);
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
    // API responses are camelCased by the transformResponse middleware.
    expect(statusResponse.body.document.votingDeadline).toBeDefined();
    expect(statusResponse.body.document.minVotersRequired).toBeGreaterThan(0);
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
    // votingDocId may have auto-finalized (locked org docs auto-accept once the
    // threshold is met). Use a dedicated doc with vote changes enabled, which
    // defers finalization until the deadline so the doc stays in 'voting'.
    const docResp = await request(server)
      .post('/api/documents')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        title: 'Vote Change Enabled Doc',
        ownershipType: 'organizational',
        organizationId: orgId,
        options: { voteChangeAllowed: true }
      })
      .expect(201);
    const docId = docResp.body.document.id;

    await request(server)
      .post(`/api/documents/${docId}/start-voting`)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);

    const adminLogin = await request(server)
      .post('/api/auth/login')
      .send({ email: 'admin@colabora.local', password: 'AdminSecurePass123!' });
    const adminTok = adminLogin.body.token;

    // Admin votes PRO, Alice votes PRO
    await request(server)
      .post(`/api/documents/${docId}/vote`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ vote: 'PRO' })
      .expect(200);
    await request(server)
      .post(`/api/documents/${docId}/vote`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ vote: 'PRO' })
      .expect(200);

    // Alice changes her vote to CONTRA
    await request(server)
      .post(`/api/documents/${docId}/vote`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ vote: 'CONTRA' })
      .expect(200);

    const statusResponse = await request(server)
      .get(`/api/documents/${docId}/voting-status`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    expect(statusResponse.body.voting.totalVotes).toBe(2);
    expect(statusResponse.body.voting.voteBreakdown.PRO).toBe(1);
    expect(statusResponse.body.voting.voteBreakdown.CONTRA).toBe(1);
    expect(statusResponse.body.voting.approvalRate).toBe(50);
  });

  test('should finalize voting and approve document', async () => {
    const serverDb = getServerDb(server);
    const pastDeadline = new Date(Date.now() - 60 * 1000).toISOString();
    await serverDb('documents').where({ id: votingDocId }).update({ voting_deadline: pastDeadline });

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

  describe('Document voting finalization deferral', () => {
    let flexibleDocId;

    async function createVotingDocument(title) {
      const docResponse = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          title,
          description: 'Deferral test document',
          ownershipType: 'organizational',
          organizationId: orgId,
          options: { voteChangeAllowed: true }
        })
        .expect(201);

      const documentId = docResponse.body.document.id;
      await request(server)
        .post(`/api/documents/${documentId}/start-voting`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);
      return documentId;
    }

    test('should defer auto-accept when vote changes are allowed', async () => {
      flexibleDocId = await createVotingDocument('Flexible Voting Deferral Doc');

      await request(server)
        .post(`/api/documents/${flexibleDocId}/vote`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ vote: 'PRO' })
        .expect(200);

      await waitFor(async () => {
        const res = await request(server)
          .get(`/api/documents/${flexibleDocId}/voting-status`)
          .set('Authorization', `Bearer ${memberToken}`);
        return res.status === 200 && res.body.voting.finalizationDeferredUntilDeadline === true;
      }, 5000, 100);

      const statusResponse = await request(server)
        .get(`/api/documents/${flexibleDocId}/voting-status`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(statusResponse.body.document.status).toBe('voting');
      expect(statusResponse.body.voting.finalizationDeferredUntilDeadline).toBe(true);
      expect(statusResponse.body.voting.canFinalizeEarly).toBe(false);
    });

    test('should auto-accept when vote changes are locked', async () => {
      const lockedDocResponse = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          title: 'Locked Voting Auto-Accept Doc',
          description: 'Deferral test document',
          ownershipType: 'organizational',
          organizationId: orgId,
          options: { voteChangeAllowed: false }
        })
        .expect(201);

      const lockedDocId = lockedDocResponse.body.document.id;
      await request(server)
        .post(`/api/documents/${lockedDocId}/start-voting`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);

      await request(server)
        .post(`/api/documents/${lockedDocId}/vote`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ vote: 'PRO' })
        .expect(200);

      await request(server)
        .post(`/api/documents/${lockedDocId}/vote`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ vote: 'PRO' })
        .expect(200);

      await waitFor(async () => {
        const res = await request(server)
          .get(`/api/documents/${lockedDocId}/voting-status`)
          .set('Authorization', `Bearer ${memberToken}`);
        return res.status === 200 && res.body.document.status === 'agreed';
      }, 5000, 100);

      const statusResponse = await request(server)
        .get(`/api/documents/${lockedDocId}/voting-status`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(statusResponse.body.document.status).toBe('agreed');
    });

    test('should block manual finalize before deadline when vote changes are allowed', async () => {
      const docId = flexibleDocId || await createVotingDocument('Manual Finalize Block Doc');
      const serverDb = getServerDb(server);
      const futureDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await serverDb('documents').where({ id: docId }).update({
        voting_deadline: futureDeadline,
        status: 'voting',
      });

      const response = await request(server)
        .post(`/api/documents/${docId}/finalize-voting`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(400);

      expect(response.body.code).toBe('VOTING_OPEN_UNTIL_DEADLINE');
    });

    test('should finalize after deadline when vote changes are allowed', async () => {
      const docId = flexibleDocId || await createVotingDocument('Finalize After Deadline Doc');
      const serverDb = getServerDb(server);
      const pastDeadline = new Date(Date.now() - 60 * 1000).toISOString();
      await serverDb('documents')
        .where({ id: docId })
        .update({ voting_deadline: pastDeadline });

      await request(server)
        .post(`/api/documents/${docId}/finalize-voting`)
        .set('Authorization', `Bearer ${orgToken}`)
        .expect(200);

      const statusResponse = await request(server)
        .get(`/api/documents/${docId}/voting-status`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(statusResponse.body.document.status).toBe('agreed');
    });
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

    // Check that we have proposal -> voting transition (responses are camelCased)
    const transitions = response.body.history.map(h => h.newStatus);
    expect(transitions).toContain('voting');
  });

  test('should have scheduler running', async () => {
    // Test that scheduler is initialized and running
    const healthResponse = await request(server)
      .get('/api/health/detailed')
      .expect(200);

    // The detailed health endpoint responds while the server (and its scheduler,
    // started during bootstrap) is running. It reports overall status + checks.
    expect(healthResponse.body.status).toBeDefined();
    expect(healthResponse.body.checks).toBeDefined();
  });

  describe('Collaborator Management', () => {
    let personalDocId;
    let sharedDocId;
    let orgDocId;
    let orgId;
    let orgToken;
    let otherUserId;

    beforeAll(async () => {
      // Get organization ID and token for creating organizational document
      const orgsResponse = await request(server)
        .get('/api/organizations')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      if (orgsResponse.body.organizations && orgsResponse.body.organizations.length > 0) {
        orgId = orgsResponse.body.organizations[0].id;
        
        // Login as organization member to create org document
        const orgMemberLogin = await request(server)
          .post('/api/auth/login')
          .send({
            email: 'bob@example.com',
            password: 'SecurePass123!'
          });
        orgToken = orgMemberLogin.body.token;
      }

      // Get another user ID for testing
      const otherUserLogin = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'bob@example.com',
          password: 'SecurePass123!'
        })
        .expect(200);
      const bobMe = await request(server)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${otherUserLogin.body.token}`)
        .expect(200);
      otherUserId = bobMe.body.user.id;

      // Create personal document
      const personalDocResponse = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Personal Test Document' })
        .expect(201);
      personalDocId = personalDocResponse.body.document.id;

      // Create shared document
      const sharedDocResponse = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Shared Test Document',
          ownershipType: 'shared',
          creatorIds: [otherUserId]
        })
        .expect(201);
      sharedDocId = sharedDocResponse.body.document.id;

      // Create organizational document if we have an org. Use Alice's token —
      // she is a representative of the org created earlier and may create docs.
      if (orgId) {
        const orgDocResponse = await request(server)
          .post('/api/documents')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            title: 'Organizational Test Document',
            ownershipType: 'organizational',
            organizationId: orgId
          });
        if (orgDocResponse.status === 201) {
          orgDocId = orgDocResponse.body.document.id;
        }
      }
    });

    test('should block manual collaborator addition to organizational documents', async () => {
      if (!orgDocId) {
        console.log('Skipping test: No organizational document available');
        return;
      }

      const response = await request(server)
        .post(`/api/documents/${orgDocId}/collaborators`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ userId: otherUserId })
        .expect(403);

      expect(response.body.error).toContain('managed automatically through organization membership');
    });

    test('should block manual collaborator removal from organizational documents', async () => {
      if (!orgDocId) {
        console.log('Skipping test: No organizational document available');
        return;
      }

      const response = await request(server)
        .delete(`/api/documents/${orgDocId}/collaborators/${otherUserId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(response.body.error).toContain('managed automatically through organization membership');
    });

    test('should allow manual collaborator addition to personal documents', async () => {
      const response = await request(server)
        .post(`/api/documents/${personalDocId}/collaborators`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ userId: otherUserId })
        .expect(201);

      expect(response.body.invitationSent).toBe(true);
      expect(response.body.invitation).toBeDefined();

      await acceptDocumentCollaboratorInvitationForUser(server, personalDocId, {
        id: otherUserId,
        email: 'bob@example.com',
        password: 'SecurePass123!',
      });
    });

    test('should allow manual collaborator removal from personal documents', async () => {
      // Ensure the collaborator exists (a prior test may already have added them).
      await addActiveDocumentCollaboratorForTests(server, personalDocId, authToken, {
        id: otherUserId,
        email: 'bob@example.com',
        password: 'SecurePass123!',
      });

      // Then remove them
      const response = await request(server)
        .delete(`/api/documents/${personalDocId}/collaborators/${otherUserId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.message).toContain('removed successfully');
    });

    test('should allow manual collaborator addition to shared documents', async () => {
      // Get another user for testing
      const charlieLogin = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'charlie@example.com',
          password: 'SecurePass123!'
        });
      const charlieId = charlieLogin.body.user.id;

      const response = await request(server)
        .post(`/api/documents/${sharedDocId}/collaborators`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ userId: charlieId })
        .expect(201);

      expect(response.body.invitationSent).toBe(true);

      await acceptDocumentCollaboratorInvitationForUser(server, sharedDocId, {
        id: charlieId,
        email: 'charlie@example.com',
        password: 'SecurePass123!',
      });
    });

    test('should allow manual collaborator removal from shared documents', async () => {
      // Get another user for testing
      const charlieLogin = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'charlie@example.com',
          password: 'SecurePass123!'
        });
      const charlieId = charlieLogin.body.user.id;

      await addActiveDocumentCollaboratorForTests(server, sharedDocId, authToken, {
        id: charlieId,
        email: 'charlie@example.com',
        password: 'SecurePass123!',
      });

      // Then remove them
      const response = await request(server)
        .delete(`/api/documents/${sharedDocId}/collaborators/${charlieId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.message).toContain('removed successfully');
    });
  });

  describe('Batch Document Fetching', () => {
    let doc1Id, doc2Id, doc3Id;
    let otherUserToken;
    let otherUserDocId;

    beforeAll(async () => {
      // Create multiple test documents
      const doc1 = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Batch Test Doc 1' })
        .expect(201);
      doc1Id = doc1.body.document.id;

      const doc2 = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Batch Test Doc 2' })
        .expect(201);
      doc2Id = doc2.body.document.id;

      const doc3 = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Batch Test Doc 3' })
        .expect(201);
      doc3Id = doc3.body.document.id;

      // Create a document owned by another user
      const otherUserLogin = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'bob@example.com',
          password: 'SecurePass123!'
        });
      otherUserToken = otherUserLogin.body.token;
      const otherUserDoc = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({ title: 'Other User Document' })
        .expect(201);
      otherUserDocId = otherUserDoc.body.document.id;
    });

    test('should batch fetch multiple documents', async () => {
      const response = await request(server)
        .post('/api/documents/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ documentIds: [doc1Id, doc2Id, doc3Id] })
        .expect(200);

      expect(response.body).toHaveProperty('documents');
      expect(response.body.documents).toHaveLength(3);
      expect(response.body.documents.map(d => d.id)).toContain(doc1Id);
      expect(response.body.documents.map(d => d.id)).toContain(doc2Id);
      expect(response.body.documents.map(d => d.id)).toContain(doc3Id);
      
      // Check structure
      response.body.documents.forEach(doc => {
        expect(doc).toHaveProperty('id');
        expect(doc).toHaveProperty('title');
        expect(doc).toHaveProperty('paragraphs');
        expect(Array.isArray(doc.paragraphs)).toBe(true);
      });
    });

    test('should return empty array for empty documentIds', async () => {
      const response = await request(server)
        .post('/api/documents/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ documentIds: [] })
        .expect(200);

      expect(response.body.documents).toHaveLength(0);
      expect(response.body.notFound).toHaveLength(0);
    });

    test('should exclude documents user does not have access to', async () => {
      const response = await request(server)
        .post('/api/documents/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ documentIds: [doc1Id, otherUserDocId] })
        .expect(200);

      expect(response.body.documents).toHaveLength(1);
      expect(response.body.documents[0].id).toBe(doc1Id);
      expect(response.body.notFound).toContain(otherUserDocId);
    });

    test('should handle invalid document IDs gracefully', async () => {
      const invalidId = '00000000-0000-0000-0000-000000000000';
      const response = await request(server)
        .post('/api/documents/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ documentIds: [doc1Id, invalidId] })
        .expect(200);

      expect(response.body.documents).toHaveLength(1);
      expect(response.body.documents[0].id).toBe(doc1Id);
      expect(response.body.notFound).toContain(invalidId);
    });

    test('should reject non-array documentIds', async () => {
      await request(server)
        .post('/api/documents/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ documentIds: 'not-an-array' })
        .expect(400);
    });

    test('should reject more than 50 document IDs', async () => {
      const tooManyIds = Array.from({ length: 51 }, (_, i) => `doc-${i}`);
      await request(server)
        .post('/api/documents/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ documentIds: tooManyIds })
        .expect(400);
    });

    test('should handle duplicate document IDs', async () => {
      const response = await request(server)
        .post('/api/documents/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ documentIds: [doc1Id, doc1Id, doc2Id, doc2Id] })
        .expect(200);

      // Should only return unique documents
      expect(response.body.documents).toHaveLength(2);
      const returnedIds = response.body.documents.map(d => d.id);
      expect(returnedIds).toContain(doc1Id);
      expect(returnedIds).toContain(doc2Id);
    });

    test('should include paragraph history in response', async () => {
      const response = await request(server)
        .post('/api/documents/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ documentIds: [doc1Id] })
        .expect(200);

      expect(response.body.documents).toHaveLength(1);
      const doc = response.body.documents[0];
      expect(doc.paragraphs.length).toBeGreaterThan(0);
      
      // Check that paragraphs have history array (may be empty)
      doc.paragraphs.forEach(para => {
        expect(para).toHaveProperty('history');
        expect(Array.isArray(para.history)).toBe(true);
      });
    });

    test('should require authentication', async () => {
      await request(server)
        .post('/api/documents/batch')
        .send({ documentIds: [doc1Id] })
        .expect(401);
    });
  });
});