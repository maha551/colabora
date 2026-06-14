/**
 * Test Helper Utilities
 * Common functions for test operations
 */

const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { safeDeleteDatabase } = require('./db-cleanup');

function isKnexDb(db) {
  return !!db && typeof db === 'function' && !!db.client;
}

/**
 * Knex pool used by the running test server. Use this for createTestUser/seed data
 * that must be visible to API routes — not a standalone getTestKnex() instance alone.
 * @param {Object} server - Bootstrap server from startApplication/startTestServer
 * @returns {Object} Knex instance
 */
function getServerDb(server) {
  const db = server?.app?.locals?.db;
  if (!isKnexDb(db)) {
    throw new Error('getServerDb requires a bootstrap test server with app.locals.db');
  }
  return db;
}

/**
 * Remove structure-proposal rows via the same pool the API uses.
 * Use in integration tests that share a document across examples.
 */
async function clearStructureProposalTables(dbConn) {
  if (!isKnexDb(dbConn)) {
    throw new Error('clearStructureProposalTables requires a Knex instance');
  }
  await dbConn('structure_proposal_votes').del();
  await dbConn('structure_operations').del();
  await dbConn('document_structure_versions').whereNotNull('related_proposal_id').del();
  await dbConn('structure_proposals').del();
}

/**
 * Authenticate a user and return token
 * @param {Object} server - Express server instance
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<string>} Authentication token
 */
async function authenticateUser(server, email, password) {
  const response = await request(server)
    .post('/api/auth/login')
    .send({ email, password });
  
  if (response.status !== 200) {
    throw new Error(`Authentication failed: ${response.body.error || response.status}`);
  }
  
  return response.body.token;
}

/**
 * Create a test user in the database
 * @param {Object} db - Database instance
 * @param {Object} userData - User data (name, email, password, role?)
 * @returns {Promise<Object>} Created user
 */
async function createTestUser(db, userData = {}) {
  const userId = userData.id || uuidv4();
  const name = userData.name || `Test User ${Date.now()}`;
  const email = userData.email || `test${Date.now()}@example.com`;
  const password = userData.password || 'TestPass123!';
  const role = userData.role || 'user';
  
  const hashedPassword = await bcrypt.hash(password, 10);
  
  if (isKnexDb(db)) {
    await db('users').insert({
      id: userId,
      name,
      email,
      password_hash: hashedPassword,
      role,
      created_at: db.fn.now()
    });
    return { id: userId, name, email, password, role };
  }
  throw new Error('createTestUser requires a Knex database instance');
}

/**
 * Create a test document
 * @param {Object} server - Express server instance
 * @param {string} authToken - Authentication token
 * @param {Object} documentData - Document data
 * @returns {Promise<Object>} Created document
 */
async function createTestDocument(server, authToken, documentData = {}) {
  if (isKnexDb(server)) {
    const db = server;
    const ownerId = authToken;
    const docId = documentData.id || uuidv4();
    const title = documentData.title || `Test Document ${Date.now()}`;
    const ownershipType = documentData.ownershipType || 'personal';
    await db('documents').insert({
      id: docId,
      title,
      description: documentData.description || null,
      owner_id: ownerId,
      ownership_type: ownershipType,
      status: documentData.status || 'draft',
      // Match the API's personal-document defaults so direct-insert test docs
      // behave like API-created ones (structure proposals + vote changes enabled).
      structure_proposals_enabled: documentData.structureProposalsEnabled !== undefined ? documentData.structureProposalsEnabled : true,
      vote_change_allowed: documentData.voteChangeAllowed !== undefined ? documentData.voteChangeAllowed : true,
      created_at: db.fn.now(),
      updated_at: db.fn.now()
    });
    return {
      id: docId,
      title,
      description: documentData.description || null,
      owner_id: ownerId,
      ownership_type: ownershipType
    };
  }

  const docData = {
    title: documentData.title || `Test Document ${Date.now()}`,
    description: documentData.description,
    ownershipType: documentData.ownershipType || 'personal',
    organizationId: documentData.organizationId,
    ...documentData
  };
  
  const response = await request(server)
    .post('/api/documents')
    .set('Authorization', `Bearer ${authToken}`)
    .send(docData);
  
  if (response.status !== 201) {
    throw new Error(`Document creation failed: ${response.body.error || response.status}`);
  }
  
  return response.body.document;
}

