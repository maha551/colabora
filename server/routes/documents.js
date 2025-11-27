const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { metricsCollector } = require('../middleware/monitoring');
const { documentValidation } = require('../middleware/validation');
const { requireAuth, requireDocumentAccess } = require('../middleware/auth');
const webSocketManager = require('../modules/websocket');
const { logger } = require('../middleware/logger');

// Configuration constants
const DOCUMENT_CONFIG = {
  MAX_DEPTH: 10, // Maximum depth for document hierarchy
  DEFAULT_PROPOSAL_PERIOD_DAYS: 30,
  MIN_ACCEPTANCE_THRESHOLD: 1,
  MAX_ACCEPTANCE_THRESHOLD: 100,
  DEFAULT_ACCEPTANCE_THRESHOLD: 75
};

// Error codes and structured logging
const ERROR_CODES = {
  // Document creation errors
  DOC_TITLE_REQUIRED: 'Document title is required and cannot be empty',
  DOC_TITLE_TOO_LONG: 'Document title cannot exceed 200 characters',
  DOC_DESCRIPTION_INVALID: 'Document description must be a string',
  DOC_DESCRIPTION_TOO_LONG: 'Document description cannot exceed 1000 characters',
  DOC_THRESHOLD_INVALID: 'Acceptance threshold must be between 1 and 100',
  DOC_OPTION_INVALID_TYPE: 'Document option has invalid type',
  DOC_OWNERSHIP_TYPE_INVALID: 'Invalid ownership type',
  DOC_ORG_ID_REQUIRED: 'Organization ID required for organizational documents',
  DOC_ORG_ID_NOT_ALLOWED: 'Organization ID not allowed for non-organizational documents',
  DOC_SHARED_CREATORS_INVALID: 'Shared documents require at least 2 creators',
  DOC_CREATOR_IDS_DUPLICATE: 'Creator IDs must be unique',

  // Parent validation errors
  DOC_PARENT_NOT_FOUND: 'Parent document not found',
  DOC_PARENT_OWNERSHIP_MISMATCH: 'Parent document ownership type mismatch',
  DOC_PARENT_NOT_ORGANIZATIONAL: 'Parent document must be organizational',
  DOC_PARENT_ORGANIZATION_MISMATCH: 'Parent document belongs to different organization',
  DOC_PARENT_ACCESS_DENIED: 'Access denied to parent document',
  DOC_CIRCULAR_REFERENCE: 'Circular reference detected in document hierarchy',
  DOC_MAX_DEPTH_EXCEEDED: 'Document hierarchy depth exceeds maximum allowed',

  // Runtime errors
  DOC_CREATION_FAILED: 'Document creation failed',
  DOC_DB_ERROR: 'Database error during document creation',
  DOC_PARAGRAPH_ERROR: 'Failed to create document title paragraph',
  DOC_COLLABORATOR_ERROR: 'Failed to add document collaborators',
  DOC_USER_ERROR: 'User account error during document creation',
};

// Structured logging helper
function logDocumentEvent(level, event, data = {}) {
  const logEntry = {
    event,
    service: 'document-service',
    ...data
  };

  logger.log(level, event, logEntry);
}

// Error logging helper
function logDocumentError(errorCode, message, context = {}) {
  logDocumentEvent('error', 'document_error', {
    errorCode,
    message,
    ...context
  });
}

// Success logging helper
function logDocumentSuccess(event, context = {}) {
  logDocumentEvent('info', event, context);
}

const router = express.Router();

// Helper function to check if user is representative of organization
async function isRepresentative(db, userId, organizationId) {
  if (!organizationId) return false;
  return new Promise((resolve, reject) => {
    db.get('SELECT representatives FROM organizations WHERE id = ?', [organizationId], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve(false);
      try {
        const representatives = JSON.parse(row.representatives || '[]');
        resolve(representatives.includes(userId));
      } catch (e) {
        resolve(false);
      }
    });
  });
}

// Helper function to validate parent document comprehensively
async function validateParentDocument(db, parentId, ownershipType, organizationId, userId) {
  logDocumentEvent('info', 'parent_validation_started', {
    parentId,
    ownershipType,
    organizationId,
    userId
  });

  if (!parentId) {
    return { valid: true };
  }

  // Check if parent document exists
  const parentDoc = await new Promise((resolve, reject) => {
    db.get(`
      SELECT id, title, organization_id, ownership_type, parent_id, owner_id
      FROM documents
      WHERE id = ?
    `, [parentId], (err, row) => {
      if (err) {
        logDocumentError('DOC_DB_ERROR', 'Database error fetching parent document', { parentId, error: err.message });
        reject(err);
      } else {
        resolve(row);
      }
    });
  });

  if (!parentDoc) {
    logDocumentError('DOC_PARENT_NOT_FOUND', 'Parent document not found', { parentId });
    return {
      valid: false,
      error: 'DOC_PARENT_NOT_FOUND',
      message: ERROR_CODES.DOC_PARENT_NOT_FOUND,
      statusCode: 400
    };
  }

  // Validate ownership type compatibility
  if (parentDoc.ownership_type !== ownershipType) {
    logDocumentError('DOC_PARENT_OWNERSHIP_MISMATCH', 'Parent ownership type mismatch', {
      parentId,
      parentOwnershipType: parentDoc.ownership_type,
      childOwnershipType: ownershipType
    });
    return {
      valid: false,
      error: 'DOC_PARENT_OWNERSHIP_MISMATCH',
      message: `Parent document must have the same ownership type (${ownershipType}), but parent has ${parentDoc.ownership_type}`,
      statusCode: 400
    };
  }

  // For organizational documents, ensure parent belongs to the same organization
  if (ownershipType === 'organizational') {
    if (!parentDoc.organization_id) {
      logDocumentError('DOC_PARENT_NOT_ORGANIZATIONAL', 'Parent document not organizational', {
        parentId,
        parentOwnershipType: parentDoc.ownership_type
      });
      return {
        valid: false,
        error: 'DOC_PARENT_NOT_ORGANIZATIONAL',
        message: ERROR_CODES.DOC_PARENT_NOT_ORGANIZATIONAL,
        statusCode: 400
      };
    }

    if (parentDoc.organization_id !== organizationId) {
      logDocumentError('DOC_PARENT_ORGANIZATION_MISMATCH', 'Parent organization mismatch', {
        parentId,
        parentOrganizationId: parentDoc.organization_id,
        childOrganizationId: organizationId
      });
      return {
        valid: false,
        error: 'DOC_PARENT_ORGANIZATION_MISMATCH',
        message: ERROR_CODES.DOC_PARENT_ORGANIZATION_MISMATCH,
        statusCode: 400
      };
    }

    // Check if user has access to the parent organization document
    const hasAccess = await new Promise((resolve, reject) => {
      db.get(`
        SELECT om.status
        FROM organization_members om
        WHERE om.organization_id = ? AND om.user_id = ? AND om.status = 'active'
      `, [organizationId, userId], (err, member) => {
        if (err) {
          logDocumentError('DOC_DB_ERROR', 'Database error checking organization membership', {
            organizationId,
            userId,
            error: err.message
          });
          reject(err);
        } else {
          resolve(!!member);
        }
      });
    });

    if (!hasAccess) {
      logDocumentError('DOC_PARENT_ACCESS_DENIED', 'User lacks access to parent organization', {
        parentId,
        organizationId,
        userId
      });
      return {
        valid: false,
        error: 'DOC_PARENT_ACCESS_DENIED',
        message: ERROR_CODES.DOC_PARENT_ACCESS_DENIED,
        statusCode: 403
      };
    }
  } else {
    // For personal/shared documents, check ownership/collaboration access
    const hasAccess = await new Promise((resolve, reject) => {
      db.get(`
        SELECT d.id
        FROM documents d
        LEFT JOIN document_collaborators dc ON d.id = dc.document_id
        WHERE d.id = ? AND (d.owner_id = ? OR dc.user_id = ?)
      `, [parentId, userId, userId], (err, doc) => {
        if (err) {
          logDocumentError('DOC_DB_ERROR', 'Database error checking parent access', {
            parentId,
            userId,
            error: err.message
          });
          reject(err);
        } else {
          resolve(!!doc);
        }
      });
    });

    if (!hasAccess) {
      logDocumentError('DOC_PARENT_ACCESS_DENIED', 'User lacks access to parent document', {
        parentId,
        userId
      });
      return {
        valid: false,
        error: 'DOC_PARENT_ACCESS_DENIED',
        message: ERROR_CODES.DOC_PARENT_ACCESS_DENIED,
        statusCode: 403
      };
    }
  }

  // Check for circular references and depth limits
  const hierarchyCheck = await checkDocumentHierarchy(db, parentId, DOCUMENT_CONFIG.MAX_DEPTH);
  if (!hierarchyCheck.valid) {
    logDocumentError(hierarchyCheck.error, hierarchyCheck.message, {
      parentId,
      maxDepth: DOCUMENT_CONFIG.MAX_DEPTH
    });
    return hierarchyCheck;
  }

  logDocumentSuccess('parent_validation_success', { parentId, ownershipType });
  return { valid: true, parentDoc };
}

// Helper function to check document hierarchy for circular references and depth limits
async function checkDocumentHierarchy(db, documentId, maxDepth, visited = new Set()) {
  if (visited.has(documentId)) {
    return {
      valid: false,
      error: 'DOC_CIRCULAR_REFERENCE',
      message: 'Circular reference detected in document hierarchy',
      statusCode: 400
    };
  }

  if (visited.size >= maxDepth) {
    return {
      valid: false,
      error: 'DOC_MAX_DEPTH_EXCEEDED',
      message: `Document hierarchy depth exceeds maximum allowed (${maxDepth})`,
      statusCode: 400
    };
  }

  visited.add(documentId);

  const parentDoc = await new Promise((resolve, reject) => {
    db.get('SELECT parent_id FROM documents WHERE id = ?', [documentId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

  if (parentDoc && parentDoc.parent_id) {
    return checkDocumentHierarchy(db, parentDoc.parent_id, maxDepth, visited);
  }

  return { valid: true };
}

// Helper function for safe transaction management
async function withTransaction(db, operation) {
  let transactionStarted = false;

  try {
    // Disable foreign key constraints BEFORE starting transaction
    await new Promise((resolve, reject) => {
      db.run('PRAGMA foreign_keys = OFF', (err) => {
        if (err) {
          logger.error('Failed to disable foreign keys', { error: err.message });
          reject(err);
        } else {
          logger.debug('Foreign key constraints disabled');
          resolve();
        }
      });
    });

    logger.debug('Starting transaction');
    await new Promise((resolve, reject) => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          logger.error('Failed to begin transaction', { error: err.message });
          reject(err);
        } else {
          transactionStarted = true;
          logger.debug('Transaction started successfully');
          resolve();
        }
      });
    });

    const result = await operation();

    logger.debug('Committing transaction');
    await new Promise((resolve, reject) => {
      db.run('COMMIT', (err) => {
        if (err) {
          logger.error('Failed to commit transaction', { error: err.message });
          reject(err);
        } else {
          logger.debug('Transaction committed successfully');
          resolve();
        }
      });
    });

    // Re-enable foreign key constraints
    await new Promise((resolve, reject) => {
      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) {
          logger.error('Failed to re-enable foreign keys', { error: err.message });
        } else {
          logger.debug('Foreign key constraints re-enabled');
        }
        // Don't reject here since transaction is already committed
        resolve();
      });
    });

    return result;

  } catch (error) {
    logger.error('Transaction operation failed', { error: error.message, stack: error.stack });

    if (transactionStarted) {
      logger.debug('Rolling back transaction');
      try {
        await new Promise((resolve) => {
          db.run('ROLLBACK', (err) => {
            if (err) {
              logger.error('Rollback failed', { error: err.message });
            } else {
              logger.debug('Transaction rolled back successfully');
            }
            resolve(); // Always resolve to avoid blocking
          });
        });
      } catch (rollbackError) {
        logger.error('Critical: Rollback operation failed', { error: rollbackError.message, stack: rollbackError.stack });
      }

      // Re-enable foreign key constraints
      try {
        await new Promise((resolve) => {
          db.run('PRAGMA foreign_keys = ON', (err) => {
            if (err) {
              logger.error('Failed to re-enable foreign keys after rollback', { error: err.message });
            } else {
              logger.debug('Foreign key constraints re-enabled after rollback');
            }
            resolve();
          });
        });
      } catch (fkError) {
        logger.error('Critical: Failed to re-enable foreign keys', { error: fkError.message, stack: fkError.stack });
      }
    }

    throw error;
  }
}

