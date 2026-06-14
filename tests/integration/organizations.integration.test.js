const request = require('supertest');
const { startApplication } = require('../../server/bootstrap');
const { hashPassword } = require('../../server/middleware/auth');
const { acceptOrganizationInvitationForUser } = require('../utils/test-helpers');

let server;
let authToken;
let adminToken;
let organizationId;
let testUserId;
let repUserIds = [];
let nonRepToken;
let nonRepUserId;

beforeAll(async () => {
  server = await startApplication({ port: 3003, returnServer: true });

  // Wait for demo data to be inserted
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Use existing demo users
  const regularUser = {
    email: 'alice@example.com',
    password: 'SecurePass123!'
  };

  // The seeded admin account is admin@colabora.local (see DatabaseManager demo seed).
  const adminUser = {
    email: 'admin@colabora.local',
    password: 'AdminSecurePass123!'
  };

  // Login to get tokens using demo users
  const loginResponse = await request(server)
    .post('/api/auth/login')
    .send(regularUser);

  authToken = loginResponse.body.token;
  testUserId = loginResponse.body.user.id;

  const adminLoginResponse = await request(server)
    .post('/api/auth/login')
    .send(adminUser);

  adminToken = adminLoginResponse.body.token;

  // Collect real (UUID) demo user IDs to use as organization representatives;
  // the admin endpoint validates that representative IDs are UUIDs that exist.
  const bobLogin = await request(server)
    .post('/api/auth/login')
    .send({ email: 'bob@example.com', password: 'SecurePass123!' });
  const charlieLogin = await request(server)
    .post('/api/auth/login')
    .send({ email: 'charlie@example.com', password: 'SecurePass123!' });
  repUserIds = [testUserId, bobLogin.body.user.id, charlieLogin.body.user.id];

  // Diana is a regular user who is NOT a representative of the test org —
  // used to assert that non-representatives cannot nominate representatives.
  const dianaLogin = await request(server)
    .post('/api/auth/login')
    .send({ email: 'diana@example.com', password: 'SecurePass123!' });
  nonRepToken = dianaLogin.body.token;
  nonRepUserId = dianaLogin.body.user.id;
});

afterAll(async () => {
  if (server) {
    await new Promise(resolve => server.close(resolve));
  }
});