/**
 * Create a test organization
 * @param {Object} server - Express server instance
 * @param {string} authToken - Admin authentication token
 * @param {Object} orgData - Organization data
 * @returns {Promise<Object>} Created organization
 */
async function createTestOrganization(server, authToken, orgData = {}) {
  const orgPayload = {
    name: orgData.name || `Test Organization ${Date.now()}`,
    description: orgData.description || 'Test organization description',
    representatives: orgData.representatives || [],
    membershipPolicy: orgData.membershipPolicy || 'invitation',
    votingThreshold: orgData.votingThreshold || 0.5,
    ...orgData
  };
  
  const response = await request(server)
    .post('/api/admin/organizations')
    .set('Authorization', `Bearer ${authToken}`)
    .send(orgPayload);
  
  if (response.status !== 201) {
    throw new Error(`Organization creation failed: ${response.body.error || response.status}`);
  }
  
  return response.body.organization;
}

/**
 * Next available paragraph order_index for a document (matches paragraphs route: MAX + 10).
 */
async function nextParagraphOrderIndex(db, documentId) {
  const row = await db('paragraphs')
    .where({ document_id: documentId })
    .max('order_index as max_order')
    .first();
  const maxOrder = row?.max_order;
  if (maxOrder == null || maxOrder === '') {
    return 0;
  }
  return Number(maxOrder) + 10;
}

/**
 * Create a test paragraph
 * @param {Object} server - Express server instance
 * @param {string} authToken - Authentication token
 * @param {string} documentId - Document ID
 * @param {Object} paragraphData - Paragraph data
 * @returns {Promise<Object>} Created paragraph
 */
async function createTestParagraph(server, authToken, documentId, paragraphData = {}) {
  if (isKnexDb(server)) {
    const db = server;
    const docId = authToken;
    const paraData = documentId || {};
    const paragraphId = paraData.id || uuidv4();
    const orderIndex =
      paraData.order_index !== undefined && paraData.order_index !== null
        ? paraData.order_index
        : await nextParagraphOrderIndex(db, docId);
    const paragraphText = paraData.text || `Test paragraph text ${Date.now()}`;
    await db('paragraphs').insert({
      id: paragraphId,
      document_id: docId,
      title: paraData.title || null,
      heading_level: paraData.heading_level || null,
      text: paragraphText,
      order_index: orderIndex,
      created_at: db.fn.now(),
      updated_at: db.fn.now()
    });
    return {
      id: paragraphId,
      document_id: docId,
      text: paragraphText,
      order_index: orderIndex
    };
  }

  const paraData = {
    text: paragraphData.text || `Test paragraph text ${Date.now()}`,
    ...paragraphData,
  };
  if (paragraphData.order_index === undefined || paragraphData.order_index === null) {
    delete paraData.order_index;
  }

  const response = await request(server)
    .post(`/api/documents/${documentId}/paragraphs`)
    .set('Authorization', `Bearer ${authToken}`)
    .send(paraData);
  
  if (response.status !== 201) {
    throw new Error(`Paragraph creation failed: ${response.body.error || response.status}`);
  }
  
  return response.body.paragraph;
}

/**
 * Create a test meeting in an organization
 * @param {Object} server - Express server instance
 * @param {string} authToken - Member authentication token
 * @param {string} organizationId - Organization ID
 * @param {Object} meetingData - Meeting data
 * @returns {Promise<Object>} Created meeting
 */
async function createTestMeeting(server, authToken, organizationId, meetingData = {}) {
  const payload = {
    title: meetingData.title || `Test Meeting ${Date.now()}`,
    scheduled_at: meetingData.scheduled_at || meetingData.scheduledAt || new Date().toISOString(),
    location: meetingData.location,
    ...meetingData,
  };

  const response = await request(server)
    .post(`/api/organizations/${organizationId}/meetings`)
    .set('Authorization', `Bearer ${authToken}`)
    .send(payload);

  if (response.status !== 201) {
    throw new Error(`Meeting creation failed: ${response.body.error || response.status}`);
  }

  return response.body;
}