// Helper function to build document creation SQL and parameters
async function buildDocumentInsertSQL(db, ownershipType, organizationId, options, documentId, trimmedTitle, trimmedDescription, userId, parentId) {
  logger.debug('Building document INSERT SQL', { ownershipType, documentId });

  // Parse options with defaults
  const acceptanceThreshold = options?.acceptanceThreshold !== undefined
    ? Math.min(DOCUMENT_CONFIG.MAX_ACCEPTANCE_THRESHOLD, Math.max(DOCUMENT_CONFIG.MIN_ACCEPTANCE_THRESHOLD, parseFloat(options.acceptanceThreshold)))
    : DOCUMENT_CONFIG.DEFAULT_ACCEPTANCE_THRESHOLD;

  const votingAnonymous = options?.votingAnonymous === true ? 1 : 0;
  const votingAnonymityLocked = options?.votingAnonymityLocked === true ? 1 : 0;
  const voteChangeAllowed = options?.voteChangeAllowed !== false ? 1 : 0;
  const structureProposalsEnabled = options?.structureProposalsEnabled === true ? 1 : 0;

  let sql, params;

  if (ownershipType === 'shared') {
    // For shared documents, store creator IDs as JSON
    sql = `
      INSERT INTO documents (
        id, title, description, owner_id, ownership_type, creator_ids, organization_id, parent_id,
        acceptance_threshold, voting_anonymous, voting_anonymity_locked, vote_change_allowed,
        structure_proposals_enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    params = [
      documentId, trimmedTitle, trimmedDescription, userId, ownershipType, JSON.stringify(options?.creatorIds || []), null, parentId || null,
      acceptanceThreshold, votingAnonymous, votingAnonymityLocked, voteChangeAllowed, structureProposalsEnabled
    ];
  } else if (ownershipType === 'organizational') {
    logger.debug('Building organizational document SQL', { organizationId, documentId });
    
    // Fetch governance rules to apply defaults if options not provided
    let governanceRules = null;
    try {
      const governanceModule = require('./governance');
      governanceRules = await governanceModule.getGovernanceRules(db, organizationId);
    } catch (govErr) {
      logger.warn('Could not fetch governance rules, using defaults', { error: govErr.message, organizationId });
    }
    
    // For organizational documents, always use governance rules (no overrides allowed)
    // This ensures consistency across all organizational documents
    const finalAcceptanceThreshold = governanceRules?.defaultAcceptanceThreshold || DOCUMENT_CONFIG.DEFAULT_ACCEPTANCE_THRESHOLD;
    const finalVotingAnonymous = governanceRules?.anonymousVotingEnabled ? 1 : 0;
    const finalVoteChangeAllowed = governanceRules?.voteChangeAllowed ? 1 : 0;
    
    // Use governance rule for proposal period, or default
    const proposalPeriodDays = governanceRules?.documentProposalPeriodDays || DOCUMENT_CONFIG.DEFAULT_PROPOSAL_PERIOD_DAYS;
    
    // For organizational documents, set organization_id and start as proposal
    const proposalDeadline = new Date();
    proposalDeadline.setDate(proposalDeadline.getDate() + proposalPeriodDays);
    logger.debug('Proposal deadline calculated', { deadline: proposalDeadline.toISOString(), days: proposalPeriodDays });

    // Ensure proposalDeadline is valid
    if (isNaN(proposalDeadline.getTime())) {
      throw new Error('Failed to generate valid proposal deadline');
    }

    // Calculate paragraph_proposals_cutoff (7 days before proposal deadline by default)
    const cutoffDays = 7;
    const paragraphProposalsCutoff = new Date(proposalDeadline);
    paragraphProposalsCutoff.setDate(paragraphProposalsCutoff.getDate() - cutoffDays);

    // Calculate min_voters_required based on organization size and governance rules
    let minVotersRequired = 0;
    try {
      // Get organization member count
      const memberCount = await new Promise((resolve, reject) => {
        db.get(`SELECT COUNT(*) as count FROM organization_members WHERE organization_id = ? AND status = 'active'`, 
          [organizationId], (err, row) => {
            if (err) reject(err);
            else resolve(row?.count || 0);
          });
      });
      // Use governance rule defaultQuorumPercentage if available, otherwise default to 30%
      const quorumPercentage = governanceRules?.defaultQuorumPercentage || 0.3;
      // Set to quorum percentage of members, minimum 1
      minVotersRequired = Math.max(1, Math.ceil(memberCount * quorumPercentage));
      logger.debug('Calculated min_voters_required', { minVotersRequired, quorumPercentage: quorumPercentage * 100, memberCount });
    } catch (error) {
      logger.warn('Could not calculate min_voters_required, using 0', { error: error.message, organizationId });
      minVotersRequired = 0;
    }

    sql = `
      INSERT INTO documents (
        id, title, description, owner_id, ownership_type, creator_ids, organization_id, parent_id, status, proposal_deadline,
        paragraph_proposals_cutoff, acceptance_threshold, voting_anonymous, voting_anonymity_locked, vote_change_allowed,
        structure_proposals_enabled, min_voters_required, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    // Ensure finalAcceptanceThreshold is valid (already calculated above from governance rules)
    const validatedAcceptanceThreshold = (typeof finalAcceptanceThreshold === 'number' && !isNaN(finalAcceptanceThreshold))
      ? finalAcceptanceThreshold : DOCUMENT_CONFIG.DEFAULT_ACCEPTANCE_THRESHOLD;

    // For organizational documents, structure proposals are always enabled by default
    // This can be overridden by governance rules in the future if needed
    const finalStructureProposalsEnabled = structureProposalsEnabled; // Keep user preference if provided, but typically always enabled for org docs
    
    params = [
      documentId, trimmedTitle, trimmedDescription, userId, ownershipType, null, organizationId, parentId || null,
      'proposal', proposalDeadline.toISOString(), paragraphProposalsCutoff.toISOString(),
      validatedAcceptanceThreshold, finalVotingAnonymous, votingAnonymityLocked, finalVoteChangeAllowed, finalStructureProposalsEnabled,
      minVotersRequired
    ];
    logger.debug('Organizational SQL params built successfully', { documentId });
  } else {
    // For personal documents (default)
    sql = `
      INSERT INTO documents (
        id, title, description, owner_id, ownership_type, creator_ids, organization_id, parent_id,
        acceptance_threshold, voting_anonymous, voting_anonymity_locked, vote_change_allowed,
        structure_proposals_enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    params = [
      documentId, trimmedTitle, trimmedDescription, userId, ownershipType, null, null, parentId || null,
      acceptanceThreshold, votingAnonymous, votingAnonymityLocked, voteChangeAllowed, structureProposalsEnabled
    ];
  }

  // Return the final values used (for organizational docs, these may have been overridden by governance rules)
  const finalValues = ownershipType === 'organizational' 
    ? {
        acceptanceThreshold: validatedAcceptanceThreshold,
        votingAnonymous: finalVotingAnonymous,
        votingAnonymityLocked: votingAnonymityLocked,
        voteChangeAllowed: finalVoteChangeAllowed,
        structureProposalsEnabled: structureProposalsEnabled
      }
    : {
        acceptanceThreshold,
        votingAnonymous,
        votingAnonymityLocked,
        voteChangeAllowed,
        structureProposalsEnabled
      };
  
  return { sql, params, ...finalValues };
}

// Helper function to create initial title paragraph as a suggestion
async function createInitialParagraph(db, documentId, title, description, userId) {
  logger.debug('Creating initial title paragraph as suggestion', { documentId, title });

  // First check if document exists
  return new Promise((resolve, reject) => {
    const paragraphId = uuidv4();
    
    // Create empty paragraph (title will be a proposal/suggestion, not directly set)
    // Use order_index = 1 for the title paragraph (positive number, but we'll mark it as title via isDocumentTitle logic)
    // Set title = null and text = '' so it's empty until proposals are approved
    db.run(`
        INSERT INTO paragraphs (
          id, document_id, title, text, order_index, heading_level, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [paragraphId, documentId, null, '', 1, 'h1'], function(err) {
      if (err) {
        logger.error('Error creating title paragraph', { error: err.message, documentId, paragraphId });

        // If foreign key fails, let's check what documents exist
        db.all('SELECT id, title FROM documents LIMIT 10', [], (checkErr, rows) => {
          if (checkErr) {
            logger.error('Error checking documents', { error: checkErr.message });
          } else {
            logger.debug('Existing documents', { count: rows.length });
          }
          reject(new Error(`Failed to create title paragraph: ${err.message}`));
        });
      } else {
        logger.debug('Title paragraph created successfully', { paragraphId, documentId });
        
        // Create a TITLE proposal for the document title (as a suggestion that needs voting)
        const titleProposalId = uuidv4();
        db.run(`
          INSERT INTO proposals (id, paragraph_id, user_id, text, type, heading_level, created_at)
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [titleProposalId, paragraphId, userId, title, 'TITLE', 'h1'], function(titleProposalErr) {
          if (titleProposalErr) {
            logger.error('Error creating title proposal', { error: titleProposalErr.message, paragraphId, titleProposalId });
            reject(new Error(`Failed to create title proposal: ${titleProposalErr.message}`));
          } else {
            logger.debug('Title proposal created successfully', { titleProposalId, paragraphId });
            // Description is not added to the document - it's just metadata
            resolve(paragraphId);
          }
        });
      }
    });
  });
}

// Helper function to add collaborators sequentially
async function addCollaborators(db, documentId, ownershipType, organizationId, userId, creatorIds) {
  logger.debug('Adding collaborators for document', { documentId, ownershipType, organizationId });

  if (ownershipType === 'shared' && creatorIds) {
    // Add creators as collaborators (excluding document owner)
    const collaboratorsToAdd = creatorIds.filter(creatorId => creatorId !== userId);

    for (const creatorId of collaboratorsToAdd) {
      await new Promise((resolve, reject) => {
        const collabId = uuidv4();
        db.run(`
          INSERT INTO document_collaborators (id, document_id, user_id)
          VALUES (?, ?, ?)
        `, [collabId, documentId, creatorId], function(err) {
          if (err) {
            logger.error('Error adding collaborator', { error: err.message, creatorId, documentId });
            reject(new Error(`Failed to add collaborator ${creatorId}: ${err.message}`));
          } else {
            logger.debug('Added collaborator', { creatorId, documentId });
            resolve();
          }
        });
      });
    }
  } else if (ownershipType === 'organizational') {
    // Add all active organization members as collaborators (excluding document owner)
    const members = await new Promise((resolve, reject) => {
      db.all(`
        SELECT user_id FROM organization_members
        WHERE organization_id = ? AND status = 'active' AND user_id != ?
      `, [organizationId, userId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    for (const member of members) {
      await new Promise((resolve, reject) => {
        const collabId = uuidv4();
        db.run(`
          INSERT INTO document_collaborators (id, document_id, user_id)
          VALUES (?, ?, ?)
        `, [collabId, documentId, member.user_id], function(err) {
          if (err) {
            logger.error('Error adding organizational collaborator', { error: err.message, userId: member.user_id, documentId });
            reject(new Error(`Failed to add organizational collaborator ${member.user_id}: ${err.message}`));
          } else {
            logger.debug('Added organizational collaborator', { userId: member.user_id, documentId });
            resolve();
          }
        });
      });
    }

    logger.debug('Added organizational collaborators', { count: members.length, documentId });
  }

  logger.debug('Collaborator addition completed', { documentId });
}

// Helper function to build document response
async function buildDocumentResponse(db, documentId, trimmedTitle, trimmedDescription, userId, ownershipType, organizationId, parentId, options) {
  logger.debug('Building document response', { documentId, ownershipType });

  // Get user details for owner information
  const user = await new Promise((resolve, reject) => {
    db.get('SELECT name, email FROM users WHERE id = ?', [userId], (err, row) => {
      if (err) reject(err);
      else if (!row) reject(new Error('User not found'));
      else resolve(row);
    });
  });

  // Get document details including deadlines for organizational documents
  const docDetails = await new Promise((resolve, reject) => {
    db.get(`
      SELECT proposal_deadline, paragraph_proposals_cutoff, voting_deadline, 
             voting_started_at, min_voters_required, adopted_at, status
      FROM documents WHERE id = ?
    `, [documentId], (err, row) => {
      if (err) reject(err);
      else resolve(row || {});
    });
  });

  const result = {
    id: documentId,
    title: trimmedTitle,
    description: trimmedDescription,
    ownerId: userId,
    parentId: parentId || undefined,
    status: docDetails.status || (ownershipType === 'organizational' ? 'proposal' : 'draft'),
    owner: {
      id: userId,
      name: user.name,
      email: user.email
    },
    ownershipType,
    organizationId: ownershipType === 'organizational' ? organizationId : null,
    options,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Add deadlines for organizational documents
  if (ownershipType === 'organizational') {
    if (docDetails.proposal_deadline) result.proposalDeadline = docDetails.proposal_deadline;
    if (docDetails.paragraph_proposals_cutoff) result.paragraphProposalsCutoff = docDetails.paragraph_proposals_cutoff;
    if (docDetails.voting_deadline) result.votingDeadline = docDetails.voting_deadline;
    if (docDetails.voting_started_at) result.votingStartedAt = docDetails.voting_started_at;
    if (docDetails.min_voters_required) result.minVotersRequired = docDetails.min_voters_required;
    if (docDetails.adopted_at) result.adoptedAt = docDetails.adopted_at;
  }

  logger.debug('Document response built successfully', { documentId });
  return result;
}

// Helper function to validate document creation inputs
function validateDocumentInputs(title, description, options, ownershipType, organizationId, creatorIds) {
  logDocumentEvent('info', 'input_validation_started', {
    hasTitle: !!title,
    hasDescription: !!description,
    hasOptions: !!options,
    ownershipType,
    hasOrganizationId: !!organizationId,
    hasCreatorIds: !!creatorIds
  });

  const errors = [];

  // Title validation
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    errors.push({
      field: 'title',
      error: 'DOC_TITLE_REQUIRED',
      message: ERROR_CODES.DOC_TITLE_REQUIRED
    });
  } else if (title.trim().length > 200) {
    errors.push({
      field: 'title',
      error: 'DOC_TITLE_TOO_LONG',
      message: ERROR_CODES.DOC_TITLE_TOO_LONG
    });
  }

  // Description validation (optional)
  if (description && typeof description !== 'string') {
    errors.push({
      field: 'description',
      error: 'DOC_DESCRIPTION_INVALID',
      message: ERROR_CODES.DOC_DESCRIPTION_INVALID
    });
  } else if (description && description.length > 1000) {
    errors.push({
      field: 'description',
      error: 'DOC_DESCRIPTION_TOO_LONG',
      message: ERROR_CODES.DOC_DESCRIPTION_TOO_LONG
    });
  }

  // Options validation
  if (options) {
    // Acceptance threshold validation
    if (options.acceptanceThreshold !== undefined) {
      const threshold = Number(options.acceptanceThreshold);
      if (isNaN(threshold) || threshold < DOCUMENT_CONFIG.MIN_ACCEPTANCE_THRESHOLD || threshold > DOCUMENT_CONFIG.MAX_ACCEPTANCE_THRESHOLD) {
        errors.push({
          field: 'options.acceptanceThreshold',
          error: 'DOC_THRESHOLD_INVALID',
          message: ERROR_CODES.DOC_THRESHOLD_INVALID
        });
      }
    }

    // Boolean options validation
    const booleanOptions = ['votingAnonymous', 'votingAnonymityLocked', 'voteChangeAllowed', 'structureProposalsEnabled'];
    booleanOptions.forEach(option => {
      if (options[option] !== undefined && typeof options[option] !== 'boolean') {
        errors.push({
          field: `options.${option}`,
          error: 'DOC_OPTION_INVALID_TYPE',
          message: `${option} must be a boolean value`
        });
      }
    });
  }

  // Ownership type validation
  const validOwnershipTypes = ['personal', 'shared', 'organizational'];
  if (!validOwnershipTypes.includes(ownershipType)) {
    errors.push({
      field: 'ownershipType',
      error: 'DOC_OWNERSHIP_TYPE_INVALID',
      message: ERROR_CODES.DOC_OWNERSHIP_TYPE_INVALID
    });
  }

  // Organization ID validation for organizational documents
  if (ownershipType === 'organizational') {
    if (!organizationId) {
      errors.push({
        field: 'organizationId',
        error: 'DOC_ORG_ID_REQUIRED',
        message: ERROR_CODES.DOC_ORG_ID_REQUIRED
      });
    }
  } else if (organizationId) {
    errors.push({
      field: 'organizationId',
      error: 'DOC_ORG_ID_NOT_ALLOWED',
      message: ERROR_CODES.DOC_ORG_ID_NOT_ALLOWED
    });
  }

  // Creator IDs validation for shared documents
  if (ownershipType === 'shared') {
    if (!Array.isArray(creatorIds) || creatorIds.length < 2) {
      errors.push({
        field: 'creatorIds',
        error: 'DOC_SHARED_CREATORS_INVALID',
        message: ERROR_CODES.DOC_SHARED_CREATORS_INVALID
      });
    } else {
      // Check for duplicate creator IDs
      const uniqueCreators = [...new Set(creatorIds)];
      if (uniqueCreators.length !== creatorIds.length) {
        errors.push({
          field: 'creatorIds',
          error: 'DOC_CREATOR_IDS_DUPLICATE',
          message: ERROR_CODES.DOC_CREATOR_IDS_DUPLICATE
        });
      }
    }
  } else if (creatorIds) {
    errors.push({
      field: 'creatorIds',
      error: 'DOC_CREATOR_IDS_NOT_ALLOWED',
      message: ERROR_CODES.DOC_CREATOR_IDS_NOT_ALLOWED
    });
  }

  const validationResult = {
    valid: errors.length === 0,
    errors
  };

  logDocumentEvent('info', 'input_validation_completed', {
    errorsCount: errors.length,
    valid: validationResult.valid
  });

  if (errors.length > 0) {
    logDocumentError('DOC_VALIDATION_FAILED', `Input validation failed with ${errors.length} errors`, {
      errors: errors.map(e => ({ field: e.field, error: e.error }))
    });
  }

  return validationResult;
}

// Get all documents for current user (as owner or collaborator)
router.get('/', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const userId = req.user.id;

  const query = `
    SELECT DISTINCT d.*,
           u.name as owner_name,
           u.email as owner_email,
           o.name as organization_name
    FROM documents d
    LEFT JOIN document_collaborators dc ON d.id = dc.document_id
    LEFT JOIN organizations o ON d.organization_id = o.id
    LEFT JOIN organization_members om ON o.id = om.organization_id AND om.user_id = ? AND om.status = 'active'
    JOIN users u ON d.owner_id = u.id
    WHERE d.owner_id = ?
       OR dc.user_id = ?
       OR (d.ownership_type = 'organizational' AND om.user_id IS NOT NULL)
    ORDER BY d.updated_at DESC
  `;

  logger.debug('Executing documents query', { userId });

  // Execute main documents query first
  db.all(query, [userId, userId, userId], (err, documents) => {
    if (err) {
      logger.error('Error fetching documents', { error: err.message, userId });
      return res.status(500).json({ error: 'Failed to fetch documents' });
    }

    logger.debug('Found documents for user', { count: documents.length, userId });

    // Now we can use the documents to build other queries
    const documentIds = documents.map(doc => doc.id);
    const orgIds = [...new Set(documents.filter(doc => doc.organization_id).map(doc => doc.organization_id))];

    // Fetch all collaborators in batch
    let collabQuery, collabParams;
    if (documentIds.length > 0) {
      collabQuery = `
        SELECT
          dc.document_id,
          dc.id as collaborator_id,
          dc.user_id,
          dc.created_at,
          u.name as user_name,
          u.email as user_email
        FROM document_collaborators dc
        JOIN users u ON dc.user_id = u.id
        WHERE dc.document_id IN (${documentIds.map(() => '?').join(',')})
      `;
      collabParams = documentIds;
    }

    // Fetch organizational collaborators in batch
    let orgCollabQuery, orgCollabParams;
    if (orgIds.length > 0) {
      orgCollabQuery = `
        SELECT
          om.organization_id,
          u.id as user_id,
          u.name as user_name,
          u.email as user_email,
          'auto' as collaborator_type
        FROM organization_members om
        JOIN users u ON om.user_id = u.id
        WHERE om.organization_id IN (${orgIds.map(() => '?').join(',')}) AND om.status = 'active'
        ORDER BY u.name
      `;
      orgCollabParams = orgIds;
    }

    // Fetch stats for all documents in batch (only if we have documents)
    let statsQuery, statsParams = [];
    if (documentIds.length > 0) {
      statsQuery = `
        SELECT
          p.document_id,
          COUNT(DISTINCT p.id) as paragraph_count,
          COUNT(DISTINCT pr.id) as proposal_count
        FROM paragraphs p
        LEFT JOIN proposals pr ON p.id = pr.paragraph_id
        WHERE p.document_id IN (${documentIds.map(() => '?').join(',')})
        GROUP BY p.document_id
      `;
      statsParams = documentIds;
    }

    // Execute all queries in parallel
    const queryPromises = [];

    if (collabQuery) {
      queryPromises.push(new Promise((resolve, reject) => {
        db.all(collabQuery, collabParams, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      }));
    } else {
      queryPromises.push(Promise.resolve([]));
    }

    if (orgCollabQuery) {
      queryPromises.push(new Promise((resolve, reject) => {
        db.all(orgCollabQuery, orgCollabParams, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      }));
    } else {
      queryPromises.push(Promise.resolve([]));
    }

    if (statsQuery) {
      queryPromises.push(new Promise((resolve, reject) => {
        db.all(statsQuery, statsParams, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      }));
    } else {
      queryPromises.push(Promise.resolve([]));
    }

    Promise.all(queryPromises).then(([collaborators, orgCollaborators, stats]) => {
      // Process collaborators and build response
      const collabMap = new Map();
      const orgCollabMap = new Map();
      const statsMap = new Map();

      // Build collaborator maps
    collaborators.forEach(collab => {
      if (!collabMap.has(collab.document_id)) {
        collabMap.set(collab.document_id, []);
      }
      collabMap.get(collab.document_id).push({
                  id: collab.collaborator_id,
                  document_id: collab.document_id,
                  user_id: collab.user_id,
                  created_at: collab.created_at,
                  user: {
                    id: collab.user_id,
                    name: collab.user_name,
                    email: collab.user_email
                  }
      });
    });

    orgCollaborators.forEach(collab => {
      if (!orgCollabMap.has(collab.organization_id)) {
        orgCollabMap.set(collab.organization_id, []);
      }
      orgCollabMap.get(collab.organization_id).push({
        id: collab.user_id,
        user_id: collab.user_id,
        user: {
          id: collab.user_id,
          name: collab.user_name,
          email: collab.user_email
        },
        collaborator_type: 'auto'
      });
    });

    // Build stats map
    stats.forEach(stat => {
      statsMap.set(stat.document_id, {
        paragraphCount: stat.paragraph_count || 0,
        proposalCount: stat.proposal_count || 0
      });
    });

    // Process documents
    const processedDocuments = documents.map(doc => {
      const docStats = statsMap.get(doc.id) || { paragraphCount: 0, proposalCount: 0 };
      let docCollaborators = [];

      if (doc.ownership_type === 'organizational' && doc.organization_id) {
        docCollaborators = orgCollabMap.get(doc.organization_id) || [];
      } else {
        docCollaborators = collabMap.get(doc.id) || [];
      }

      // Create minimal paragraph objects for counting
      const paragraphs = Array.from({ length: docStats.paragraphCount }, (_, index) => ({
              id: `para-${doc.id}-${index}`,
        proposals: index === 0 ? Array.from({ length: docStats.proposalCount }, () => ({})) : []
            }));

      return {
              ...doc,
              title: doc.title, // Explicitly include title to ensure it's preserved
              parentId: doc.parent_id || undefined,
              status: doc.status || 'draft',
              proposalDeadline: doc.proposal_deadline || undefined,
              owner: {
                id: doc.owner_id,
                name: doc.owner_name,
                email: doc.owner_email
              },
        collaborators: docCollaborators,
              paragraphs: paragraphs,
              organization: doc.organization_id ? {
                id: doc.organization_id,
                name: doc.organization_name
              } : undefined,
              options: {
                acceptanceThreshold: doc.acceptance_threshold || 75.0,
                votingAnonymous: doc.voting_anonymous === 1,
                structureProposalsEnabled: doc.structure_proposals_enabled === 1,
                votingAnonymityLocked: doc.voting_anonymity_locked === 1,
                voteChangeAllowed: doc.vote_change_allowed === 1
              }
      };
            });

      res.json({ documents: processedDocuments });
    }).catch(err => {
      logger.error('Error fetching document data', { error: err.message, stack: err.stack });
      return res.status(500).json({ error: 'Failed to fetch documents' });
    });
  });
});


// Get all documents owned by a specific organization
router.get('/organization/:organizationId', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = req.user.id;

  // First check if user is a member of the organization
  const membershipQuery = `
    SELECT om.status, o.is_active
    FROM organization_members om
    JOIN organizations o ON om.organization_id = o.id
    WHERE om.organization_id = ? AND om.user_id = ? AND om.status = 'active' AND o.is_active = 1
  `;

  db.get(membershipQuery, [organizationId, userId], (err, membership) => {
    if (err) {
      logger.error('Error checking organization membership', { error: err.message, organizationId, userId });
      return res.status(500).json({ error: 'Failed to verify organization access' });
    }

    if (!membership) {
      return res.status(403).json({ error: 'Access denied: not a member of this organization' });
    }

    // Get all organizational documents
    const documentsQuery = `
      SELECT d.*,
             u.name as owner_name,
             u.email as owner_email,
             o.name as organization_name
      FROM documents d
      JOIN users u ON d.owner_id = u.id
      JOIN organizations o ON d.organization_id = o.id
      WHERE d.ownership_type = 'organizational'
        AND d.organization_id = ?
        AND o.is_active = 1
      ORDER BY d.parent_id NULLS FIRST, d.created_at ASC
    `;

    db.all(documentsQuery, [organizationId], (err, documents) => {
      if (err) {
        logger.error('Error fetching organization documents', { error: err.message, organizationId });
        return res.status(500).json({
          error: 'Failed to fetch organization documents',
          details: err.message
        });
      }

      logger.debug('Found organization documents', { count: documents ? documents.length : 0, organizationId });

      // Process documents with collaborators (for organizational docs, all org members are auto-collaborators)
      const documentsWithCollaborators = documents.map(doc => {
        return new Promise((resolve) => {
          if (doc.ownership_type === 'organizational') {
            // For organizational documents, all active organization members are automatically collaborators
            db.all(`
              SELECT
                u.id as user_id,
                u.name as user_name,
                u.email as user_email,
                'auto' as collaborator_type
              FROM organization_members om
              JOIN users u ON om.user_id = u.id
              WHERE om.organization_id = ? AND om.status = 'active'
              ORDER BY u.name
            `, [doc.organization_id], (err, collaborators) => {
              if (err) {
                logger.error('Error fetching organization members for document', { error: err.message, documentId: doc.id });
                return resolve({
                  ...doc,
                  parentId: doc.parent_id || undefined,
                  status: doc.status || 'draft',
                  proposalDeadline: doc.proposal_deadline || undefined,
                  owner: {
                    id: doc.owner_id,
                    name: doc.owner_name,
                    email: doc.owner_email
                  },
                  collaborators: [],
                  organization: {
                    id: doc.organization_id,
                    name: doc.organization_name
                  },
                  options: {
                    acceptanceThreshold: doc.acceptance_threshold,
                    votingAnonymous: doc.voting_anonymous === 1,
                    votingAnonymityLocked: doc.voting_anonymity_locked === 1,
                    voteChangeAllowed: doc.vote_change_allowed === 1,
                    structureProposalsEnabled: doc.structure_proposals_enabled === 1
                  }
                });
              }

              resolve({
                ...doc,
                parentId: doc.parent_id || undefined,
                status: doc.status || 'draft',
                proposalDeadline: doc.proposal_deadline || undefined,
                owner: {
                  id: doc.owner_id,
                  name: doc.owner_name,
                  email: doc.owner_email
                },
                collaborators: collaborators || [],
                organization: {
                  id: doc.organization_id,
                  name: doc.organization_name
                },
                options: {
                  acceptanceThreshold: doc.acceptance_threshold,
                  votingAnonymous: doc.voting_anonymous === 1,
                  votingAnonymityLocked: doc.voting_anonymity_locked === 1,
                  voteChangeAllowed: doc.vote_change_allowed === 1,
                  structureProposalsEnabled: doc.structure_proposals_enabled === 1
                }
              });
            });
          } else {
            // For non-organizational documents, fetch stored collaborators
            db.all(`
              SELECT
                dc.id as collaborator_id,
                dc.document_id,
                dc.user_id,
                dc.created_at,
                u.name as user_name,
                u.email as user_email
              FROM document_collaborators dc
              JOIN users u ON dc.user_id = u.id
              WHERE dc.document_id = ?
            `, [doc.id], (err, collaborators) => {
              if (err) {
                logger.error('Error fetching document collaborators', { error: err.message, documentId: doc.id });
                // Already logged above
                return resolve({
                  ...doc,
                  parentId: doc.parent_id || undefined,
                  owner: {
                    id: doc.owner_id,
                    name: doc.owner_name,
                    email: doc.owner_email
                  },
                  collaborators: [],
                  organization: doc.organization_id ? {
                    id: doc.organization_id,
                    name: doc.organization_name
                  } : null,
                  options: {
                    acceptanceThreshold: doc.acceptance_threshold,
                    votingAnonymous: doc.voting_anonymous === 1,
                    votingAnonymityLocked: doc.voting_anonymity_locked === 1,
                    voteChangeAllowed: doc.vote_change_allowed === 1,
                    structureProposalsEnabled: doc.structure_proposals_enabled === 1
                  }
                });
              }

              // Transform collaborators to match expected format
              const transformedCollaborators = (collaborators || []).map(collab => ({
                id: collab.user_id,
                name: collab.user_name,
                email: collab.user_email
              }));

              resolve({
                ...doc,
                parentId: doc.parent_id || undefined,
                status: doc.status || 'draft',
                proposalDeadline: doc.proposal_deadline || undefined,
                owner: {
                  id: doc.owner_id,
                  name: doc.owner_name,
                  email: doc.owner_email
                },
                collaborators: transformedCollaborators,
                organization: doc.organization_id ? {
                  id: doc.organization_id,
                  name: doc.organization_name
                } : null,
                options: {
                  acceptanceThreshold: doc.acceptance_threshold,
                  votingAnonymous: doc.voting_anonymous === 1,
                  votingAnonymityLocked: doc.voting_anonymity_locked === 1,
                  voteChangeAllowed: doc.vote_change_allowed === 1,
                  structureProposalsEnabled: doc.structure_proposals_enabled === 1
                }
              });
            });
          }
        });
      });

      Promise.all(documentsWithCollaborators).then(processedDocuments => {
        res.json({
          documents: processedDocuments,
          organizationId: organizationId
        });
      }).catch(err => {
        logger.error('Error processing documents', { error: err.message, stack: err.stack, organizationId });
        res.status(500).json({ error: 'Failed to process documents' });
      });
    });
  });
});

// Get a specific document with full details
router.get('/:id', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.id;
  const userId = req.user.id;

  // Access query: check ownership, direct collaboration, OR organizational membership
  const accessQuery = `
    SELECT d.*,
           u.name as owner_name,
           u.email as owner_email
    FROM documents d
    JOIN users u ON d.owner_id = u.id
    LEFT JOIN document_collaborators dc ON d.id = dc.document_id AND dc.user_id = ?
    LEFT JOIN organization_members om ON d.organization_id = om.organization_id AND om.user_id = ? AND om.status = 'active'
    LEFT JOIN organizations o ON d.organization_id = o.id AND o.is_active = 1
    WHERE d.id = ? 
      AND (
        d.owner_id = ? 
        OR dc.user_id = ?
        OR (d.ownership_type = 'organizational' AND om.user_id IS NOT NULL AND o.is_active = 1)
      )
  `;

  db.get(accessQuery, [userId, userId, documentId, userId, userId], (err, document) => {
    if (err) {
      logger.error('Error fetching document', { error: err.message, documentId, userId });
      return res.status(500).json({ error: 'Failed to fetch document' });
    }

    if (!document) {
      return res.status(404).json({ error: 'Document not found or access denied' });
    }


    // Optimized single query using JSON aggregation (replaces N+1 queries)
    // Get document voting_anonymous setting first
    const isAnonymous = document.voting_anonymous === 1;

    // Use subqueries to avoid cartesian product from joining proposals and history
    const optimizedParagraphsQuery = `
      SELECT
        p.*,
        (
          SELECT json_group_array(
            json_object(
              'id', pr.id,
              'user_id', pr.user_id,
              'text', pr.text,
              'type', pr.type,
              'heading_level', pr.heading_level,
              'created_at', pr.created_at,
              'updated_at', pr.updated_at,
              'user_name', pu.name,
              'user_email', pu.email,
              'votes', (
                SELECT json_group_array(
                  json_object(
                    'id', v.id,
                    'user_id', v.user_id,
                    'vote', v.vote,
                    'created_at', v.created_at,
                    'user_name', vu.name,
                    'user_email', vu.email
                  )
                )
                FROM votes v
                LEFT JOIN users vu ON v.user_id = vu.id
                WHERE v.proposal_id = pr.id
                ORDER BY v.created_at ASC
              ),
              'comments', (
                SELECT json_group_array(
                  json_object(
                    'id', c.id,
                    'user_id', c.user_id,
                    'text', c.text,
                    'parent_id', c.parent_id,
                    'created_at', c.created_at,
                    'updated_at', c.updated_at,
                    'user_name', cu.name,
                    'user_email', cu.email,
                    'parent_user_id', pc.user_id,
                    'parent_user_name', pcu.name
                  )
                )
                FROM comments c
                LEFT JOIN users cu ON c.user_id = cu.id
                LEFT JOIN comments pc ON c.parent_id = pc.id
                LEFT JOIN users pcu ON pc.user_id = pcu.id
                WHERE c.proposal_id = pr.id
                ORDER BY c.created_at ASC
              )
            )
          )
          FROM proposals pr
          LEFT JOIN users pu ON pr.user_id = pu.id
          WHERE pr.paragraph_id = p.id
          ORDER BY pr.created_at ASC
        ) as proposals_json,
        (
          SELECT json_group_array(
            json_object(
              'id', h.id,
              'paragraph_id', h.paragraph_id,
              'user_id', h.user_id,
              'old_text', h.old_text,
              'new_text', h.new_text,
              'approval_percentage', h.approval_percentage,
              'proposal_id', h.proposal_id,
              'created_at', h.created_at,
              'heading_level', h.heading_level,
              'user_name', hu.name,
              'user_email', hu.email,
              'proposal_type', pr_h.type
            )
          )
          FROM history h
          LEFT JOIN users hu ON h.user_id = hu.id
          LEFT JOIN proposals pr_h ON h.proposal_id = pr_h.id
          WHERE h.paragraph_id = p.id
          ORDER BY h.created_at DESC
        ) as history_json
      FROM paragraphs p
      WHERE p.document_id = ?
      ORDER BY p.order_index ASC, p.created_at ASC
    `;

    db.all(optimizedParagraphsQuery, [documentId], (err, rows) => {
      if (err) {
        logger.error('Error fetching paragraphs', { error: err.message, documentId });
        return res.status(500).json({ error: 'Failed to fetch document content' });
      }

      // Parse JSON and transform data to match expected format
      const paragraphData = rows.map(row => {
        // Parse proposals JSON
        let proposals = [];
        if (row.proposals_json && row.proposals_json !== '[null]' && row.proposals_json !== 'null') {
          let rawProposals;
          try {
            rawProposals = typeof row.proposals_json === 'string' ? JSON.parse(row.proposals_json) : row.proposals_json;
          } catch (e) {
            logger.warn('Failed to parse proposals_json for paragraph', { paragraphId: row.id, error: e.message, documentId });
            rawProposals = [];
          }
          // Filter out null values
          proposals = (Array.isArray(rawProposals) ? rawProposals : []).filter(prop => prop !== null && prop.id !== null).map(prop => {
            // Parse votes JSON - handle both string and object formats
            let votes = [];
            if (prop.votes) {
              let rawVotes;
              try {
                rawVotes = typeof prop.votes === 'string' ? JSON.parse(prop.votes) : prop.votes;
              } catch (e) {
                logger.warn('Failed to parse votes JSON for proposal', { proposalId: prop.id, error: e.message, documentId });
                rawVotes = [];
              }
              votes = (Array.isArray(rawVotes) ? rawVotes : []).map(vote => {
                const voteData = {
                  id: vote.id,
                  proposalId: prop.id,
                  vote: vote.vote,
                  createdAt: vote.created_at,
                  created_at: vote.created_at
                };

                // Handle anonymous voting
                if (!isAnonymous) {
                  voteData.userId = vote.user_id;
                  voteData.user = {
                    id: vote.user_id,
                    name: vote.user_name,
                    email: vote.user_email
                  };
                } else {
                  // In anonymous mode, only include userId for the current user's own vote
                  if (vote.user_id === userId) {
                    voteData.userId = vote.user_id;
                  }
                }

                return voteData;
              });
            }

            // Parse comments JSON - handle both string and object formats
            let comments = [];
            if (prop.comments) {
              let rawComments;
              try {
                rawComments = typeof prop.comments === 'string' ? JSON.parse(prop.comments) : prop.comments;
              } catch (e) {
                logger.warn('Failed to parse comments JSON for proposal', { proposalId: prop.id, error: e.message, documentId });
                rawComments = [];
              }
              comments = (Array.isArray(rawComments) ? rawComments : []).map(comment => ({
                id: comment.id,
                userId: comment.user_id,
                user_id: comment.user_id,
                text: comment.text,
                parentId: comment.parent_id,
                parent_id: comment.parent_id,
                createdAt: comment.created_at,
                created_at: comment.created_at,
                updatedAt: comment.updated_at,
                updated_at: comment.updated_at,
                user: {
                  id: comment.user_id,
                  name: comment.user_name,
                  email: comment.user_email
                },
                parent: comment.parent_id ? {
                  id: comment.parent_id,
                  user: {
                    id: comment.parent_user_id,
                    name: comment.parent_user_name
                  }
                } : null,
                replies: []
              }));
            }

            return {
              id: prop.id,
              userId: prop.user_id,
              user_id: prop.user_id,
              paragraphId: row.id,
              paragraph_id: row.id,
              text: prop.text,
              type: prop.type,
              headingLevel: prop.heading_level,
              heading_level: prop.heading_level,
              createdAt: prop.created_at,
              created_at: prop.created_at,
              updatedAt: prop.updated_at,
              updated_at: prop.updated_at,
              user: {
                id: prop.user_id,
                name: prop.user_name,
                email: prop.user_email
              },
              votes,
              comments
            };
          });
        }

        // Parse history JSON
        let history = [];
        if (row.history_json && row.history_json !== '[null]' && row.history_json !== 'null') {
          let rawHistory;
          try {
            rawHistory = typeof row.history_json === 'string' ? JSON.parse(row.history_json) : row.history_json;
          } catch (e) {
            logger.warn('Failed to parse history_json for paragraph', { paragraphId: row.id, error: e.message, documentId });
            rawHistory = [];
          }
          // Filter out null values
          history = (Array.isArray(rawHistory) ? rawHistory : []).filter(entry => entry !== null && entry.id !== null).map(entry => ({
            id: entry.id,
            paragraph_id: entry.paragraph_id,
            paragraphId: entry.paragraph_id,
            userId: entry.user_id,
            oldText: entry.old_text,
            newText: entry.new_text,
            text: entry.new_text,
            approvalPercentage: entry.approval_percentage != null ? Number(entry.approval_percentage) : 100,
            proposalId: entry.proposal_id,
            acceptedAt: entry.created_at,
            createdAt: entry.created_at,
            type: entry.proposal_type || 'BODY',
            heading_level: entry.heading_level,
            user: {
              id: entry.user_id,
              name: entry.user_name,
              email: entry.user_email
            }
          }));
        }

        return {
          ...row,
          order: row.order_index,
          heading_level: row.heading_level,
          proposals,
          suggestions: proposals, // Alias for compatibility
          history
        };
      });

      // Fetch collaborators (this is already optimized, keeping as is)
      const collabQuery = `
        SELECT 
          dc.id as collaborator_id,
          dc.document_id,
          dc.user_id,
          dc.created_at,
          u.name as user_name,
          u.email as user_email
        FROM document_collaborators dc
        JOIN users u ON dc.user_id = u.id
        WHERE dc.document_id = ?
      `;

      db.all(collabQuery, [documentId], (collabErr, collaborators) => {
        const collabQuery = `
          SELECT 
            dc.id as collaborator_id,
            dc.document_id,
            dc.user_id,
            dc.created_at,
            u.name as user_name,
            u.email as user_email
          FROM document_collaborators dc
          JOIN users u ON dc.user_id = u.id
          WHERE dc.document_id = ?
        `;

        db.all(collabQuery, [documentId], (collabErr, collaborators) => {
          if (collabErr) {
            logger.error('Error fetching collaborators', { error: collabErr.message, documentId });
            return res.status(500).json({ error: 'Failed to fetch collaborators' });
          }

          const normalizedCollaborators = (collaborators || []).map(collab => ({
            id: collab.collaborator_id,
            document_id: collab.document_id,
            user_id: collab.user_id,
            created_at: collab.created_at,
            user: {
              id: collab.user_id,
              name: collab.user_name,
              email: collab.user_email
            }
          }));

          const result = {
            ...document,
            parentId: document.parent_id || undefined,
            status: document.status || 'draft',
            proposalDeadline: document.proposal_deadline || undefined,
            owner: {
              id: document.owner_id,
              name: document.owner_name,
              email: document.owner_email
            },
            collaborators: normalizedCollaborators,
            paragraphs: paragraphData,
            options: {
              acceptanceThreshold: document.acceptance_threshold || 75.0,
              votingAnonymous: document.voting_anonymous === 1,
              votingAnonymityLocked: document.voting_anonymity_locked === 1,
              voteChangeAllowed: document.vote_change_allowed === 1
            }
          };

          res.json({ document: result });
        });
      });
    });
  });
});

// Create a new document
router.post('/', requireAuth, documentValidation.create, async (req, res) => {
  const db = req.app.locals.db;
  const { title, description, options, ownershipType = 'personal', organizationId, creatorIds, parentId } = req.body;
  const userId = req.user.id;

  logDocumentEvent('info', 'document_creation_started', {
    userId,
    ownershipType,
    organizationId,
    hasParent: !!parentId,
    hasOptions: !!options
  });

  // Validate input parameters
  const inputValidation = validateDocumentInputs(title, description, options, ownershipType, organizationId, creatorIds);
  if (!inputValidation.valid) {
    logDocumentError('DOC_VALIDATION_FAILED', 'Document creation input validation failed', {
      userId,
      errors: inputValidation.errors,
      requestBody: { title, description, options, ownershipType, organizationId, creatorIds, parentId }
    });
    logger.error('Document creation validation failed', { 
      userId, 
      errors: inputValidation.errors, 
      requestBody: { title, description, options, ownershipType, organizationId, creatorIds, parentId } 
    });
    return res.status(400).json({
      error: 'Invalid input parameters',
      details: inputValidation.errors
    });
  }

  // Add current user to creatorIds for shared documents (if not already included)
  if (ownershipType === 'shared' && creatorIds && !creatorIds.includes(userId)) {
    creatorIds.push(userId);
  }

  // For organizational documents, check basic membership
  if (ownershipType === 'organizational') {
    if (!organizationId) {
      logDocumentError('DOC_ORG_ID_REQUIRED', 'Organization ID missing for organizational document', { userId });
      return res.status(400).json({ error: ERROR_CODES.DOC_ORG_ID_REQUIRED });
    }

    // Check if organization exists first
    db.get('SELECT id, name FROM organizations WHERE id = ? AND is_active = 1', [organizationId], (orgErr, org) => {
      if (orgErr) {
        logDocumentError('DOC_DB_ERROR', 'Database error checking organization existence', {
          userId,
          organizationId,
          error: orgErr.message
        });
        return res.status(500).json({ error: 'Failed to verify organization' });
      }

      if (!org) {
        logDocumentError('DOC_ORG_NOT_FOUND', 'Organization not found or not active', {
          userId,
          organizationId
        });
        return res.status(400).json({ error: 'Organization not found or not active' });
      }

      logDocumentSuccess('organization_verified', { userId, organizationId, organizationName: org.name });

      // Simple membership check - any active member can create docs
      db.get(`
        SELECT status FROM organization_members
        WHERE organization_id = ? AND user_id = ? AND status = 'active'
      `, [organizationId, userId], async (err, member) => {
        if (err || !member) {
          logDocumentError('DOC_ORG_ACCESS_DENIED', 'User is not an active member of organization', {
            userId,
            organizationId
          });
          return res.status(403).json({ error: 'Must be an active organization member to create documents' });
        }

        logDocumentSuccess('organization_membership_verified', { userId, organizationId });

        try {
          const result = await createDocument(db, ownershipType, organizationId, options, userId, title, description, creatorIds, parentId);
          logDocumentSuccess('organizational_document_created', {
            userId,
            organizationId,
            title: title.substring(0, 50)
          });
          return res.status(201).json({ document: result });
        } catch (error) {
          logDocumentError('DOC_CREATION_FAILED', 'Error in organizational document creation', {
            userId,
            organizationId,
            error: error.message,
            stack: error.stack
          });
          return res.status(500).json({
            error: 'Failed to create organizational document',
            details: error.message,
            code: error.code || 'DOC_CREATION_FAILED'
          });
        }
      });
    });
    return;
  }

  // Validate parent document if provided
  try {
    const parentValidation = await validateParentDocument(db, parentId, ownershipType, organizationId, userId);
    if (!parentValidation.valid) {
      logDocumentError(parentValidation.error, parentValidation.message, {
        userId,
        parentId,
        ownershipType,
        organizationId
      });
      return res.status(parentValidation.statusCode).json({
        error: parentValidation.message,
        code: parentValidation.error
      });
    }
  } catch (validationError) {
    logDocumentError('DOC_PARENT_VALIDATION_ERROR', 'Error during parent validation', {
      userId,
      parentId,
      error: validationError.message
    });
    return res.status(500).json({
      error: 'Failed to validate parent document',
      details: validationError.message
    });
  }

  // For non-organizational documents without parent, create immediately
  (async () => {
    try {
      const result = await createDocument(db, ownershipType, organizationId, options, userId, title, description, creatorIds, parentId);
      logDocumentSuccess('document_created', {
        userId,
        ownershipType,
        organizationId,
        title: title.substring(0, 50)
      });
      return res.status(201).json({ document: result });
    } catch (error) {
      logDocumentError('DOC_CREATION_FAILED', 'Error in document creation', {
        userId,
        ownershipType,
        organizationId,
        error: error.message,
        stack: error.stack
      });

      // Determine appropriate error response based on error type
      let statusCode = 500;
      let errorMessage = 'Failed to create document';
      let errorCode = 'DOC_CREATION_FAILED';

      if (error.message.includes('Document creation failed')) {
        statusCode = 500;
        errorMessage = 'Failed to create document';
        errorCode = 'DOC_DB_ERROR';
      } else if (error.message.includes('Failed to create title paragraph')) {
        statusCode = 500;
        errorMessage = 'Failed to initialize document content';
        errorCode = 'DOC_PARAGRAPH_ERROR';
      } else if (error.message.includes('Failed to add collaborator')) {
        statusCode = 500;
        errorMessage = 'Failed to set up document collaborators';
        errorCode = 'DOC_COLLABORATOR_ERROR';
      } else if (error.message.includes('User not found')) {
        statusCode = 500;
        errorMessage = 'User account error during document creation';
        errorCode = 'DOC_USER_ERROR';
      }

      return res.status(statusCode).json({
        error: errorMessage,
        details: error.message,
        code: errorCode
      });
    }
  })();
});
  async function createDocument(db, ownershipType, organizationId, options, userId, title, description, creatorIds, parentId) {
    logger.debug('Starting createDocument function', { ownershipType, organizationId, userId, title: title.substring(0, 50), parentId });

    const documentId = uuidv4();
    const trimmedTitle = title.trim();
    const trimmedDescription = description ? description.trim() : null;

    logger.debug('Generated document ID', { documentId, ownershipType });

    // Build the SQL query and parameters using the helper function
    const { sql, params, acceptanceThreshold, votingAnonymous, votingAnonymityLocked, voteChangeAllowed, structureProposalsEnabled } =
      await buildDocumentInsertSQL(db, ownershipType, organizationId, options, documentId, trimmedTitle, trimmedDescription, userId, parentId);

    logger.debug('Executing document INSERT', { documentId, paramsLength: params.length });

  const result = await withTransaction(db, async () => {
    // First verify that the user exists
    await new Promise((resolve, reject) => {
      db.get('SELECT id FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) {
          logger.error('Error checking user existence', { error: err.message, userId });
          reject(new Error(`User verification failed: ${err.message}`));
        } else if (!row) {
          logger.error('User does not exist', { userId });
          reject(new Error(`User ${userId} does not exist`));
        } else {
          logger.debug('User verified in database', { userId });
          resolve();
        }
      });
    });

    // Execute document insert
    await new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
          if (err) {
            logger.error('Error creating document', { error: err.message, documentId, userId });
            reject(new Error(`Document creation failed: ${err.message}`));
          } else {
            logger.debug('Document insert completed', { documentId, changes: this.changes, lastID: this.lastID });

            // Verify document was actually inserted
            db.get('SELECT id, title, owner_id FROM documents WHERE id = ?', [documentId], (checkErr, row) => {
              if (checkErr) {
                logger.error('Error verifying document insert', { error: checkErr.message, documentId });
                reject(new Error(`Document verification failed: ${checkErr.message}`));
              } else if (!row) {
                logger.error('Document was not found after insert', { documentId });
                // Check what documents do exist
                db.all('SELECT id, title FROM documents ORDER BY created_at DESC LIMIT 5', [], (allErr, rows) => {
                  if (allErr) {
                    logger.error('Error listing recent documents', { error: allErr.message });
                  } else {
                    logger.debug('Recent documents', { count: rows.length });
                  }
                  reject(new Error(`Document ${documentId} not found after insert`));
                });
              } else {
                logger.debug('Document verified in database', { documentId });
                resolve();
              }
            });
          }
        });
      });

      // Create initial title paragraph (as a suggestion)
      await createInitialParagraph(db, documentId, trimmedTitle, trimmedDescription, userId);

      // Add collaborators
      await addCollaborators(db, documentId, ownershipType, organizationId, userId, creatorIds);

      // Build response options
      const responseOptions = {
        acceptanceThreshold,
        votingAnonymous: votingAnonymous === 1,
        votingAnonymityLocked: votingAnonymityLocked === 1,
        voteChangeAllowed: voteChangeAllowed === 1,
        structureProposalsEnabled: structureProposalsEnabled === 1
      };

      // Build and return response
      return await buildDocumentResponse(db, documentId, trimmedTitle, trimmedDescription, userId, ownershipType, organizationId, parentId, responseOptions);
    });

    // Record business metrics
    try {
      metricsCollector.recordBusinessEvent('document_created', {
        documentId,
        ownerId: userId,
        ownershipType,
        organizationId: ownershipType === 'organizational' ? organizationId : null
      });
    } catch (metricsErr) {
      logger.error('Error recording metrics', { error: metricsErr.message });
      // Don't fail the request if metrics fail
    }

    logger.info('Document created successfully', { documentId, title: trimmedTitle.substring(0, 50) });
    return result;
  }

// Update document title
router.put('/:id', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.id;
  const { title } = req.body;
  const userId = req.user.id;

  if (!title || title.trim() === '') {
    return res.status(400).json({ error: 'Title is required' });
  }

  // Check if user owns this document
  db.get(`
    SELECT owner_id FROM documents WHERE id = ?
  `, [documentId], (err, document) => {
    if (err) {
      logger.error('Error fetching document', { error: err.message, documentId, userId });
      return res.status(500).json({ error: 'Failed to update document' });
    }

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (document.owner_id !== userId) {
      return res.status(403).json({ error: 'Only document owner can update document' });
    }

    db.run(`
      UPDATE documents SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `, [title.trim(), documentId], function(err) {
      if (err) {
        logger.error('Error updating document', { error: err.message, documentId, userId });
        return res.status(500).json({ error: 'Failed to update document' });
      }

      res.json({ message: 'Document updated successfully' });
    });
  });
});

// Delete a document
router.delete('/:id', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.id;
  const userId = req.user.id;

  // Check if user owns this document
  db.get(`
    SELECT owner_id FROM documents WHERE id = ?
  `, [documentId], (err, document) => {
    if (err) {
      logger.error('Error fetching document', { error: err.message, documentId, userId });
      return res.status(500).json({ error: 'Failed to delete document' });
    }

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (document.owner_id !== userId) {
      return res.status(403).json({ error: 'Only document owner can delete document' });
    }

    // Delete document and all related data (cascade delete)
    db.run('DELETE FROM documents WHERE id = ?', [documentId], function(err) {
      if (err) {
        logger.error('Error deleting document', { error: err.message, documentId, userId });
        return res.status(500).json({ error: 'Failed to delete document' });
      }

      res.json({ message: 'Document deleted successfully' });
    });
  });
});

// Add collaborator to document
router.post('/:id/collaborators', requireAuth, (req, res) => {
  logger.debug('Adding collaborator', { documentId: req.params.id, currentUserId: req.user.id, targetUserId: req.body.userId });

  const db = req.app.locals.db;
  const documentId = req.params.id;
  const currentUserId = req.user.id;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  // Check if current user is the document owner
  db.get(`
    SELECT owner_id FROM documents WHERE id = ?
  `, [documentId], (err, document) => {
    if (err) {
      logger.error('Error fetching document', { error: err.message, documentId, userId });
      return res.status(500).json({ error: 'Failed to add collaborator' });
    }

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (document.owner_id !== currentUserId) {
      return res.status(403).json({ error: 'Only document owner can manage collaborators' });
    }

    // Check if user exists
    db.get(`
      SELECT id, name, email FROM users WHERE id = ?
    `, [userId], (err, user) => {
      if (err) {
        logger.error('Error fetching user', { error: err.message, userId: req.body.userId });
        return res.status(500).json({ error: 'Failed to add collaborator' });
      }

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check if user is already a collaborator or owner
      if (document.owner_id === userId) {
        return res.status(400).json({ error: 'User is already the document owner' });
      }

      db.get(`
        SELECT id FROM document_collaborators WHERE document_id = ? AND user_id = ?
      `, [documentId, userId], (err, existing) => {
        if (err) {
          logger.error('Error checking existing collaborator', { error: err.message, documentId, userId: req.body.userId });
          return res.status(500).json({ error: 'Failed to add collaborator' });
        }

        if (existing) {
          return res.status(400).json({ error: 'User is already a collaborator' });
        }

        // Add collaborator
        const collaboratorId = uuidv4();
        db.run(`
          INSERT INTO document_collaborators (id, document_id, user_id)
          VALUES (?, ?, ?)
        `, [collaboratorId, documentId, userId], function(err) {
          if (err) {
            logger.error('Error adding collaborator', { error: err.message, documentId, userId: req.body.userId });
            return res.status(500).json({ error: 'Failed to add collaborator' });
          }

          // Update document timestamp
          db.run(`
            UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
          `, [documentId], function(err) {
            if (err) {
              logger.error('Error updating document timestamp', { error: err.message, documentId });
            }
          });

          logger.info('Collaborator added successfully', { userId, documentId });
          res.status(201).json({
            collaborator: {
              id: collaboratorId,
              documentId,
              userId,
              createdAt: new Date().toISOString(),
              user: {
                id: user.id,
                name: user.name,
                email: user.email
              }
            }
          });
        });
      });
    });
  });
});

// Remove collaborator from document
router.delete('/:id/collaborators/:userId', requireAuth, (req, res) => {
  logger.debug('Removing collaborator', { documentId: req.params.id, currentUserId: req.user.id, targetUserId: req.params.userId });

  const db = req.app.locals.db;
  const documentId = req.params.id;
  const collaboratorUserId = req.params.userId;
  const currentUserId = req.user.id;

  // Check if current user is the document owner
  db.get(`
    SELECT owner_id FROM documents WHERE id = ?
  `, [documentId], (err, document) => {
    if (err) {
      logger.error('Error fetching document', { error: err.message, documentId, userId });
      return res.status(500).json({ error: 'Failed to remove collaborator' });
    }

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (document.owner_id !== currentUserId) {
      return res.status(403).json({ error: 'Only document owner can manage collaborators' });
    }

    // Cannot remove the owner
    if (document.owner_id === collaboratorUserId) {
      return res.status(400).json({ error: 'Cannot remove document owner' });
    }

    // Remove collaborator
    db.run(`
      DELETE FROM document_collaborators WHERE document_id = ? AND user_id = ?
    `, [documentId, collaboratorUserId], function(err) {
      if (err) {
        logger.error('Error removing collaborator', { error: err.message, documentId, userId: req.params.userId });
        return res.status(500).json({ error: 'Failed to remove collaborator' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Collaborator not found' });
      }

      // Update document timestamp
      db.run(`
        UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `, [documentId], function(err) {
        if (err) {
          logger.error('Error updating document timestamp', { error: err.message, documentId });
        }
      });

      logger.info('Collaborator removed successfully', { userId: collaboratorUserId, documentId });
      res.json({ message: 'Collaborator removed successfully' });
    });
  });
});


// Vote on entire document (document-level vote)
router.post('/:id/vote', requireAuth, requireDocumentAccess, (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.id;
  const userId = req.user.id;
  const { vote } = req.body;

  if (!['PRO', 'NEUTRAL', 'CONTRA'].includes(vote)) {
    return res.status(400).json({ error: 'Invalid vote type. Must be PRO, NEUTRAL, or CONTRA' });
  }

  // Check if document exists and user has access
  db.get(`SELECT id, vote_change_allowed, status, ownership_type, voting_deadline FROM documents WHERE id = ?`, [documentId], (err, document) => {
    if (err) {
      logger.error('Error fetching document', { error: err.message, documentId, userId });
      return res.status(500).json({ error: 'Failed to fetch document' });
    }

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // For organizational documents, only allow voting when status is 'voting'
    if (document.ownership_type === 'organizational' && document.status !== 'voting') {
      return res.status(403).json({ 
        error: 'Document-level voting is only available during the voting period. Current status: ' + document.status 
      });
    }

    // Check if voting deadline has passed
    if (document.voting_deadline && new Date() > new Date(document.voting_deadline)) {
      return res.status(403).json({ 
        error: 'Voting deadline has passed for this document',
        deadline: document.voting_deadline
      });
    }

    // Prevent voting on finalized documents
    if (document.status === 'agreed' || document.status === 'rejected') {
      return res.status(403).json({ 
        error: 'Cannot vote on documents that have been finalized. Status: ' + document.status 
      });
    }

    // Check if user already voted
    db.get(`SELECT id, vote FROM document_votes WHERE document_id = ? AND user_id = ?`, 
      [documentId, userId], (err, existingVote) => {
      if (err) {
        logger.error('Error checking existing vote', { error: err.message, documentId, userId });
        return res.status(500).json({ error: 'Failed to check existing vote' });
      }

      if (existingVote) {
        // Check if vote changes are allowed
        if (!document.vote_change_allowed || document.vote_change_allowed === 0) {
          return res.status(403).json({ 
            error: 'Votes are locked for this document. You cannot change your vote.' 
          });
        }

        // Update existing vote
        db.run(`UPDATE document_votes SET vote = ?, updated_at = CURRENT_TIMESTAMP WHERE document_id = ? AND user_id = ?`,
          [vote, documentId, userId], function(err) {
          if (err) {
            logger.error('Error updating vote', { error: err.message, documentId, userId });
            return res.status(500).json({ error: 'Failed to update vote' });
          }

          // Check if document should be marked as agreed (async, don't wait)
          checkDocumentAgreementStatus(db, documentId).catch(err => {
            logger.error('Error in checkDocumentAgreementStatus', { error: err.message, documentId });
          });

          // Fetch all document votes and broadcast via WebSocket
          db.all(`SELECT dv.*, u.name as user_name, u.email as user_email 
                  FROM document_votes dv 
                  LEFT JOIN users u ON dv.user_id = u.id 
                  WHERE dv.document_id = ? 
                  ORDER BY dv.created_at ASC`, [documentId], (voteErr, votes) => {
            if (!voteErr && votes) {
              // Get document to check voting anonymity
              db.get(`SELECT voting_anonymous FROM documents WHERE id = ?`, [documentId], (docErr, doc) => {
                const isAnonymous = doc?.voting_anonymous === 1;
                
                const formattedVotes = votes.map(v => {
                  if (isAnonymous && v.user_id !== userId) {
                    return { id: v.id, vote: v.vote, createdAt: v.created_at };
                  }
                  return {
                    id: v.id,
                    userId: v.user_id,
                    vote: v.vote,
                    createdAt: v.created_at,
                    user: { id: v.user_id, name: v.user_name, email: v.user_email }
                  };
                });

                webSocketManager.broadcastDocumentUpdate(documentId, 'document-vote', {
                  documentId,
                  votes: formattedVotes,
                  action: 'updated'
                });
              });
            }
          });

          res.json({ message: 'Vote updated successfully' });
        });
      } else {
        // Insert new vote
        const { v4: uuidv4 } = require('uuid');
        const voteId = uuidv4();
        
        db.run(`INSERT INTO document_votes (id, document_id, user_id, vote, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [voteId, documentId, userId, vote], function(err) {
          if (err) {
            logger.error('Error casting vote', { error: err.message, documentId, userId });
            return res.status(500).json({ error: 'Failed to cast vote' });
          }

          // Check if document should be marked as agreed (async, don't wait)
          checkDocumentAgreementStatus(db, documentId).catch(err => {
            logger.error('Error in checkDocumentAgreementStatus', { error: err.message, documentId });
          });

          // Fetch all document votes and broadcast via WebSocket
          db.all(`SELECT dv.*, u.name as user_name, u.email as user_email 
                  FROM document_votes dv 
                  LEFT JOIN users u ON dv.user_id = u.id 
                  WHERE dv.document_id = ? 
                  ORDER BY dv.created_at ASC`, [documentId], (voteErr, votes) => {
            if (!voteErr && votes) {
              // Get document to check voting anonymity
              db.get(`SELECT voting_anonymous FROM documents WHERE id = ?`, [documentId], (docErr, doc) => {
                const isAnonymous = doc?.voting_anonymous === 1;
                
                const formattedVotes = votes.map(v => {
                  if (isAnonymous && v.user_id !== userId) {
                    return { id: v.id, vote: v.vote, createdAt: v.created_at };
                  }
                  return {
                    id: v.id,
                    userId: v.user_id,
                    vote: v.vote,
                    createdAt: v.created_at,
                    user: { id: v.user_id, name: v.user_name, email: v.user_email }
                  };
                });

                webSocketManager.broadcastDocumentUpdate(documentId, 'document-vote', {
                  documentId,
                  votes: formattedVotes,
                  action: 'cast'
                });
              });
            }
          });

          res.json({ message: 'Vote recorded successfully', voteId });
        });
      }
    });
  });
});

