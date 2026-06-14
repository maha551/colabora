/**
 * Test Data Factory
 * Factory functions to create consistent test data
 */

const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

/**
 * Create a user data object
 * @param {Object} overrides - Override default values
 * @returns {Object} User data object
 */
function createUserData(overrides = {}) {
  return {
    id: overrides.id || uuidv4(),
    name: overrides.name || `Test User ${Date.now()}`,
    email: overrides.email || `test${Date.now()}@example.com`,
    password: overrides.password || 'TestPass123!',
    role: overrides.role || 'user',
    ...overrides
  };
}

/**
 * Create an admin user data object
 * @param {Object} overrides - Override default values
 * @returns {Object} Admin user data object
 */
function createAdminUserData(overrides = {}) {
  return createUserData({
    role: 'admin',
    email: overrides.email || `admin${Date.now()}@example.com`,
    ...overrides
  });
}

/**
 * Create a document data object
 * @param {Object} overrides - Override default values
 * @returns {Object} Document data object
 */
function createDocumentData(overrides = {}) {
  return {
    title: overrides.title || `Test Document ${Date.now()}`,
    description: overrides.description || 'Test document description',
    ownershipType: overrides.ownershipType || 'personal',
    organizationId: overrides.organizationId || null,
    options: {
      acceptanceThreshold: 75,
      votingAnonymous: false,
      voteChangeAllowed: true,
      structureProposalsEnabled: true,
      ...overrides.options
    },
    ...overrides
  };
}

/**
 * Create an organizational document data object
 * @param {string} organizationId - Organization ID
 * @param {Object} overrides - Override default values
 * @returns {Object} Organizational document data object
 */
function createOrganizationalDocumentData(organizationId, overrides = {}) {
  return createDocumentData({
    ownershipType: 'organizational',
    organizationId,
    ...overrides
  });
}

/**
 * Create an organization data object
 * @param {Object} overrides - Override default values
 * @returns {Object} Organization data object
 */
function createOrganizationData(overrides = {}) {
  return {
    name: overrides.name || `Test Organization ${Date.now()}`,
    description: overrides.description || 'Test organization description',
    representatives: overrides.representatives || [],
    membershipPolicy: overrides.membershipPolicy || 'invitation',
    votingThreshold: overrides.votingThreshold || 0.5,
    ...overrides
  };
}

/**
 * Create a paragraph data object
 * @param {Object} overrides - Override default values
 * @returns {Object} Paragraph data object
 */
function createParagraphData(overrides = {}) {
  return {
    text: overrides.text || `Test paragraph text ${Date.now()}`,
    order_index: overrides.order_index || 1,
    ...overrides
  };
}

/**
 * Create a proposal data object
 * @param {Object} overrides - Override default values
 * @returns {Object} Proposal data object
 */
function createProposalData(overrides = {}) {
  return {
    text: overrides.text || `Test proposal text ${Date.now()}`,
    type: overrides.type || 'BODY',
    ...overrides
  };
}

/**
 * Create a comment data object
 * @param {Object} overrides - Override default values
 * @returns {Object} Comment data object
 */
function createCommentData(overrides = {}) {
  return {
    text: overrides.text || `Test comment text ${Date.now()}`,
    parentId: overrides.parentId || null,
    ...overrides
  };
}

/**
 * Create a vote data object
 * @param {Object} overrides - Override default values
 * @returns {Object} Vote data object
 */
function createVoteData(overrides = {}) {
  return {
    vote: overrides.vote || 'PRO',
    ...overrides
  };
}

/**
 * Create governance rules data object
 * @param {Object} overrides - Override default values
 * @returns {Object} Governance rules data object
 */
function createGovernanceRulesData(overrides = {}) {
  return {
    representativeTermMonths: 12,
    electionVotingMethod: 'simple_majority',
    electionQuorumPercentage: 0.5,
    electionNoticeDays: 14,
    defaultVotingDeadlineHours: 168,
    defaultQuorumPercentage: 0.5,
    documentProposalPeriodDays: 365,
    anonymousVotingEnabled: true,
    voteChangeAllowed: false,
    representativeCanCreateVotes: true,
    representativeCanInviteMembers: true,
    representativeCanManageDocuments: true,
    representativeApprovalRequired: true,
    tamperProofEnabled: true,
    auditTrailEnabled: true,
    ...overrides
  };
}

/**
 * Create demo users array
 * @returns {Array<Object>} Array of demo user data
 */
function createDemoUsers() {
  return [
    {
      id: 'cmgxlfj9z0000orjgnfy3revt',
      name: 'Alice Johnson',
      email: 'alice@example.com',
      password: 'SecurePass123!',
      role: 'user'
    },
    {
      id: 'cmgxlfj9z0000orjgnfy3revu',
      name: 'Bob Smith',
      email: 'bob@example.com',
      password: 'SecurePass123!',
      role: 'user'
    },
    {
      id: 'cmgxlfj9z0000orjgnfy3revv',
      name: 'Charlie Brown',
      email: 'charlie@example.com',
      password: 'SecurePass123!',
      role: 'user'
    },
    {
      id: 'cmgxlfj9z0000orjgnfy3revw',
      name: 'Diana Prince',
      email: 'diana@example.com',
      password: 'SecurePass123!',
      role: 'admin'
    }
  ];
}

/**
 * Create a test scenario with multiple related entities
 * @param {Object} options - Scenario options
 * @returns {Object} Scenario data
 */
function createTestScenario(options = {}) {
  const scenario = {
    users: [],
    organizations: [],
    documents: [],
    paragraphs: [],
    proposals: [],
    ...options
  };
  
  return scenario;
}

module.exports = {
  createUserData,
  createAdminUserData,
  createDocumentData,
  createOrganizationalDocumentData,
  createOrganizationData,
  createParagraphData,
  createProposalData,
  createCommentData,
  createVoteData,
  createGovernanceRulesData,
  createDemoUsers,
  createTestScenario
};

