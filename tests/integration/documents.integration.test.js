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
    const startTestServer = require('../../server/index');
    server = await startTestServer({ port: 3002 }); // Use port 3002 for documents tests

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

  describe('Organizational Document Creation', () => {
    let testOrgId;
    let testOrgToken;
    let testOrgMemberToken;

    beforeAll(async () => {
      // Create a test organization
      const orgResponse = await request(server)
        .post('/api/organizations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Organization for Docs',
          description: 'Organization for testing document creation'
        })
        .expect(201);

      testOrgId = orgResponse.body.organization.id;

      // Login as Charlie (another user) to join the organization
      const charlieLogin = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'charlie@example.com',
          password: 'SecurePass123!'
        });

      testOrgMemberToken = charlieLogin.body.token;

      // Invite Charlie to the organization
      await request(server)
        .post(`/api/organizations/${testOrgId}/invite`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ email: 'charlie@example.com' })
        .expect(200);

      // Charlie accepts the invitation
      const invitations = await request(server)
        .get('/api/organizations/invitations')
        .set('Authorization', `Bearer ${testOrgMemberToken}`)
        .expect(200);

      const charlieInvitation = invitations.body.invitations.find(inv => inv.organizationId === testOrgId);
      expect(charlieInvitation).toBeDefined();

      await request(server)
        .post(`/api/organizations/invitations/${charlieInvitation.id}/accept`)
        .set('Authorization', `Bearer ${testOrgMemberToken}`)
        .send({ status: 'active' })
        .expect(200);
    });

    test('should create an organizational document with governance rules', async () => {
      const docData = {
        title: 'Organizational Test Document',
        description: 'A test organizational document',
        ownershipType: 'organizational',
        organizationId: testOrgId
      };

      const response = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send(docData)
        .expect(201);

      expect(response.body.document).toBeDefined();
      expect(response.body.document.title).toBe(docData.title);
      expect(response.body.document.ownershipType).toBe('organizational');
      expect(response.body.document.organizationId).toBe(testOrgId);
      expect(response.body.document.status).toBe('proposal'); // Organizational docs start as proposals

      // Check that all organization members are added as collaborators
      expect(response.body.document.collaborators).toBeDefined();
      expect(Array.isArray(response.body.document.collaborators)).toBe(true);
      expect(response.body.document.collaborators.length).toBeGreaterThan(0);
    });

    test('should reject organizational document creation without organization membership', async () => {
      // Login as Diana (not a member of the test organization)
      const dianaLogin = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'diana@example.com',
          password: 'SecurePass123!'
        });

      const dianaToken = dianaLogin.body.token;

      const docData = {
        title: 'Unauthorized Org Document',
        ownershipType: 'organizational',
        organizationId: testOrgId
      };

      await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${dianaToken}`)
        .send(docData)
        .expect(403); // Forbidden - not a member
    });

    test('should allow organization members to create organizational documents', async () => {
      const docData = {
        title: 'Member Created Org Document',
        description: 'Created by organization member',
        ownershipType: 'organizational',
        organizationId: testOrgId
      };

      const response = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${testOrgMemberToken}`)
        .send(docData)
        .expect(201);

      expect(response.body.document.ownershipType).toBe('organizational');
      expect(response.body.document.organizationId).toBe(testOrgId);
      expect(response.body.document.status).toBe('proposal');
    });
  });

  describe('Document Tree and Hierarchy', () => {
    let rootDocId;
    let childDocId;
    let grandchildDocId;

    test('should create a root document without parent', async () => {
      const docData = {
        title: 'Root Document',
        description: 'Top level document in hierarchy',
        ownershipType: 'personal'
      };

      const response = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send(docData)
        .expect(201);

      rootDocId = response.body.document.id;
      expect(response.body.document.parentId).toBeUndefined();
      expect(response.body.document.title).toBe(docData.title);
    });

    test('should create a child document with parent reference', async () => {
      const docData = {
        title: 'Child Document',
        description: 'Child document in hierarchy',
        ownershipType: 'personal',
        parentId: rootDocId
      };

      const response = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send(docData)
        .expect(201);

      childDocId = response.body.document.id;
      expect(response.body.document.parentId).toBe(rootDocId);
      expect(response.body.document.title).toBe(docData.title);
    });

    test('should create a grandchild document', async () => {
      const docData = {
        title: 'Grandchild Document',
        description: 'Third level in hierarchy',
        ownershipType: 'personal',
        parentId: childDocId
      };

      const response = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send(docData)
        .expect(201);

      grandchildDocId = response.body.document.id;
      expect(response.body.document.parentId).toBe(childDocId);
      expect(response.body.document.title).toBe(docData.title);
    });

    test('should prevent circular references in document hierarchy', async () => {
      // Try to make root document a child of its grandchild (circular reference)
      const docData = {
        title: 'Circular Reference Attempt',
        description: 'Should fail due to circular reference',
        ownershipType: 'personal',
        parentId: grandchildDocId
      };

      await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send(docData)
        .expect(400); // Bad request - circular reference detected
    });

    test('should enforce maximum hierarchy depth', async () => {
      // Create documents up to the maximum depth (10 levels)
      let currentParentId = grandchildDocId;

      for (let i = 0; i < 7; i++) { // 3 already created, need 7 more to reach 10
        const docData = {
          title: `Level ${i + 4} Document`,
          description: `Document at hierarchy level ${i + 4}`,
          ownershipType: 'personal',
          parentId: currentParentId
        };

        const response = await request(server)
          .post('/api/documents')
          .set('Authorization', `Bearer ${authToken}`)
          .send(docData)
          .expect(201);

        currentParentId = response.body.document.id;
      }

      // Now try to create one more level (should fail)
      const docData = {
        title: 'Level 11 Document - Should Fail',
        description: 'Document exceeding maximum hierarchy depth',
        ownershipType: 'personal',
        parentId: currentParentId
      };

      await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send(docData)
        .expect(400); // Bad request - max depth exceeded
    });

    test('should retrieve document hierarchy information', async () => {
      const response = await request(server)
        .get(`/api/documents/${childDocId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.document.parentId).toBe(rootDocId);
      expect(response.body.document.id).toBe(childDocId);
    });
  });

  describe('Advanced Voting Mechanics', () => {
    let votingDocId;
    let votingParaId;
    let votingProposalId;

    beforeAll(async () => {
      // Create a document with specific voting settings for testing
      const docData = {
        title: 'Voting Test Document',
        description: 'Document for testing voting mechanics',
        ownershipType: 'personal',
        options: {
          acceptanceThreshold: 50, // 50% acceptance threshold
          votingAnonymous: true,
          voteChangeAllowed: true,
          structureProposalsEnabled: true
        }
      };

      const docResponse = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send(docData)
        .expect(201);

      votingDocId = docResponse.body.document.id;

      // Create a paragraph
      const paraResponse = await request(server)
        .post(`/api/documents/${votingDocId}/paragraphs`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          text: 'This is a paragraph for voting tests.',
          order_index: 1
        })
        .expect(201);

      votingParaId = paraResponse.body.paragraph.id;

      // Create a proposal
      const proposalResponse = await request(server)
        .post(`/api/documents/${votingDocId}/paragraphs/${votingParaId}/proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          text: 'This is a proposed change for voting tests.',
          type: 'BODY'
        })
        .expect(201);

      votingProposalId = proposalResponse.body.proposal.id;
    });

    test('should handle multiple votes on a proposal', async () => {
      // Login as Bob and cast a vote
      const bobLogin = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'bob@example.com',
          password: 'SecurePass123!'
        });

      const bobToken = bobLogin.body.token;

      // Bob votes PRO
      await request(server)
        .post(`/api/documents/${votingDocId}/paragraphs/${votingParaId}/proposals/${votingProposalId}/vote`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ vote: 'PRO' })
        .expect(200);

      // Alice votes CONTRA
      await request(server)
        .post(`/api/documents/${votingDocId}/paragraphs/${votingParaId}/proposals/${votingProposalId}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ vote: 'CONTRA' })
        .expect(200);

      // Check proposal votes
      const proposalResponse = await request(server)
        .get(`/api/documents/${votingDocId}/paragraphs/${votingParaId}/proposals/${votingProposalId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(proposalResponse.body.proposal.votes).toBeDefined();
      expect(proposalResponse.body.proposal.votes.PRO).toBe(1);
      expect(proposalResponse.body.proposal.votes.CONTRA).toBe(1);
      expect(proposalResponse.body.proposal.votes.NEUTRAL).toBe(0);
    });

    test('should calculate acceptance percentage correctly', async () => {
      // Get the proposal to check acceptance calculation
      const proposalResponse = await request(server)
        .get(`/api/documents/${votingDocId}/paragraphs/${votingParaId}/proposals/${votingProposalId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const proposal = proposalResponse.body.proposal;
      const totalVotes = proposal.votes.PRO + proposal.votes.CONTRA + proposal.votes.NEUTRAL;
      const proPercentage = (proposal.votes.PRO / totalVotes) * 100;

      expect(totalVotes).toBe(2); // Bob PRO, Alice CONTRA
      expect(proPercentage).toBe(50); // 50% PRO votes

      // With 50% acceptance threshold, this proposal should be accepted
      expect(proPercentage).toBeGreaterThanOrEqual(50);
    });

    test('should handle NEUTRAL votes', async () => {
      // Login as Charlie and cast NEUTRAL vote
      const charlieLogin = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'charlie@example.com',
          password: 'SecurePass123!'
        });

      const charlieToken = charlieLogin.body.token;

      await request(server)
        .post(`/api/documents/${votingDocId}/paragraphs/${votingParaId}/proposals/${votingProposalId}/vote`)
        .set('Authorization', `Bearer ${charlieToken}`)
        .send({ vote: 'NEUTRAL' })
        .expect(200);

      // Check updated vote counts
      const proposalResponse = await request(server)
        .get(`/api/documents/${votingDocId}/paragraphs/${votingParaId}/proposals/${votingProposalId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(proposalResponse.body.proposal.votes.PRO).toBe(1);
      expect(proposalResponse.body.proposal.votes.CONTRA).toBe(1);
      expect(proposalResponse.body.proposal.votes.NEUTRAL).toBe(1);
    });

    test('should maintain vote anonymity when enabled', async () => {
      // For anonymous voting, individual voter identities should not be revealed
      const proposalResponse = await request(server)
        .get(`/api/documents/${votingDocId}/paragraphs/${votingParaId}/proposals/${votingProposalId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // With anonymous voting enabled, we should only see vote counts, not individual voters
      expect(proposalResponse.body.proposal.votes).toBeDefined();
      expect(proposalResponse.body.proposal.voters).toBeUndefined(); // Should not expose voter identities
    });

    test('should handle proposal acceptance based on threshold', async () => {
      // Create a new document with 75% threshold
      const thresholdDoc = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Threshold Test Document',
          ownershipType: 'personal',
          options: { acceptanceThreshold: 75 } // 75% required
        })
        .expect(201);

      const thresholdDocId = thresholdDoc.body.document.id;

      // Create paragraph and proposal
      const paraResponse = await request(server)
        .post(`/api/documents/${thresholdDocId}/paragraphs`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: 'Threshold test paragraph', order_index: 1 })
        .expect(201);

      const proposalResponse = await request(server)
        .post(`/api/documents/${thresholdDocId}/paragraphs/${paraResponse.body.paragraph.id}/proposals`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: 'Threshold test proposal', type: 'BODY' })
        .expect(201);

      const proposalId = proposalResponse.body.proposal.id;

      // Only cast one PRO vote out of three possible voters
      // This should result in 33% acceptance (below 75% threshold)
      const bobLogin = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'bob@example.com',
          password: 'SecurePass123!'
        });

      await request(server)
        .post(`/api/documents/${thresholdDocId}/paragraphs/${paraResponse.body.paragraph.id}/proposals/${proposalId}/vote`)
        .set('Authorization', `Bearer ${bobLogin.body.token}`)
        .send({ vote: 'PRO' })
        .expect(200);

      // Proposal should not be accepted yet (only 33% vs 75% threshold)
      const finalProposalResponse = await request(server)
        .get(`/api/documents/${thresholdDocId}/paragraphs/${paraResponse.body.paragraph.id}/proposals/${proposalId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(finalProposalResponse.body.proposal.status).toBe('active'); // Not accepted yet
    });
  });

  describe('Authentication and Authorization', () => {
    test('should require authentication for document operations', async () => {
      await request(server)
        .get('/api/documents')
        .expect(401);
    });

    test('should require authentication for paragraph operations', async () => {
      await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs`)
        .send({ text: 'Test', order_index: 1 })
        .expect(401);
    });

    test('should require authentication for proposal operations', async () => {
      await request(server)
        .post(`/api/documents/${testDocumentId}/paragraphs/para-1/proposals`)
        .send({ text: 'Test proposal', type: 'BODY' })
        .expect(401);
    });
  });
});