// Get document-level votes
router.get('/:id/votes', requireAuth, requireDocumentAccess, (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.id;
  const userId = req.user.id;

  // Get document to check voting anonymity
  db.get(`SELECT voting_anonymous FROM documents WHERE id = ?`, [documentId], (docErr, doc) => {
    if (docErr) {
      logger.error('Error fetching document', { error: docErr.message, documentId });
      return res.status(500).json({ error: 'Failed to fetch document' });
    }

    const isAnonymous = doc?.voting_anonymous === 1;

    const votesQuery = isAnonymous
      ? `SELECT id, vote, created_at, updated_at FROM document_votes WHERE document_id = ?`
      : `SELECT dv.id, dv.vote, dv.created_at, dv.updated_at, u.id as user_id, u.name as user_name, u.email as user_email
         FROM document_votes dv
         JOIN users u ON dv.user_id = u.id
         WHERE dv.document_id = ?`;

    db.all(votesQuery, [documentId], (err, votes) => {
      if (err) {
        logger.error('Error fetching votes', { error: err.message, documentId });
        return res.status(500).json({ error: 'Failed to fetch votes' });
      }

      const formattedVotes = votes.map(vote => {
        if (isAnonymous) {
          return {
            id: vote.id,
            vote: vote.vote,
            createdAt: vote.created_at,
            updatedAt: vote.updated_at
          };
        } else {
          return {
            id: vote.id,
            userId: vote.user_id,
            vote: vote.vote,
            createdAt: vote.created_at,
            updatedAt: vote.updated_at,
            user: {
              id: vote.user_id,
              name: vote.user_name,
              email: vote.user_email
            }
          };
        }
      });

      res.json({ votes: formattedVotes });
    });
  });
});

