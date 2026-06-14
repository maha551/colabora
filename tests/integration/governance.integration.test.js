const request = require('supertest');
const { waitFor } = require('../utils/test-helpers');

let server;
let admin;
let alice;
let bob;
let charlie;
let diana;
let organizationId;
let electionId;
let electionCandidateId;

async function login(email, password) {
  const res = await request(server)
    .post('/api/auth/login')
    .send({ email, password });
  if (res.status !== 200 || !res.body.token || !res.body.user?.id) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.token, user: res.body.user };
}

async function ensureDatabaseAvailable() {
  await waitFor(async () => {
    const res = await request(server).get('/api/health/ready');
    if (res.status === 200 && res.body.status === 'ready') {
      return true;
    }

    const db = server.app?.locals?.db;
    if (db && server.app.locals.dbAvailable === false) {
      try {
        await db.raw('SELECT 1');
        server.app.locals.dbAvailable = true;
        server.app.locals.knex = db;
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }, 20000, 500);
}

async function waitForServerReady() {
  await waitFor(async () => {
    const res = await request(server).get('/api/health/ready');
    return res.status === 200 && res.body.status === 'ready';
  }, 20000, 500);
}

async function createTestOrganization(nameSuffix = '', representativeIds = null) {
  const orgData = {
    name: `Democratic Council${nameSuffix}`,
    description: 'A test organization for democratic governance',
    representatives: representativeIds ?? [alice.user.id, bob.user.id, charlie.user.id],
    membershipPolicy: 'invitation',
    votingEnabled: true,
    votingThreshold: 0.6
  };

  const response = await request(server)
    .post('/api/admin/organizations')
    .set('Authorization', `Bearer ${admin.token}`)
    .send(orgData)
    .expect(201);

  return response.body.organization.id;
}

const votingWindow = () => ({
  votingStartDate: new Date().toISOString(),
  votingEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
});

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.PG_POOL_MAX = '10';

  const startTestServer = require('../../server/bootstrap').startApplication;
  server = await startTestServer({ port: 3004, returnServer: true });

  await waitForServerReady();
  await ensureDatabaseAvailable();

  admin = await login('admin@colabora.local', 'AdminSecurePass123!');
  alice = await login('alice@example.com', 'SecurePass123!');
  bob = await login('bob@example.com', 'SecurePass123!');
  charlie = await login('charlie@example.com', 'SecurePass123!');
  diana = await login('diana@example.com', 'SecurePass123!');
});

afterAll(async () => {
  if (server) {
    if (typeof server.stop === 'function') {
      await new Promise((resolve) => server.stop(resolve));
    } else {
      await new Promise((resolve) => server.close(resolve));
    }
  }
});