/**
 * Create a test proposal
 * @param {Object} server - Express server instance
 * @param {string} authToken - Authentication token
 * @param {string} documentId - Document ID
 * @param {string} paragraphId - Paragraph ID
 * @param {Object} proposalData - Proposal data
 * @returns {Promise<Object>} Created proposal
 */
async function createTestProposal(server, authToken, documentId, paragraphId, proposalData = {}) {
  const propData = {
    text: proposalData.text || `Test proposal text ${Date.now()}`,
    type: proposalData.type || 'BODY',
    ...proposalData
  };
  
  const response = await request(server)
    .post(`/api/documents/${documentId}/paragraphs/${paragraphId}/proposals`)
    .set('Authorization', `Bearer ${authToken}`)
    .send(propData);
  
  if (response.status !== 201) {
    throw new Error(`Proposal creation failed: ${response.body.error || response.status}`);
  }
  
  return response.body.proposal;
}

/**
 * Clean up test data from database
 * @param {Object} db - Database instance
 * @param {Array<string>} tableNames - Table names to clean
 */
async function cleanupTestData(db, tableNames = []) {
  const defaultTables = [
    'document_collaborators',
    'comments',
    'votes',
    'proposals',
    'paragraphs',
    'documents',
    'organization_members',
    'organization_invitations',
    'organizations',
    'users'
  ];
  
  const tables = tableNames.length > 0 ? tableNames : defaultTables;
  
  for (const table of tables) {
    try {
      if (!isKnexDb(db)) {
        throw new Error('cleanupTestData requires a Knex database instance');
      }
      await db(table).del();
    } catch (error) {
      console.warn(`Error cleaning up ${table}:`, error.message);
    }
  }
}

/**
 * Wait for a condition to be true
 * @param {Function} condition - Function that returns boolean
 * @param {number} timeout - Timeout in milliseconds
 * @param {number} interval - Check interval in milliseconds
 * @returns {Promise<void>}
 */
async function waitFor(condition, timeout = 5000, interval = 100) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Add a delay between test suite initializations to prevent resource conflicts
 * @param {number} ms - Delay in milliseconds (default: 300)
 * @returns {Promise<void>}
 */
async function testSuiteDelay(ms = 300) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a random email for testing
 * @returns {string} Random email
 */
function generateTestEmail() {
  return `test${Date.now()}${Math.random().toString(36).substring(7)}@example.com`;
}

/**
 * Generate a random string for testing
 * @param {number} length - String length
 * @returns {string} Random string
 */
function generateRandomString(length = 10) {
  return Math.random().toString(36).substring(2, 2 + length);
}

/**
 * Safely delete a test database file
 * @param {string} dbPath - Path to database file
 * @param {Object} options - Cleanup options (dbConnection, dbManager, etc.)
 * @returns {Promise<void>}
 */
async function safeDeleteTestDatabase(dbPath, options = {}) {
  return safeDeleteDatabase(dbPath, options);
}

const DEFAULT_TERMS_VERSION = process.env.TERMS_VERSION || '2026-06-11';
const DEFAULT_PRIVACY_VERSION = process.env.PRIVACY_VERSION || '2026-06-11';

/**
 * Attach required legal consent fields for registration API tests.
 * @param {Object} userData
 * @returns {Object}
 */
function withLegalConsent(userData = {}) {
  return {
    ...userData,
    acceptedTerms: true,
    termsVersion: DEFAULT_TERMS_VERSION,
    privacyVersion: DEFAULT_PRIVACY_VERSION,
  };
}

/**
 * Seed an active organization member directly (test setup only — bypasses consent flow).
 */