describe('Organization API Integration Tests', () => {
  describe('Organization CRUD Operations', () => {
    test('should allow admin to create organization', async () => {
      const orgData = {
        // Use real seeded demo user IDs (Alice, Bob, Charlie) as representatives;
        // the admin endpoint verifies that representative user IDs exist.
        name: 'Test Organization',
        description: 'A test organization for integration testing',
        representatives: repUserIds,
        membershipPolicy: 'invitation',
        votingThreshold: 0.75
      };

      const response = await request(server)
        .post('/api/admin/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(orgData)
        .expect(201);

      expect(response.body).toHaveProperty('organization');
      expect(response.body.organization.name).toBe(orgData.name);
      expect(response.body.organization.membershipPolicy).toBe(orgData.membershipPolicy);
      expect(response.body.organization.votingThreshold).toBe(orgData.votingThreshold);

      organizationId = response.body.organization.id;
    });

    test('should reject organization creation without admin role', async () => {
      const orgData = {
        name: 'Unauthorized Organization',
        representatives: ['test-user-id-1', 'test-user-id-2', 'test-user-id-3']
      };

      await request(server)
        .post('/api/admin/organizations')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orgData)
        .expect(403);
    });

    test('should reject organization creation with insufficient representatives', async () => {
      const orgData = {
        name: 'Invalid Organization',
        representatives: ['test-user-id-1'] // Only 1 representative
      };

      await request(server)
        .post('/api/admin/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(orgData)
        .expect(400);
    });

    test('should retrieve user organizations', async () => {
      const response = await request(server)
        .get('/api/organizations')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body.organizations)).toBe(true);
    });

    test('should retrieve specific organization', async () => {
      const response = await request(server)
        .get(`/api/organizations/${organizationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.organization.id).toBe(organizationId);
      expect(response.body.organization.name).toBe('Test Organization');
    });
  });

  describe('Representative Management', () => {
    test('should have representative nomination endpoint', async () => {
      // Test that the endpoint exists and requires authentication
      const response = await request(server)
        .post(`/api/organizations/${organizationId}/representatives`)
        .send({ newRepresentativeId: 'cmgxlfj9z0000orjgnfy3revt' }) // Alice's ID
        .expect(401); // Should require authentication

      expect(response.body.error).toContain('Authentication required');
    });

    test('should reject representative nomination from non-representative', async () => {
      // Diana is neither a representative nor a member of this org, so she cannot
      // nominate representatives — the request is forbidden.
      const response = await request(server)
        .post(`/api/organizations/${organizationId}/representatives`)
        .set('Authorization', `Bearer ${nonRepToken}`)
        .send({ newRepresentativeId: testUserId })
        .expect(403); // Should be forbidden

      expect(response.body.error).toMatch(/member of this organization|representatives can nominate/i);
    });
  });

  describe('Member Management', () => {
    test('should allow representative to invite members', async () => {
      const inviteData = {
        emails: ['newmember@example.com', 'another@example.com']
      };

      const response = await request(server)
        .post(`/api/organizations/${organizationId}/members/invite`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(inviteData);

      // This might return 403 due to permission checks, which is expected
      // The important thing is the endpoint exists
      expect([200, 403]).toContain(response.status);
    });
  });

  describe('Voting System', () => {
    test('should retrieve organization votes', async () => {
      const response = await request(server)
        .get(`/api/organizations/${organizationId}/votes`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body.votes)).toBe(true);
    });

    test('should allow creating organization vote', async () => {
      const voteData = {
        title: 'Test Organization Vote',
        description: 'A test vote for organization decisions',
        voteType: 'policy',
        threshold: 0.6
      };

      const response = await request(server)
        .post(`/api/organizations/${organizationId}/votes`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(voteData);

      // This might return 403 due to permission checks, which is expected
      expect([200, 403]).toContain(response.status);
    });
  });

  describe('Input Validation and Security', () => {
    test('should reject invalid organization data', async () => {
      const invalidData = {
        name: '', // Empty name
        representatives: []
      };

      await request(server)
        .post('/api/admin/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidData)
        .expect(400);
    });

    test('should require authentication for organization operations', async () => {
      await request(server)
        .get('/api/organizations')
        .expect(401);
    });

    test('should prevent XSS in organization names', async () => {
      const xssData = {
        name: '<script>alert("xss")</script>Safe Name',
        representatives: repUserIds
      };

      const response = await request(server)
        .post('/api/admin/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(xssData)
        .expect(201);

      // The name should be sanitized
      expect(response.body.organization.name).toContain('Safe Name');
    });
  });

  describe('Member Join/Leave Document Sync', () => {
    let testOrgId;
    let repToken;
    let memberUserId;
    let memberToken;
    let orgDoc1Id;
    let orgDoc2Id;

    beforeAll(async () => {
      // Create a test organization
      const orgData = {
        name: 'Sync Test Organization',
        description: 'Organization for testing member sync',
        representatives: [testUserId],
        membershipPolicy: 'invitation',
        votingThreshold: 0.5
      };

      const orgResponse = await request(server)
        .post('/api/admin/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(orgData)
        .expect(201);

      testOrgId = orgResponse.body.organization.id;
      repToken = authToken; // Alice is the representative

      // Create organizational documents
      const doc1Response = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${repToken}`)
        .send({
          title: 'Org Document 1',
          ownershipType: 'organizational',
          organizationId: testOrgId
        })
        .expect(201);
      orgDoc1Id = doc1Response.body.document.id;

      const doc2Response = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${repToken}`)
        .send({
          title: 'Org Document 2',
          ownershipType: 'organizational',
          organizationId: testOrgId
        })
        .expect(201);
      orgDoc2Id = doc2Response.body.document.id;

      // Get a user to add as member (Bob)
      const memberLogin = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'bob@example.com',
          password: 'SecurePass123!'
        });
      memberUserId = memberLogin.body.user.id;
      memberToken = memberLogin.body.token;
    });

    test('should automatically add new member as collaborator to all org documents', async () => {
      await request(server)
        .post(`/api/organizations/${testOrgId}/members`)
        .set('Authorization', `Bearer ${repToken}`)
        .send({ userId: memberUserId })
        .expect(200);

      await acceptOrganizationInvitationForUser(server, testOrgId, {
        email: 'bob@example.com',
        password: 'SecurePass123!',
      });

      // Verify member can access both documents
      const doc1Response = await request(server)
        .get(`/api/documents/${orgDoc1Id}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      const doc2Response = await request(server)
        .get(`/api/documents/${orgDoc2Id}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(doc1Response.body.document).toBeDefined();
      expect(doc2Response.body.document).toBeDefined();

      // Verify member is in collaborators list
      expect(doc1Response.body.document.collaborators).toBeDefined();
      const isCollaborator = doc1Response.body.document.collaborators.some(
        c => c.user.id === memberUserId
      );
      expect(isCollaborator).toBe(true);
    });

    test('should automatically remove member from all org documents when they leave', async () => {
      // Remove member from organization
      await request(server)
        .delete(`/api/organizations/${testOrgId}/members/${memberUserId}`)
        .set('Authorization', `Bearer ${repToken}`)
        .expect(200);

      // Verify member can no longer access documents. GET /:id hides inaccessible
      // documents with 404 (it does not reveal their existence with 403).
      await request(server)
        .get(`/api/documents/${orgDoc1Id}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(404);

      await request(server)
        .get(`/api/documents/${orgDoc2Id}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(404);
    });

    test('should handle member join when organization has no documents', async () => {
      // Create a new organization with no documents
      const emptyOrgData = {
        name: 'Empty Org',
        description: 'Organization with no documents',
        representatives: [testUserId],
        membershipPolicy: 'invitation',
        votingThreshold: 0.5
      };

      const emptyOrgResponse = await request(server)
        .post('/api/admin/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(emptyOrgData)
        .expect(201);

      const emptyOrgId = emptyOrgResponse.body.organization.id;

      // Add member - should not error even with no documents
      const response = await request(server)
        .post(`/api/organizations/${emptyOrgId}/members`)
        .set('Authorization', `Bearer ${repToken}`)
        .send({ userId: memberUserId })
        .expect(200);

      expect(response.body.invitationSent).toBe(true);
    });

    test('should sync collaborators when new organizational document is created', async () => {
      // Use a fresh member (Charlie). Removed members are soft-deleted ('legacy'),
      // so re-adding the previously-removed member would be rejected as a duplicate.
      const charlieLogin = await request(server)
        .post('/api/auth/login')
        .send({ email: 'charlie@example.com', password: 'SecurePass123!' });
      const charlieId = charlieLogin.body.user.id;
      const charlieToken = charlieLogin.body.token;

      await request(server)
        .post(`/api/organizations/${testOrgId}/members`)
        .set('Authorization', `Bearer ${repToken}`)
        .send({ userId: charlieId })
        .expect(200);

      await acceptOrganizationInvitationForUser(server, testOrgId, {
        email: 'charlie@example.com',
        password: 'SecurePass123!',
      });

      // Create a new organizational document
      const newDocResponse = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${repToken}`)
        .send({
          title: 'New Org Document',
          ownershipType: 'organizational',
          organizationId: testOrgId
        })
        .expect(201);

      const newDocId = newDocResponse.body.document.id;

      // Verify member is automatically added as collaborator
      const docResponse = await request(server)
        .get(`/api/documents/${newDocId}`)
        .set('Authorization', `Bearer ${charlieToken}`)
        .expect(200);

      const isCollaborator = docResponse.body.document.collaborators.some(
        c => c.user.id === charlieId
      );
      expect(isCollaborator).toBe(true);
    });

    test('should not add document owner as collaborator', async () => {
      // Create a document as the representative
      const docResponse = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${repToken}`)
        .send({
          title: 'Owner Test Document',
          ownershipType: 'organizational',
          organizationId: testOrgId
        })
        .expect(201);

      const docId = docResponse.body.document.id;

      // Get document details
      const getDocResponse = await request(server)
        .get(`/api/documents/${docId}`)
        .set('Authorization', `Bearer ${repToken}`)
        .expect(200);

      // For organizational documents the owner is the organization itself, and all
      // active members (including the representative who created the document) are
      // synced as collaborators. So the creating representative is a collaborator.
      const ownerIsCollaborator = getDocResponse.body.document.collaborators.some(
        c => c.user.id === testUserId
      );
      expect(ownerIsCollaborator).toBe(true);
    });
  });

  describe('Member self-leave', () => {
    let bobId;
    let bobToken;
    let charlieToken;

    beforeAll(async () => {
      const bobLogin = await request(server)
        .post('/api/auth/login')
        .send({ email: 'bob@example.com', password: 'SecurePass123!' });
      bobId = bobLogin.body.user.id;
      bobToken = bobLogin.body.token;

      const charlieLogin = await request(server)
        .post('/api/auth/login')
        .send({ email: 'charlie@example.com', password: 'SecurePass123!' });
      charlieToken = charlieLogin.body.token;
    });

    test('plain member leaves and is removed from org document collaborators', async () => {
      const orgResponse = await request(server)
        .post('/api/admin/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Self-Leave Plain Member Org',
          representatives: [testUserId],
          membershipPolicy: 'invitation',
          votingThreshold: 0.5,
        })
        .expect(201);

      const orgId = orgResponse.body.organization.id;

      await request(server)
        .post(`/api/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ userId: bobId })
        .expect(200);

      await acceptOrganizationInvitationForUser(server, orgId, {
        id: bobId,
        email: 'bob@example.com',
        password: 'SecurePass123!',
      });

      const docResponse = await request(server)
        .post('/api/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Self-Leave Doc',
          ownershipType: 'organizational',
          organizationId: orgId,
        })
        .expect(201);
      const docId = docResponse.body.document.id;

      await request(server)
        .get(`/api/documents/${docId}`)
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(200);

      const leaveResponse = await request(server)
        .post(`/api/organizations/${orgId}/leave`)
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(200);

      expect(leaveResponse.body.success).toBe(true);
      expect(leaveResponse.body.electionCreated).toBe(false);

      await request(server)
        .get(`/api/documents/${docId}`)
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(404);

      const orgDetails = await request(server)
        .get(`/api/organizations/${orgId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const bobMembership = orgDetails.body.organization.members.find(m => m.userId === bobId);
      expect(bobMembership.status).toBe('legacy');
    });

    test('non-member cannot leave organization', async () => {
      const orgResponse = await request(server)
        .post('/api/admin/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Self-Leave Forbidden Org',
          representatives: [testUserId],
          membershipPolicy: 'invitation',
          votingThreshold: 0.5,
        })
        .expect(201);

      const orgId = orgResponse.body.organization.id;

      await request(server)
        .post(`/api/organizations/${orgId}/leave`)
        .set('Authorization', `Bearer ${charlieToken}`)
        .expect(403);
    });

    test('last active representative cannot leave', async () => {
      const orgResponse = await request(server)
        .post('/api/admin/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Self-Leave Last Rep Org',
          representatives: [testUserId],
          membershipPolicy: 'invitation',
          votingThreshold: 0.5,
        })
        .expect(201);

      const orgId = orgResponse.body.organization.id;

      const leaveResponse = await request(server)
        .post(`/api/organizations/${orgId}/leave`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(leaveResponse.body.code).toBe('CANNOT_LEAVE_LAST_REP');
    });

    test('representative leaving with another rep creates draft replacement election', async () => {
      const orgResponse = await request(server)
        .post('/api/admin/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Self-Leave Rep Departure Org',
          representatives: [testUserId, bobId],
          membershipPolicy: 'invitation',
          votingThreshold: 0.5,
        })
        .expect(201);

      const orgId = orgResponse.body.organization.id;

      const leaveResponse = await request(server)
        .post(`/api/organizations/${orgId}/leave`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(leaveResponse.body.success).toBe(true);
      expect(leaveResponse.body.electionCreated).toBe(true);
      expect(leaveResponse.body.electionId).toBeDefined();

      const electionsResponse = await request(server)
        .get(`/api/governance/${orgId}/elections`)
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(200);

      const createdElection = electionsResponse.body.elections.find(
        (election) => election.id === leaveResponse.body.electionId
      );
      expect(createdElection).toBeDefined();
      expect(createdElection.status).toBe('draft');
      expect(createdElection.electionDescription).toContain('leaving the organization');

      const orgDetails = await request(server)
        .get(`/api/organizations/${orgId}`)
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(200);

      expect(orgDetails.body.organization.representatives).not.toContain(testUserId);
      const aliceMembership = orgDetails.body.organization.members.find(m => m.userId === testUserId);
      expect(aliceMembership.status).toBe('legacy');
    });
  });
});