describe('Governance API Integration Tests', () => {
  describe('Organization Setup & Governance Rules', () => {
    test('should allow admin to create organization with governance rules', async () => {
      organizationId = await createTestOrganization();

      const rulesResponse = await request(server)
        .get(`/api/governance/${organizationId}/governance-rules`)
        .set('Authorization', `Bearer ${bob.token}`)
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
        .set('Authorization', `Bearer ${bob.token}`)
        .send(updates)
        .expect(200);

      expect(response.body.success).toBe(true);

      const rulesResponse = await request(server)
        .get(`/api/governance/${organizationId}/governance-rules`)
        .set('Authorization', `Bearer ${admin.token}`)
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
        .set('Authorization', `Bearer ${diana.token}`)
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
        .set('Authorization', `Bearer ${bob.token}`)
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
        .set('Authorization', `Bearer ${diana.token}`)
        .send(electionData)
        .expect(403);
    });

    test('should allow members to nominate candidates', async () => {
      const nominationData = {
        candidateUserId: alice.user.id,
        nominationStatement: 'I am committed to transparent and democratic governance.'
      };

      const response = await request(server)
        .post(`/api/governance/${organizationId}/elections/${electionId}/candidates`)
        .set('Authorization', `Bearer ${alice.token}`)
        .send(nominationData)
        .expect(200);

      expect(response.body).toHaveProperty('candidate');
      expect(response.body.candidate.userId).toBe(nominationData.candidateUserId);
      expect(response.body.candidate.acceptedNomination).toBe(false);
      electionCandidateId = response.body.candidate.id;
    });

    test('should allow candidates to accept nominations', async () => {
      const candidatesResponse = await request(server)
        .get(`/api/governance/${organizationId}/elections`)
        .set('Authorization', `Bearer ${alice.token}`)
        .expect(200);

      const election = candidatesResponse.body.elections.find((e) => e.id === electionId);
      expect(election).toBeDefined();
      const candidate = election.candidates?.find(
        (c) => c.userId === alice.user.id
      );
      expect(candidate).toBeDefined();

      const response = await request(server)
        .post(`/api/governance/${organizationId}/elections/${electionId}/candidates/${candidate.id}/accept`)
        .set('Authorization', `Bearer ${alice.token}`)
        .send()
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should allow representatives to start elections', async () => {
      const response = await request(server)
        .post(`/api/governance/${organizationId}/elections/${electionId}/start`)
        .set('Authorization', `Bearer ${bob.token}`)
        .send(votingWindow())
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.votingStartsAt).toBeDefined();
      expect(response.body.votingEndsAt).toBeDefined();
    });

    test('should allow members to cast anonymous votes', async () => {
      const voteData = {
        candidateRanking: [electionCandidateId]
      };

      const response = await request(server)
        .post(`/api/governance/${organizationId}/elections/${electionId}/vote`)
        .set('Authorization', `Bearer ${alice.token}`)
        .send(voteData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Vote cast successfully');
      expect(response.body.receiptId).toBeDefined();
      expect(response.body.contestId).toBeDefined();
    });

    test('should prevent double voting', async () => {
      const voteData = {
        candidateRanking: [electionCandidateId]
      };

      await request(server)
        .post(`/api/governance/${organizationId}/elections/${electionId}/vote`)
        .set('Authorization', `Bearer ${alice.token}`)
        .send(voteData)
        .expect(400);
    });

    test('should allow representatives to complete elections', async () => {
      await request(server)
        .post(`/api/governance/${organizationId}/elections/${electionId}/vote`)
        .set('Authorization', `Bearer ${bob.token}`)
        .send({ candidateRanking: [electionCandidateId] })
        .expect(200);

      await request(server)
        .post(`/api/governance/${organizationId}/elections/${electionId}/vote`)
        .set('Authorization', `Bearer ${charlie.token}`)
        .send({ candidateRanking: [electionCandidateId] })
        .expect(200);

      const response = await request(server)
        .post(`/api/governance/${organizationId}/elections/${electionId}/complete`)
        .set('Authorization', `Bearer ${bob.token}`)
        .send()
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Election completed successfully');
      expect(response.body).toHaveProperty('electedCandidates');
    });
  });

  describe('Public Representative Elections (anonymousVotingEnabled: false)', () => {
    let publicElectionId;
    let publicCandidateId;

    test('should disable anonymous voting in governance rules', async () => {
      const response = await request(server)
        .put(`/api/governance/${organizationId}/governance-rules`)
        .set('Authorization', `Bearer ${bob.token}`)
        .send({
          anonymousVotingEnabled: false,
          electionQuorumPercentage: 0.34
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      const rulesResponse = await request(server)
        .get(`/api/governance/${organizationId}/governance-rules`)
        .set('Authorization', `Bearer ${bob.token}`)
        .expect(200);

      expect(rulesResponse.body.governanceRules.anonymousVotingEnabled).toBe(false);
    });

    test('should create a public election', async () => {
      const response = await request(server)
        .post(`/api/governance/${organizationId}/elections`)
        .set('Authorization', `Bearer ${bob.token}`)
        .send({
          title: 'Public Representative Election',
          description: 'Elect representatives with public ballots',
          positionsAvailable: 1,
          termMonths: 12
        })
        .expect(200);

      expect(response.body.election.anonymousVoting).toBe(false);
      publicElectionId = response.body.election.id;
    });

    test('should nominate and accept a candidate for public election', async () => {
      const nominationResponse = await request(server)
        .post(`/api/governance/${organizationId}/elections/${publicElectionId}/candidates`)
        .set('Authorization', `Bearer ${bob.token}`)
        .send({
          candidateUserId: bob.user.id,
          nominationStatement: 'Ready to serve with transparent voting.'
        })
        .expect(200);

      publicCandidateId = nominationResponse.body.candidate.id;

      await request(server)
        .post(`/api/governance/${organizationId}/elections/${publicElectionId}/candidates/${publicCandidateId}/accept`)
        .set('Authorization', `Bearer ${bob.token}`)
        .send()
        .expect(200);
    });

    test('should start public election without voter tokens', async () => {
      const response = await request(server)
        .post(`/api/governance/${organizationId}/elections/${publicElectionId}/start`)
        .set('Authorization', `Bearer ${bob.token}`)
        .send(votingWindow())
        .expect(200);

      expect(response.body.success).toBe(true);

      const electionsResponse = await request(server)
        .get(`/api/governance/${organizationId}/elections`)
        .set('Authorization', `Bearer ${alice.token}`)
        .expect(200);

      const election = electionsResponse.body.elections.find((e) => e.id === publicElectionId);
      expect(election.anonymousVoting).toBe(false);
      expect(election.votingSessionId).toBeNull();
    });

    test('should allow members to cast public votes', async () => {
      const response = await request(server)
        .post(`/api/governance/${organizationId}/elections/${publicElectionId}/vote`)
        .set('Authorization', `Bearer ${alice.token}`)
        .send({ candidateId: publicCandidateId })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.anonymousVoting).toBe(false);
      expect(response.body.receiptId).toBeUndefined();
      expect(response.body.contestId).toBe(publicElectionId);

      const voteStatus = await request(server)
        .get(`/api/governance/${organizationId}/elections/${publicElectionId}/user-vote-status`)
        .set('Authorization', `Bearer ${alice.token}`)
        .expect(200);

      expect(voteStatus.body.hasVoted).toBe(true);
      expect(voteStatus.body.voteData.candidateId).toBe(publicCandidateId);
    });

    test('should reject double voting in public elections', async () => {
      await request(server)
        .post(`/api/governance/${organizationId}/elections/${publicElectionId}/vote`)
        .set('Authorization', `Bearer ${alice.token}`)
        .send({ candidateId: publicCandidateId })
        .expect(400);
    });

    test('should complete public election lifecycle', async () => {
      await request(server)
        .post(`/api/governance/${organizationId}/elections/${publicElectionId}/vote`)
        .set('Authorization', `Bearer ${bob.token}`)
        .send({ candidateId: publicCandidateId })
        .expect(200);

      const response = await request(server)
        .post(`/api/governance/${organizationId}/elections/${publicElectionId}/complete`)
        .set('Authorization', `Bearer ${bob.token}`)
        .send()
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.electedCandidates.length).toBeGreaterThan(0);
    });
  });

  describe('Rule Proposal Lifecycle', () => {
    let ruleProposalId;

    test('should create, vote on, and complete a rule proposal', async () => {
      const createResponse = await request(server)
        .post(`/api/governance/${organizationId}/rule-proposals`)
        .set('Authorization', `Bearer ${bob.token}`)
        .send({
          title: 'Extend document proposal period',
          description: 'Propose a longer document proposal period for testing',
          ruleField: 'documentProposalPeriodDays',
          proposedValue: 45
        })
        .expect(200);

      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.ruleProposal).toBeDefined();
      ruleProposalId = createResponse.body.ruleProposal.id;

      const startResponse = await request(server)
        .post(`/api/governance/${organizationId}/rule-proposals/${ruleProposalId}/start-voting`)
        .set('Authorization', `Bearer ${bob.token}`)
        .send()
        .expect(200);

      expect(startResponse.body.success).toBe(true);
      expect(startResponse.body.votingEndsAt).toBeDefined();

      for (const voter of [alice, bob, charlie]) {
        const voteResponse = await request(server)
          .post(`/api/governance/${organizationId}/rule-proposals/${ruleProposalId}/vote`)
          .set('Authorization', `Bearer ${voter.token}`)
          .send({ vote: 'PRO' })
          .expect(200);

        expect(voteResponse.body.success).toBe(true);
        expect(voteResponse.body.receiptId).toBeDefined();
      }

      const completeResponse = await request(server)
        .post(`/api/governance/${organizationId}/rule-proposals/${ruleProposalId}/complete`)
        .set('Authorization', `Bearer ${bob.token}`)
        .send()
        .expect(200);

      expect(completeResponse.body.success).toBe(true);

      const rulesResponse = await request(server)
        .get(`/api/governance/${organizationId}/governance-rules`)
        .set('Authorization', `Bearer ${alice.token}`)
        .expect(200);

      expect(rulesResponse.body.governanceRules.documentProposalPeriodDays).toBe(45);
    });

    test('should reject duplicate draft proposals for the same rule field', async () => {
      const firstResponse = await request(server)
        .post(`/api/governance/${organizationId}/rule-proposals`)
        .set('Authorization', `Bearer ${bob.token}`)
        .send({
          title: 'Change election notice period',
          description: 'First proposal for electionNoticeDays',
          ruleField: 'electionNoticeDays',
          proposedValue: 21
        })
        .expect(200);

      expect(firstResponse.body.ruleProposal.id).toBeDefined();

      const duplicateResponse = await request(server)
        .post(`/api/governance/${organizationId}/rule-proposals`)
        .set('Authorization', `Bearer ${bob.token}`)
        .send({
          title: 'Duplicate election notice period',
          description: 'Second proposal for the same field',
          ruleField: 'electionNoticeDays',
          proposedValue: 30
        })
        .expect(409);

      expect(duplicateResponse.body.code).toBe('DUPLICATE_PROPOSAL');
    });
  });

  describe('Election Edge Cases', () => {
    let edgeOrgId;

    beforeAll(async () => {
      edgeOrgId = await createTestOrganization(' Edge Cases');
    });

    test('should cancel election when quorum is not met on complete', async () => {
      await request(server)
        .put(`/api/governance/${edgeOrgId}/governance-rules`)
        .set('Authorization', `Bearer ${bob.token}`)
        .send({ electionQuorumPercentage: 1.0 })
        .expect(200);

      const createResponse = await request(server)
        .post(`/api/governance/${edgeOrgId}/elections`)
        .set('Authorization', `Bearer ${bob.token}`)
        .send({
          title: 'High Quorum Election',
          description: 'Election to verify quorum failure handling',
          positionsAvailable: 1,
          termMonths: 12
        })
        .expect(200);

      const quorumElectionId = createResponse.body.election.id;
      expect(createResponse.body.election.quorumRequired).toBeGreaterThanOrEqual(3);

      const nominationResponse = await request(server)
        .post(`/api/governance/${edgeOrgId}/elections/${quorumElectionId}/candidates`)
        .set('Authorization', `Bearer ${alice.token}`)
        .send({
          candidateUserId: alice.user.id,
          nominationStatement: 'Candidate for quorum test.'
        })
        .expect(200);

      const candidateId = nominationResponse.body.candidate.id;

      await request(server)
        .post(`/api/governance/${edgeOrgId}/elections/${quorumElectionId}/candidates/${candidateId}/accept`)
        .set('Authorization', `Bearer ${alice.token}`)
        .send()
        .expect(200);

      await request(server)
        .post(`/api/governance/${edgeOrgId}/elections/${quorumElectionId}/start`)
        .set('Authorization', `Bearer ${bob.token}`)
        .send(votingWindow())
        .expect(200);

      await request(server)
        .post(`/api/governance/${edgeOrgId}/elections/${quorumElectionId}/vote`)
        .set('Authorization', `Bearer ${alice.token}`)
        .send({ candidateRanking: [candidateId] })
        .expect(200);

      const completeResponse = await request(server)
        .post(`/api/governance/${edgeOrgId}/elections/${quorumElectionId}/complete`)
        .set('Authorization', `Bearer ${bob.token}`)
        .send()
        .expect(200);

      expect(completeResponse.body.success).toBe(false);
      expect(completeResponse.body.message).toMatch(/quorum/i);

      const electionsResponse = await request(server)
        .get(`/api/governance/${edgeOrgId}/elections`)
        .set('Authorization', `Bearer ${alice.token}`)
        .expect(200);

      const election = electionsResponse.body.elections.find((e) => e.id === quorumElectionId);
      expect(election).toBeDefined();
      expect(election.status).toBe('cancelled');
    });

    test('should complete ranked-choice election with ranked ballots', async () => {
      await request(server)
        .put(`/api/governance/${edgeOrgId}/governance-rules`)
        .set('Authorization', `Bearer ${bob.token}`)
        .send({
          electionVotingMethod: 'ranked_choice',
          electionQuorumPercentage: 0.34,
          anonymousVotingEnabled: false
        })
        .expect(200);

      const createResponse = await request(server)
        .post(`/api/governance/${edgeOrgId}/elections`)
        .set('Authorization', `Bearer ${bob.token}`)
        .send({
          title: 'Ranked Choice Election',
          description: 'Election to verify ranked-choice voting',
          positionsAvailable: 1,
          termMonths: 12
        })
        .expect(200);

      const rankedElectionId = createResponse.body.election.id;
      const candidateIds = [];

      for (const user of [alice, bob]) {
        const nominationResponse = await request(server)
          .post(`/api/governance/${edgeOrgId}/elections/${rankedElectionId}/candidates`)
          .set('Authorization', `Bearer ${user.token}`)
          .send({
            candidateUserId: user.user.id,
            nominationStatement: `Nomination for ${user.user.id}`
          })
          .expect(200);

        const candidateId = nominationResponse.body.candidate.id;
        candidateIds.push(candidateId);

        await request(server)
          .post(`/api/governance/${edgeOrgId}/elections/${rankedElectionId}/candidates/${candidateId}/accept`)
          .set('Authorization', `Bearer ${user.token}`)
          .send()
          .expect(200);
      }

      await request(server)
        .post(`/api/governance/${edgeOrgId}/elections/${rankedElectionId}/start`)
        .set('Authorization', `Bearer ${bob.token}`)
        .send(votingWindow())
        .expect(200);

      const [candidateA, candidateB] = candidateIds;

      for (const [voter, ranking] of [
        [alice, [candidateB, candidateA]],
        [bob, [candidateB, candidateA]],
        [charlie, [candidateB, candidateA]]
      ]) {
        await request(server)
          .post(`/api/governance/${edgeOrgId}/elections/${rankedElectionId}/vote`)
          .set('Authorization', `Bearer ${voter.token}`)
          .send({ candidateRanking: ranking })
          .expect(200);
      }

      const completeResponse = await request(server)
        .post(`/api/governance/${edgeOrgId}/elections/${rankedElectionId}/complete`)
        .set('Authorization', `Bearer ${bob.token}`)
        .send()
        .expect(200);

      expect(completeResponse.body.success).toBe(true);
      expect(completeResponse.body.electedCandidates.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Voting Analytics', () => {
    test('should provide voting analytics for organizations', async () => {
      const response = await request(server)
        .get(`/api/governance/${organizationId}/analytics?period=month`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body).toHaveProperty('analytics');
      expect(response.body.analytics).toHaveProperty('totalMembers');
      expect(response.body.analytics).toHaveProperty('activeVoters');
      expect(response.body.analytics).toHaveProperty('electionsHeld');
      expect(response.body.analytics.electionsHeld).toBeGreaterThanOrEqual(1);
    });

    test('should reject analytics access from non-members', async () => {
      await request(server)
        .get(`/api/governance/${organizationId}/analytics`)
        .set('Authorization', `Bearer ${diana.token}`)
        .expect(403);
    });
  });

  describe('Election Retrieval', () => {
    test('should list elections for organization members', async () => {
      const response = await request(server)
        .get(`/api/governance/${organizationId}/elections`)
        .set('Authorization', `Bearer ${alice.token}`)
        .expect(200);

      expect(response.body).toHaveProperty('elections');
      expect(Array.isArray(response.body.elections)).toBe(true);
      expect(response.body.elections.length).toBeGreaterThan(0);

      const election = response.body.elections.find((e) => e.id === electionId);
      expect(election).toBeDefined();
      expect(election.status).toBe('completed');
      expect(election).toHaveProperty('totalVoters');
      expect(election).toHaveProperty('votesCast');
    });
  });

  describe('Security & Access Control', () => {
    test('should prevent unauthorized access to governance endpoints', async () => {
      await request(server)
        .get(`/api/governance/${organizationId}/governance-rules`)
        .set('Authorization', `Bearer ${diana.token}`)
        .expect(403);

      await request(server)
        .get(`/api/governance/${organizationId}/elections`)
        .set('Authorization', `Bearer ${diana.token}`)
        .expect(403);

      await request(server)
        .get(`/api/governance/${organizationId}/analytics`)
        .set('Authorization', `Bearer ${diana.token}`)
        .expect(403);
    });

    test('should validate election creation input', async () => {
      const invalidElection = {
        title: '',
        positionsAvailable: 0
      };

      await request(server)
        .post(`/api/governance/${organizationId}/elections`)
        .set('Authorization', `Bearer ${bob.token}`)
        .send(invalidElection)
        .expect(400);
    });
  });

  describe('Vote input validation', () => {
    let validationElectionId;
    let validationCandidateId;

    beforeAll(async () => {
      const createResponse = await request(server)
        .post(`/api/governance/${organizationId}/elections`)
        .set('Authorization', `Bearer ${bob.token}`)
        .send({
          title: 'Validation Election',
          description: 'Election for vote input validation tests',
          positionsAvailable: 1,
          termMonths: 12
        })
        .expect(200);

      validationElectionId = createResponse.body.election.id;

      const nominationResponse = await request(server)
        .post(`/api/governance/${organizationId}/elections/${validationElectionId}/candidates`)
        .set('Authorization', `Bearer ${charlie.token}`)
        .send({
          candidateUserId: charlie.user.id,
          nominationStatement: 'Candidate for vote validation test.'
        })
        .expect(200);

      validationCandidateId = nominationResponse.body.candidate.id;

      await request(server)
        .post(`/api/governance/${organizationId}/elections/${validationElectionId}/candidates/${validationCandidateId}/accept`)
        .set('Authorization', `Bearer ${charlie.token}`)
        .send()
        .expect(200);

      await request(server)
        .post(`/api/governance/${organizationId}/elections/${validationElectionId}/start`)
        .set('Authorization', `Bearer ${bob.token}`)
        .send(votingWindow())
        .expect(200);
    });

    test('should reject empty candidate ranking on active election', async () => {
      const response = await request(server)
        .post(`/api/governance/${organizationId}/elections/${validationElectionId}/vote`)
        .set('Authorization', `Bearer ${alice.token}`)
        .send({ candidateRanking: [] })
        .expect(400);

      expect(response.body.error).toMatch(/No candidates selected/i);
      expect(response.body.code).toBe('NO_CANDIDATES_SELECTED');
    });
  });
});