// Helper function to check if document-level votes reach agreement threshold
async function checkDocumentAgreementStatus(db, documentId) {
  try {
    // Get document info including status, threshold, and voting settings
    const doc = await new Promise((resolve, reject) => {
      db.get(`
        SELECT 
          id, status, acceptance_threshold, proposal_deadline, voting_deadline,
          min_voters_required, organization_id, ownership_type,
          threshold_calculation_method
        FROM documents WHERE id = ?
      `, [documentId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!doc || doc.status === 'agreed' || doc.status === 'rejected') {
      // Already finalized or document not found
      return;
    }

    // Only check for agreement if document is in 'voting' or 'proposal' status
    if (doc.status !== 'voting' && doc.status !== 'proposal') {
      return;
    }

    // For organizational documents in 'proposal' status, wait until voting starts
    if (doc.status === 'proposal' && doc.ownership_type === 'organizational') {
      // Check if proposal deadline has passed (should transition to voting first)
      if (doc.proposal_deadline) {
        const deadline = new Date(doc.proposal_deadline);
        const now = new Date();
        if (now < deadline) {
          // Deadline has not passed yet - cannot agree
          return;
        }
      }
    }

    // For documents in 'voting' status, check voting deadline
    if (doc.status === 'voting' && doc.voting_deadline) {
      const deadline = new Date(doc.voting_deadline);
      const now = new Date();
      if (now < deadline) {
        // Voting deadline has not passed yet - can still vote
        // But we can still check if threshold is met early
      }
    }

    const acceptanceThreshold = doc.acceptance_threshold || 75.0;

    // Get eligible voters count using VoterManager (handles both org and personal docs)
    const VoterManager = require('../modules/voting');
    const eligibleVoters = await VoterManager.getEligibleVoters(db, documentId);
    const totalEligible = eligibleVoters.length;

    if (totalEligible === 0) {
      logger.warn('Document has no eligible voters', { documentId });
      return;
    }

    // Get document-level votes
    const votes = await new Promise((resolve, reject) => {
      db.all(`SELECT vote FROM document_votes WHERE document_id = ?`, [documentId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    if (!votes || votes.length === 0) {
      // No votes yet
      return;
    }

    const actualVotes = votes.length;
    const proVotes = votes.filter(v => v.vote === 'PRO').length;
    const contraVotes = votes.filter(v => v.vote === 'CONTRA').length;

    // Check quorum - use stored min_voters_required if available, otherwise calculate from governance rules
    let quorumRequired;
    if (doc.min_voters_required && doc.min_voters_required > 0) {
      quorumRequired = doc.min_voters_required;
    } else {
      // Get governance rules to use defaultQuorumPercentage
      let quorumPercentage = 0.3; // Default 30%
      if (doc.organization_id) {
        try {
          const governanceModule = require('./governance');
          const governanceRules = await governanceModule.getGovernanceRules(db, doc.organization_id);
          if (governanceRules?.defaultQuorumPercentage) {
            quorumPercentage = governanceRules.defaultQuorumPercentage;
          }
        } catch (govErr) {
          logger.warn('Could not fetch governance rules for quorum, using default 30%', { error: govErr.message, organizationId });
        }
      }
      quorumRequired = Math.max(1, Math.ceil(totalEligible * quorumPercentage));
    }
    const quorumMet = actualVotes >= quorumRequired;

    if (!quorumMet) {
      logger.debug('Quorum not met', { documentId, actualVotes, quorumRequired });
      return;
    }

    // Calculate approval percentage based on thresholdCalculationMethod
    let approvalPercentage;
    if (doc.ownership_type === 'organizational' && doc.organization_id) {
      // Get governance rules for calculation method
      let calculationMethod = 'all_votes';
      try {
        const governanceModule = require('./governance');
        const governanceRules = await governanceModule.getGovernanceRules(db, doc.organization_id);
        calculationMethod = governanceRules?.thresholdCalculationMethod || 'all_votes';
      } catch (govErr) {
        logger.warn('Could not fetch governance rules for threshold calculation, using default', { error: govErr.message, documentId: doc.id });
      }
      
      if (calculationMethod === 'all_members') {
        // Calculate as percentage of all eligible members
        approvalPercentage = totalEligible > 0 ? (proVotes / totalEligible) * 100 : 0;
      } else {
        // Calculate as percentage of actual votes cast (all_votes)
        approvalPercentage = actualVotes > 0 ? (proVotes / actualVotes) * 100 : 0;
      }
    } else {
      // For personal/shared documents, use all_votes method
      approvalPercentage = actualVotes > 0 ? (proVotes / actualVotes) * 100 : 0;
    }

    logger.debug('Document voting status', { documentId, proVotes, actualVotes, approvalPercentage, totalEligible, quorumMet });

    // Check if agreement threshold is met
    if (approvalPercentage >= acceptanceThreshold) {
      // Use DocumentStatusManager for proper status transition
      const DocumentStatusManager = require('../modules/document-status');
      await DocumentStatusManager.transitionToAgreed(db, documentId, null);
      
      // Broadcast status change via WebSocket
      const webSocketManager = require('../modules/websocket');
      webSocketManager.broadcastDocumentUpdate(documentId, 'document-status-changed', {
        documentId,
        oldStatus: doc.status,
        newStatus: 'agreed',
        reason: 'approval_threshold_met'
      });
      
      logger.info('Document status updated to agreed - threshold met', { documentId, approvalPercentage, acceptanceThreshold });
    } else {
      logger.debug('Threshold not met', { documentId, approvalPercentage, acceptanceThreshold });
    }
  } catch (error) {
    logger.error('Error checking document agreement status', { error: error.message, stack: error.stack, documentId });
  }
}

/**
 * GET /api/documents/:id/voting-status
 * Get voting status and information for an organizational document
 */
router.get('/:id/voting-status', requireAuth, requireDocumentAccess, async (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.id;
  const userId = req.user.id;

  try {
    // Get document info
    const document = await new Promise((resolve, reject) => {
      db.get(`
        SELECT d.*, o.name as organization_name
        FROM documents d
        LEFT JOIN organizations o ON d.organization_id = o.id
        WHERE d.id = ?
      `, [documentId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (document.ownership_type !== 'organizational') {
      return res.status(400).json({ error: 'Document is not organizational' });
    }

    // Check if user can vote
    const VoterManager = require('../modules/voting');
    const canVote = await VoterManager.canUserVote(db, documentId, userId);

    // Get user's existing vote
    const userVote = await new Promise((resolve, reject) => {
      db.get(`
        SELECT vote FROM document_votes WHERE document_id = ? AND user_id = ?
      `, [documentId, userId], (err, row) => {
        if (err) reject(err);
        else resolve(row?.vote || null);
      });
    });

    // Get vote breakdown
    const votes = await new Promise((resolve, reject) => {
      db.all(`
        SELECT vote, COUNT(*) as count
        FROM document_votes
        WHERE document_id = ?
        GROUP BY vote
      `, [documentId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    const voteBreakdown = { PRO: 0, NEUTRAL: 0, CONTRA: 0 };
    votes.forEach(v => {
      // SQLite COUNT(*) returns as 'count' column - handle both number and string
      const count = typeof v.count === 'number' ? v.count : (parseInt(v.count, 10) || 0);
      if (v.vote && ['PRO', 'NEUTRAL', 'CONTRA'].includes(v.vote)) {
        voteBreakdown[v.vote] = count;
      }
    });

    const totalVotes = Object.values(voteBreakdown).reduce((sum, count) => sum + count, 0);
    const approvalRate = totalVotes > 0 ? (voteBreakdown.PRO / totalVotes) * 100 : 0;

    // Get eligible voters count
    let eligibleVoters = [];
    try {
      eligibleVoters = await VoterManager.getEligibleVoters(db, documentId);
    } catch (voterError) {
      logger.error('Error getting eligible voters', { error: voterError.message, documentId });
      // Continue with empty array if this fails
      eligibleVoters = [];
    }

    res.json({
      document: {
        id: document.id,
        title: document.title,
        status: document.status,
        organizationName: document.organization_name,
        proposalDeadline: document.proposal_deadline,
        votingDeadline: document.voting_deadline,
        votingStartedAt: document.voting_started_at,
        acceptanceThreshold: document.acceptance_threshold,
        minVotersRequired: document.min_voters_required,
        votingAnonymous: !!document.voting_anonymous,
        voteChangeAllowed: !!document.vote_change_allowed
      },
      voting: {
        canVote,
        userVote,
        totalVotes,
        voteBreakdown,
        approvalRate: Math.round(approvalRate * 10) / 10,
        totalEligibleVoters: eligibleVoters.length,
        quorumMet: totalVotes >= (document.min_voters_required || 0),
        quorumRequired: document.min_voters_required || 0
      }
    });

  } catch (error) {
    logger.error('Error getting voting status', { error: error.message, stack: error.stack, documentId });
    res.status(500).json({ 
      error: 'Failed to get voting status',
      details: error.message 
    });
  }
});

/**
 * GET /api/documents/:id/status-history
 * Get status change history for a document
 */
router.get('/:id/status-history', requireAuth, requireDocumentAccess, async (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.id;

  try {
    const DocumentStatusManager = require('../modules/document-status');
    const history = await DocumentStatusManager.getStatusHistory(db, documentId);

    res.json({ history });

  } catch (error) {
    logger.error('Error getting status history', { error: error.message, stack: error.stack, documentId });
    res.status(500).json({ error: 'Failed to get status history' });
  }
});

/**
 * POST /api/documents/:id/start-voting
 * Admin endpoint to manually start voting period (for testing/emergency)
 */
router.post('/:id/start-voting', requireAuth, requireDocumentAccess, async (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.id;
  const userId = req.user.id;

  try {
    // Get document with organization_id to check representative status
    const document = await new Promise((resolve, reject) => {
      db.get('SELECT owner_id, status, organization_id FROM documents WHERE id = ?', [documentId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Check permissions: owner, admin, or representative (for org documents)
    const isOwner = document.owner_id === userId;
    const isAdmin = req.user.role === 'admin';
    const isRep = document.organization_id 
      ? await isRepresentative(db, userId, document.organization_id)
      : false;

    if (!isOwner && !isAdmin && !isRep) {
      return res.status(403).json({ 
        error: 'Only document owner, organization representative, or admin can perform this action' 
      });
    }

    if (document.status !== 'proposal') {
      return res.status(400).json({ error: 'Document must be in proposal status to start voting' });
    }

    const DocumentStatusManager = require('../modules/document-status');
    const result = await DocumentStatusManager.transitionToVoting(db, documentId, userId);

    res.json({
      message: 'Voting period started successfully',
      votingDeadline: result.votingDeadline
    });

  } catch (error) {
    logger.error('Error starting voting', { error: error.message, stack: error.stack, documentId });
    res.status(500).json({ error: 'Failed to start voting period' });
  }
});

/**
 * POST /api/documents/:id/finalize-voting
 * Admin endpoint to manually finalize voting (for testing/emergency)
 */
router.post('/:id/finalize-voting', requireAuth, requireDocumentAccess, async (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.id;
  const userId = req.user.id;

  try {
    // Get document with organization_id to check representative status
    const document = await new Promise((resolve, reject) => {
      db.get('SELECT owner_id, status, organization_id FROM documents WHERE id = ?', [documentId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Check permissions: owner, admin, or representative (for org documents)
    const isOwner = document.owner_id === userId;
    const isAdmin = req.user.role === 'admin';
    const isRep = document.organization_id 
      ? await isRepresentative(db, userId, document.organization_id)
      : false;

    if (!isOwner && !isAdmin && !isRep) {
      return res.status(403).json({ 
        error: 'Only document owner, organization representative, or admin can perform this action' 
      });
    }

    if (document.status !== 'voting') {
      return res.status(400).json({ error: 'Document must be in voting status to finalize' });
    }

    const DocumentStatusManager = require('../modules/document-status');
    const canFinalize = await DocumentStatusManager.canFinalizeVoting(db, documentId);

    if (!canFinalize.canFinalize) {
      return res.status(400).json({ error: canFinalize.reason });
    }

    // Get full document info for finalization
    const doc = await new Promise((resolve, reject) => {
      db.get(`
        SELECT id, title, owner_id, organization_id, acceptance_threshold, min_voters_required
        FROM documents WHERE id = ?
      `, [documentId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    const DocumentScheduler = require('../modules/scheduler');
    const scheduler = new DocumentScheduler(db);
    await scheduler.finalizeVoting(doc);

    res.json({ message: 'Voting finalized successfully' });

  } catch (error) {
    logger.error('Error finalizing voting', { error: error.message, stack: error.stack, documentId });
    res.status(500).json({ error: 'Failed to finalize voting' });
  }
});

// Propose document deletion (representatives only for organizational documents)
router.post('/:id/propose-deletion', requireAuth, requireDocumentAccess, async (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.id;
  const userId = req.user.id;

  try {
    // Get document info
    const document = await new Promise((resolve, reject) => {
      db.get(`
        SELECT id, title, organization_id, ownership_type, deletion_proposed_at
        FROM documents WHERE id = ?
      `, [documentId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Check if deletion already proposed
    if (document.deletion_proposed_at) {
      return res.status(400).json({ error: 'Deletion already proposed for this document' });
    }

    // For organizational documents, check if user is a representative
    if (document.ownership_type === 'organizational' && document.organization_id) {
      const isRepresentative = await new Promise((resolve, reject) => {
        db.get(`
          SELECT COUNT(*) as count FROM organization_representatives
          WHERE organization_id = ? AND user_id = ? AND status = 'active'
        `, [document.organization_id, userId], (err, row) => {
          if (err) reject(err);
          else resolve((row?.count || 0) > 0);
        });
      });

      if (!isRepresentative) {
        return res.status(403).json({ error: 'Only representatives can propose deletion of organizational documents' });
      }
    } else {
      // For personal/shared documents, only owner can propose deletion
      if (document.owner_id !== userId) {
        return res.status(403).json({ error: 'Only the document owner can propose deletion' });
      }
    }

    // Get governance rules for deletion vote deadline
    let voteDeadlineDays = 7; // Default
    if (document.organization_id) {
      try {
        const governanceModule = require('./governance');
        const governanceRules = await governanceModule.getGovernanceRules(db, document.organization_id);
        if (governanceRules?.defaultVotingDeadlineHours) {
          voteDeadlineDays = Math.ceil(governanceRules.defaultVotingDeadlineHours / 24);
        }
      } catch (govErr) {
        logger.warn('Could not fetch governance rules for deletion vote deadline, using default', { error: govErr.message, documentId: document.id });
      }
    }

    const voteDeadline = new Date();
    voteDeadline.setDate(voteDeadline.getDate() + voteDeadlineDays);

    // Update document with deletion proposal
    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE documents
        SET deletion_proposed_at = CURRENT_TIMESTAMP,
            deletion_proposed_by = ?,
            deletion_vote_deadline = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [userId, voteDeadline.toISOString(), documentId], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });

    // Log status change
    const DocumentStatusManager = require('../modules/document-status');
    await DocumentStatusManager.logStatusChange(db, documentId, document.status, document.status, userId, 'deletion_proposed');

    // Broadcast WebSocket update
    webSocketManager.broadcastDocumentUpdate(documentId, 'deletion-proposed', {
      documentId,
      proposedBy: userId,
      voteDeadline: voteDeadline.toISOString()
    });

    res.json({
      message: 'Deletion proposal created successfully',
      voteDeadline: voteDeadline.toISOString()
    });

  } catch (error) {
    logger.error('Error proposing deletion', { error: error.message, stack: error.stack, documentId });
    res.status(500).json({ error: 'Failed to propose deletion' });
  }
});

// Vote on document deletion
router.post('/:id/vote-deletion', requireAuth, requireDocumentAccess, async (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.id;
  const userId = req.user.id;
  const { vote } = req.body;

  if (!['PRO', 'NEUTRAL', 'CONTRA'].includes(vote)) {
    return res.status(400).json({ error: 'Invalid vote type. Must be PRO, NEUTRAL, or CONTRA' });
  }

  try {
    // Check if deletion is proposed
    const document = await new Promise((resolve, reject) => {
      db.get(`
        SELECT id, deletion_proposed_at, deletion_vote_deadline, organization_id, ownership_type
        FROM documents WHERE id = ?
      `, [documentId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (!document.deletion_proposed_at) {
      return res.status(400).json({ error: 'Deletion not proposed for this document' });
    }

    // Check if deadline passed
    if (document.deletion_vote_deadline && new Date() > new Date(document.deletion_vote_deadline)) {
      return res.status(403).json({ error: 'Deletion vote deadline has passed' });
    }

    // Check if user is eligible to vote (organization member for org docs)
    if (document.ownership_type === 'organizational' && document.organization_id) {
      const isMember = await new Promise((resolve, reject) => {
        db.get(`
          SELECT COUNT(*) as count FROM organization_members
          WHERE organization_id = ? AND user_id = ? AND status = 'active'
        `, [document.organization_id, userId], (err, row) => {
          if (err) reject(err);
          else resolve((row?.count || 0) > 0);
        });
      });

      if (!isMember) {
        return res.status(403).json({ error: 'Only organization members can vote on deletion' });
      }
    }

    // Check if user already voted
    const existingVote = await new Promise((resolve, reject) => {
      db.get(`
        SELECT id, vote FROM document_deletion_votes
        WHERE document_id = ? AND user_id = ?
      `, [documentId, userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (existingVote) {
      // Update existing vote
      await new Promise((resolve, reject) => {
        db.run(`
          UPDATE document_deletion_votes
          SET vote = ?, created_at = CURRENT_TIMESTAMP
          WHERE document_id = ? AND user_id = ?
        `, [vote, documentId, userId], function(err) {
          if (err) reject(err);
          else resolve();
        });
      });
    } else {
      // Insert new vote
      const voteId = uuidv4();
      await new Promise((resolve, reject) => {
        db.run(`
          INSERT INTO document_deletion_votes (id, document_id, user_id, vote)
          VALUES (?, ?, ?, ?)
        `, [voteId, documentId, userId, vote], function(err) {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    // Get all deletion votes for broadcast
    const votes = await new Promise((resolve, reject) => {
      db.all(`
        SELECT ddv.*, u.name as user_name
        FROM document_deletion_votes ddv
        LEFT JOIN users u ON ddv.user_id = u.id
        WHERE ddv.document_id = ?
        ORDER BY ddv.created_at ASC
      `, [documentId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    // Broadcast WebSocket update
    webSocketManager.broadcastDocumentUpdate(documentId, 'deletion-vote', {
      documentId,
      votes: votes.map(v => ({
        id: v.id,
        userId: v.user_id,
        vote: v.vote,
        userName: v.user_name,
        createdAt: v.created_at
      })),
      action: existingVote ? 'updated' : 'cast'
    });

    res.json({ message: existingVote ? 'Vote updated successfully' : 'Vote cast successfully' });

  } catch (error) {
    logger.error('Error voting on deletion', { error: error.message, stack: error.stack, documentId });
    res.status(500).json({ error: 'Failed to cast deletion vote' });
  }
});

// Cancel deletion proposal (only by proposer or representative)
router.post('/:id/cancel-deletion', requireAuth, requireDocumentAccess, async (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.id;
  const userId = req.user.id;

  try {
    const document = await new Promise((resolve, reject) => {
      db.get(`
        SELECT id, deletion_proposed_by, organization_id, ownership_type
        FROM documents WHERE id = ?
      `, [documentId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (!document.deletion_proposed_by) {
      return res.status(400).json({ error: 'No deletion proposal exists for this document' });
    }

    // Check if user can cancel (proposer or representative for org docs)
    let canCancel = false;
    if (document.deletion_proposed_by === userId) {
      canCancel = true;
    } else if (document.ownership_type === 'organizational' && document.organization_id) {
      const isRepresentative = await new Promise((resolve, reject) => {
        db.get(`
          SELECT COUNT(*) as count FROM organization_representatives
          WHERE organization_id = ? AND user_id = ? AND status = 'active'
        `, [document.organization_id, userId], (err, row) => {
          if (err) reject(err);
          else resolve((row?.count || 0) > 0);
        });
      });
      canCancel = isRepresentative;
    }

    if (!canCancel) {
      return res.status(403).json({ error: 'Only the proposer or a representative can cancel deletion' });
    }

    // Cancel deletion proposal
    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE documents
        SET deletion_proposed_at = NULL,
            deletion_proposed_by = NULL,
            deletion_vote_deadline = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [documentId], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });

    // Delete all deletion votes
    await new Promise((resolve, reject) => {
      db.run(`DELETE FROM document_deletion_votes WHERE document_id = ?`, [documentId], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });

    // Broadcast WebSocket update
    webSocketManager.broadcastDocumentUpdate(documentId, 'deletion-cancelled', {
      documentId,
      cancelledBy: userId
    });

    res.json({ message: 'Deletion proposal cancelled successfully' });

  } catch (error) {
    logger.error('Error cancelling deletion', { error: error.message, stack: error.stack, documentId });
    res.status(500).json({ error: 'Failed to cancel deletion proposal' });
  }
});

// Get deletion status
router.get('/:id/deletion-status', requireAuth, requireDocumentAccess, async (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.id;

  try {
    const document = await new Promise((resolve, reject) => {
      db.get(`
        SELECT deletion_proposed_at, deletion_proposed_by, deletion_vote_deadline,
               organization_id, ownership_type
        FROM documents WHERE id = ?
      `, [documentId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (!document.deletion_proposed_at) {
      return res.json({ proposed: false });
    }

    // Get votes
    const votes = await new Promise((resolve, reject) => {
      db.all(`
        SELECT vote, COUNT(*) as count
        FROM document_deletion_votes
        WHERE document_id = ?
        GROUP BY vote
      `, [documentId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    const voteBreakdown = { PRO: 0, NEUTRAL: 0, CONTRA: 0 };
    votes.forEach(v => {
      // SQLite COUNT(*) returns as 'count' column - handle both number and string
      const count = typeof v.count === 'number' ? v.count : (parseInt(v.count, 10) || 0);
      if (v.vote && ['PRO', 'NEUTRAL', 'CONTRA'].includes(v.vote)) {
        voteBreakdown[v.vote] = count;
      }
    });

    const totalVotes = voteBreakdown.PRO + voteBreakdown.NEUTRAL + voteBreakdown.CONTRA;
    const approvalRate = totalVotes > 0 ? (voteBreakdown.PRO / totalVotes) * 100 : 0;

    // Get eligible voters count
    let eligibleVoters = 0;
    if (document.organization_id) {
      const memberCount = await new Promise((resolve, reject) => {
        db.get(`
          SELECT COUNT(*) as count FROM organization_members
          WHERE organization_id = ? AND status = 'active'
        `, [document.organization_id], (err, row) => {
          if (err) reject(err);
          else resolve(row?.count || 0);
        });
      });
      eligibleVoters = memberCount;
    }

    res.json({
      proposed: true,
      proposedAt: document.deletion_proposed_at,
      proposedBy: document.deletion_proposed_by,
      voteDeadline: document.deletion_vote_deadline,
      votes: {
        total: totalVotes,
        breakdown: voteBreakdown,
        approvalRate: Math.round(approvalRate * 10) / 10
      },
      eligibleVoters,
      quorumRequired: Math.max(1, Math.ceil(eligibleVoters * 0.3)),
      quorumMet: totalVotes >= Math.max(1, Math.ceil(eligibleVoters * 0.3))
    });

  } catch (error) {
    logger.error('Error getting deletion status', { error: error.message, stack: error.stack, documentId });
    res.status(500).json({ error: 'Failed to get deletion status' });
  }
});

module.exports = router;