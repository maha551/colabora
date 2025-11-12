const request = require('supertest');
const startTestServer = require('../../server/index');
const { hashPassword } = require('../../server/middleware/auth');

let server;
let authToken;
let repToken;
let regularToken;
let organizationId;
let electionId;

beforeAll(async () => {
  server = await startTestServer(3004);

  // Wait for demo data to be inserted (includes Diana as admin)
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Use existing demo users
  const regularUser = {
    email: 'alice@example.com',
    password: 'SecurePass123!'
  };

  const repUser = {
    email: 'bob@example.com',
    password: 'SecurePass123!'
  };

  const adminUser = {
    email: 'diana@example.com',
    password: 'SecurePass123!'
  };

  // Login to get tokens using demo users
  const loginResponse = await request(server)
    .post('/api/auth/login')
    .send(regularUser);
  authToken = loginResponse.body.token;

  const repLoginResponse = await request(server)
    .post('/api/auth/login')
    .send(repUser);
  repToken = repLoginResponse.body.token;

  const adminLoginResponse = await request(server)
    .post('/api/auth/login')
    .send(adminUser);
  regularToken = adminLoginResponse.body.token;
});

afterAll(async () => {
  if (server) {
    await new Promise(resolve => server.close(resolve));
  }
});

describe('Governance API Integration Tests', () => {
  describe('Organization Setup & Governance Rules', () => {
    test('should allow admin to create organization with governance rules', async () => {
      const orgData = {
        name: 'Democratic Council',
        description: 'A test organization for democratic governance',
        representatives: ['test-user-id-1', 'test-user-id-2', 'test-user-id-3'],
        membershipPolicy: 'invitation',
        votingEnabled: true,
        votingThreshold: 0.6
      };

      const response = await request(server)
        .post('/api/organizations')
        .set('Authorization', `Bearer ${regularToken}`)
        .send(orgData)
        .expect(201);

      expect(response.body).toHaveProperty('organization');
      expect(response.body.organization.name).toBe(orgData.name);
      expect(response.body.organization.membershipPolicy).toBe(orgData.membershipPolicy);

      organizationId = response.body.organization.id;

      // Verify governance rules were created
      const rulesResponse = await request(server)
        .get(`/api/governance/${organizationId}/governance-rules`)
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(200);

      expect(rulesResponse.body).toHaveProperty('governanceRules');
      expect(rulesResponse.body.governanceRules.representativeTermMonths).toBe(12);
      expect(rulesResponse.body.governanceRules.anonymousVotingEnabled).toBe(true);
    });

    test('should allow representatives to update governance rules', async () => {
      const updates = {
        representativeTermMonths: 24,
        electionQuorumPercentage: 0.75,
        voteChangeAllowed: true
      };

      const response = await request(server)
        .put(`/api/governance/${organizationId}/governance-rules`)
        .set('Authorization', `Bearer ${regularToken}`)
        .send(updates)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify updates
      const rulesResponse = await request(server)
        .get(`/api/governance/${organizationId}/governance-rules`)
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(200);

      expect(rulesResponse.body.governanceRules.representativeTermMonths).toBe(24);
      expect(rulesResponse.body.governanceRules.electionQuorumPercentage).toBe(0.75);
      expect(rulesResponse.body.governanceRules.voteChangeAllowed).toBe(true);
    });

    test('should reject governance rules updates from non-representatives', async () => {
      const updates = {
        representativeTermMonths: 36
      };

      await request(server)
        .put(`/api/governance/${organizationId}/governance-rules`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updates)
        .expect(403);
    });
  });

  describe('Representative Elections', () => {
    test('should allow representatives to create elections', async () => {
      const electionData = {
        title: 'Annual Representative Election 2024',
        description: 'Elect representatives for the coming year',
        positionsAvailable: 3,
        termMonths: 12
      };

      const response = await request(server)
        .post(`/api/governance/${organizationId}/elections`)
        .set('Authorization', `Bearer ${regularToken}`)
        .send(electionData)
        .expect(200);

      expect(response.body).toHaveProperty('election');
      expect(response.body.election.title).toBe(electionData.title);
      expect(response.body.election.positionsAvailable).toBe(electionData.positionsAvailable);
      expect(response.body.election.status).toBe('draft');

      electionId = response.body.election.id;
    });

    test('should reject election creation from non-representatives', async () => {
      const electionData = {
        title: 'Unauthorized Election',
        positionsAvailable: 2
      };

      await request(server)
        .post(`/api/governance/${organizationId}/elections`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(electionData)
        .expect(403);
    });

    test('should allow members to nominate candidates', async () => {
      // First add Alice as a member
      await request(server)
        .post(`/api/organizations/${organizationId}/members`)
        .set('Authorization', `Bearer ${regularToken}`)
        .send({ userId: 'cmgxlfj9z0000orjgnfy3revt' }) // Alice's ID
        .expect(200);

      const nominationData = {
        candidateUserId: 'cmgxlfj9z0000orjgnfy3revt', // Alice
        nominationStatement: 'I am committed to transparent and democratic governance.'
      };

      const response = await request(server)
        .post(`/api/governance/${organizationId}/elections/${electionId}/candidates`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(nominationData)
        .expect(200);

      expect(response.body).toHaveProperty('candidate');
      expect(response.body.candidate.userId).toBe(nominationData.candidateUserId);
      expect(response.body.candidate.acceptedNomination).toBe(false);
    });

    test('should allow candidates to accept nominations', async () => {
      // Get the candidate ID first
      const candidatesResponse = await request(server)
        .get(`/api/governance/${organizationId}/elections/${electionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const candidate = candidatesResponse.body.elections[0].candidates?.find(c => c.userId === 'cmgxlfj9z0000orjgnfy3revt');
      expect(candidate).toBeDefined();

      const response = await request(server)
        .post(`/api/governance/${organizationId}/elections/${electionId}/candidates/${candidate.id}/accept`)
        .set('Authorization', `Bearer ${authToken}`)
        .send()
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should allow representatives to start elections', async () => {
      const votingData = {
        votingStartDate: new Date().toISOString(),
        votingEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days from now
      };

      const response = await request(server)
        .post(`/api/governance/${organizationId}/elections/${electionId}/start`)
        .set('Authorization', `Bearer ${regularToken}`)
        .send(votingData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.votingStartsAt).toBeDefined();
      expect(response.body.votingEndsAt).toBeDefined();
    });

    test('should allow members to cast anonymous votes', async () => {
      const voteData = {
        candidateRanking: ['cmgxlfj9z0000orjgnfy3revt'] // Alice's ID
      };

      const response = await request(server)
        .post(`/api/governance/${organizationId}/elections/${electionId}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(voteData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Vote cast successfully');
    });

    test('should prevent double voting', async () => {
      const voteData = {
        candidateRanking: ['cmgxlfj9z0000orjgnfy3revt']
      };

      await request(server)
        .post(`/api/governance/${organizationId}/elections/${electionId}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(voteData)
        .expect(400);
    });

    test('should allow representatives to complete elections', async () => {
      const response = await request(server)
        .post(`/api/governance/${organizationId}/elections/${electionId}/complete`)
        .set('Authorization', `Bearer ${regularToken}`)
        .send()
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Election completed successfully');
      expect(response.body).toHaveProperty('electedCandidates');
    });
  });

  describe('Voting Analytics', () => {
    test('should provide voting analytics for organizations', async () => {
      const response = await request(server)
        .get(`/api/governance/${organizationId}/analytics?period=month`)
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('analytics');
      expect(response.body.analytics).toHaveProperty('totalMembers');
      expect(response.body.analytics).toHaveProperty('activeVoters');
      expect(response.body.analytics).toHaveProperty('electionsHeld');
      expect(response.body.analytics.electionsHeld).toBeGreaterThanOrEqual(1);
    });

    test('should reject analytics access from non-members', async () => {
      // Create a new user token that isn't a member
      const newUser = {
        email: 'charlie@example.com',
        password: 'SecurePass123!'
      };

      const loginResponse = await request(server)
        .post('/api/auth/login')
        .send(newUser);
      const newUserToken = loginResponse.body.token;

      await request(server)
        .get(`/api/governance/${organizationId}/analytics`)
        .set('Authorization', `Bearer ${newUserToken}`)
        .expect(403);
    });
  });

  describe('Election Retrieval', () => {
    test('should list elections for organization members', async () => {
      const response = await request(server)
        .get(`/api/governance/${organizationId}/elections`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('elections');
      expect(Array.isArray(response.body.elections)).toBe(true);
      expect(response.body.elections.length).toBeGreaterThan(0);

      const election = response.body.elections.find(e => e.id === electionId);
      expect(election).toBeDefined();
      expect(election.status).toBe('completed');
      expect(election).toHaveProperty('totalVoters');
      expect(election).toHaveProperty('votesCast');
    });
  });

  describe('Security & Access Control', () => {
    test('should prevent unauthorized access to governance endpoints', async () => {
      // Create unauthorized user
      const unauthorizedUser = {
        email: 'charlie@example.com',
        password: 'SecurePass123!'
      };

      const loginResponse = await request(server)
        .post('/api/auth/login')
        .send(unauthorizedUser);
      const unauthorizedToken = loginResponse.body.token;

      // Test various endpoints
      await request(server)
        .get(`/api/governance/${organizationId}/governance-rules`)
        .set('Authorization', `Bearer ${unauthorizedToken}`)
        .expect(403);

      await request(server)
        .get(`/api/governance/${organizationId}/elections`)
        .set('Authorization', `Bearer ${unauthorizedToken}`)
        .expect(403);

      await request(server)
        .get(`/api/governance/${organizationId}/analytics`)
        .set('Authorization', `Bearer ${unauthorizedToken}`)
        .expect(403);
    });

    test('should validate input data', async () => {
      // Test invalid election creation
      const invalidElection = {
        title: '', // Empty title
        positionsAvailable: 0 // Invalid number
      };

      await request(server)
        .post(`/api/governance/${organizationId}/elections`)
        .set('Authorization', `Bearer ${regularToken}`)
        .send(invalidElection)
        .expect(400);

      // Test invalid vote data
      const invalidVote = {
        candidateRanking: [] // Empty ranking
      };

      await request(server)
        .post(`/api/governance/${organizationId}/elections/${electionId}/vote`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidVote)
        .expect(400);
    });
  });
});