async function seedActiveOrganizationMember(db, organizationId, userId, invitedByRepId = null) {
  if (!isKnexDb(db)) {
    throw new Error('seedActiveOrganizationMember requires a Knex database instance');
  }
  const existing = await db('organization_members')
    .where({ organization_id: organizationId, user_id: userId })
    .first();
  if (existing) {
    if (existing.status !== 'active') {
      await db('organization_members')
        .where({ id: existing.id })
        .update({ status: 'active', joined_at: db.fn.now(), left_at: null });
    }
    return existing.id;
  }
  const membershipId = uuidv4();
  await db('organization_members').insert({
    id: membershipId,
    organization_id: organizationId,
    user_id: userId,
    invited_by_rep_id: invitedByRepId,
    status: 'active',
    joined_at: db.fn.now(),
  });
  return membershipId;
}

/**
 * Accept a pending organization invitation for a user (API-level consent flow in tests).
 */
async function acceptOrganizationInvitationForUser(server, organizationId, user) {
  const db = getServerDb(server);
  const invitation = await db('organization_invitations')
    .where({
      organization_id: organizationId,
      email: user.email,
      status: 'pending',
    })
    .orderBy('created_at', 'desc')
    .first();
  if (!invitation) {
    throw new Error(`No pending invitation found for ${user.email} in org ${organizationId}`);
  }
  const token = await authenticateUser(server, user.email, user.password);
  await request(server)
    .post(`/api/organizations/invitations/${invitation.invitation_token}/accept`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  return token;
}

/**
 * Accept a pending document collaborator invitation (API-level consent flow in tests).
 */
async function acceptDocumentCollaboratorInvitationForUser(server, documentId, user) {
  const db = getServerDb(server);
  const invitation = await db('document_invitations')
    .where({
      document_id: documentId,
      email: user.email.toLowerCase(),
      status: 'pending',
    })
    .orderBy('created_at', 'desc')
    .first();
  if (!invitation) {
    throw new Error(`No pending document invitation for ${user.email} on document ${documentId}`);
  }
  const token = await authenticateUser(server, user.email, user.password);
  await request(server)
    .post(`/api/documents/invitations/${invitation.invitation_token}/accept`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  return token;
}

/**
 * Send collaborator invitation and accept it so the user has document access.
 */
async function addActiveDocumentCollaboratorForTests(server, documentId, inviterToken, user) {
  const db = getServerDb(server);
  const existingCollaborator = await db('document_collaborators')
    .where({ document_id: documentId, user_id: user.id })
    .first();
  if (existingCollaborator) {
    return authenticateUser(server, user.email, user.password);
  }

  const pendingInvitation = await db('document_invitations')
    .where({
      document_id: documentId,
      email: user.email.toLowerCase(),
      status: 'pending',
    })
    .first();
  if (pendingInvitation) {
    return acceptDocumentCollaboratorInvitationForUser(server, documentId, user);
  }

  await request(server)
    .post(`/api/documents/${documentId}/collaborators`)
    .set('Authorization', `Bearer ${inviterToken}`)
    .send({ userId: user.id, email: user.email })
    .expect(201);
  return acceptDocumentCollaboratorInvitationForUser(server, documentId, user);
}

/**
 * Invite user to organization and accept invitation (API-level consent flow in tests).
 */
async function addActiveOrganizationMemberForTests(server, organizationId, inviterToken, user) {
  await request(server)
    .post(`/api/organizations/${organizationId}/members`)
    .set('Authorization', `Bearer ${inviterToken}`)
    .send({ userId: user.id, status: 'active' })
    .expect(200);
  return acceptOrganizationInvitationForUser(server, organizationId, user);
}

module.exports = {
  withLegalConsent,
  authenticateUser,
  getServerDb,
  clearStructureProposalTables,
  createTestUser,
  createTestDocument,
  createTestOrganization,
  createTestParagraph,
  createTestMeeting,
  createTestProposal,
  cleanupTestData,
  waitFor,
  generateTestEmail,
  generateRandomString,
  safeDeleteTestDatabase,
  testSuiteDelay,
  seedActiveOrganizationMember,
  acceptOrganizationInvitationForUser,
  acceptDocumentCollaboratorInvitationForUser,
  addActiveDocumentCollaboratorForTests,
  addActiveOrganizationMemberForTests,
};

