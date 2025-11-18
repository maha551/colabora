const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { metricsCollector } = require('../middleware/monitoring');
const { documentValidation } = require('../middleware/validation');
const { requireAuth, requireDocumentAccess } = require('../middleware/auth');

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
    timestamp: new Date().toISOString(),
    level,
    event,
    service: 'document-service',
    ...data
  };

  console.log(JSON.stringify(logEntry));

  // In production, you might want to send to a logging service
  // logService.send(logEntry);
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
    console.log('🏦 Starting transaction...');
    await new Promise((resolve, reject) => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          console.error('❌ Failed to begin transaction:', err);
          reject(err);
        } else {
          transactionStarted = true;
          console.log('✅ Transaction started successfully');
          resolve();
        }
      });
    });

    const result = await operation();

    console.log('💾 Committing transaction...');
    await new Promise((resolve, reject) => {
      db.run('COMMIT', (err) => {
        if (err) {
          console.error('❌ Failed to commit transaction:', err);
          reject(err);
        } else {
          console.log('✅ Transaction committed successfully');
          resolve();
        }
      });
    });

    return result;

  } catch (error) {
    console.error('❌ Transaction operation failed:', error);

    if (transactionStarted) {
      console.log('🔄 Rolling back transaction...');
      try {
        await new Promise((resolve) => {
          db.run('ROLLBACK', (err) => {
            if (err) {
              console.error('❌ Rollback failed:', err);
            } else {
              console.log('✅ Transaction rolled back successfully');
            }
            resolve(); // Always resolve to avoid blocking
          });
        });
      } catch (rollbackError) {
        console.error('❌ Critical: Rollback operation failed:', rollbackError);
      }
    }

    throw error;
  }
}

// Helper function to build document creation SQL and parameters
function buildDocumentInsertSQL(ownershipType, organizationId, options, documentId, trimmedTitle, trimmedDescription, userId, parentId) {
  console.log('🔨 Building document INSERT SQL for type:', ownershipType);

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
    console.log('🏢 Building organizational document SQL');
    // For organizational documents, set organization_id and start as proposal
    const proposalDeadline = new Date();
    proposalDeadline.setDate(proposalDeadline.getDate() + DOCUMENT_CONFIG.DEFAULT_PROPOSAL_PERIOD_DAYS);
    console.log('📅 Proposal deadline:', proposalDeadline.toISOString());

    // Ensure proposalDeadline is valid
    if (isNaN(proposalDeadline.getTime())) {
      throw new Error('Failed to generate valid proposal deadline');
    }

    sql = `
      INSERT INTO documents (
        id, title, description, owner_id, ownership_type, creator_ids, organization_id, parent_id, status, proposal_deadline,
        acceptance_threshold, voting_anonymous, voting_anonymity_locked, vote_change_allowed,
        structure_proposals_enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    // Ensure acceptanceThreshold is valid
    const finalAcceptanceThreshold = (typeof acceptanceThreshold === 'number' && !isNaN(acceptanceThreshold))
      ? acceptanceThreshold : DOCUMENT_CONFIG.DEFAULT_ACCEPTANCE_THRESHOLD;

    params = [
      documentId, trimmedTitle, trimmedDescription, userId, ownershipType, null, organizationId, parentId || null,
      'proposal', proposalDeadline.toISOString(),
      finalAcceptanceThreshold, votingAnonymous, votingAnonymityLocked, voteChangeAllowed, structureProposalsEnabled
    ];
    console.log('📋 Organizational SQL params built successfully');
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

  return { sql, params, acceptanceThreshold, votingAnonymous, votingAnonymityLocked, voteChangeAllowed, structureProposalsEnabled };
}

// Helper function to create initial title paragraph
async function createInitialParagraph(db, documentId, title, description) {
  console.log('📝 Creating initial title paragraph for document:', documentId);

  const paragraphId = uuidv4();
  const paragraphTitle = title;
  const paragraphText = description || title;

  return new Promise((resolve, reject) => {
    db.run(`
      INSERT INTO paragraphs (
        id, document_id, title, text, order_index, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [paragraphId, documentId, paragraphTitle, paragraphText, -1], function(err) {
      if (err) {
        console.error('❌ Error creating title paragraph:', err);
        reject(new Error(`Failed to create title paragraph: ${err.message}`));
      } else {
        console.log('✅ Title paragraph created successfully, ID:', paragraphId);
        resolve(paragraphId);
      }
    });
  });
}

// Helper function to add collaborators sequentially
async function addCollaborators(db, documentId, ownershipType, organizationId, userId, creatorIds) {
  console.log('👥 Adding collaborators for document:', documentId);

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
            console.error('❌ Error adding collaborator:', creatorId, err);
            reject(new Error(`Failed to add collaborator ${creatorId}: ${err.message}`));
          } else {
            console.log('✅ Added collaborator:', creatorId);
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
            console.error('❌ Error adding organizational collaborator:', member.user_id, err);
            reject(new Error(`Failed to add organizational collaborator ${member.user_id}: ${err.message}`));
          } else {
            console.log('✅ Added organizational collaborator:', member.user_id);
            resolve();
          }
        });
      });
    }

    console.log(`✅ Added ${members.length} organizational collaborators`);
  }

  console.log('✅ Collaborator addition completed');
}

// Helper function to build document response
async function buildDocumentResponse(db, documentId, trimmedTitle, trimmedDescription, userId, ownershipType, organizationId, parentId, options) {
  console.log('📋 Building document response for:', documentId);

  // Get user details for owner information
  const user = await new Promise((resolve, reject) => {
    db.get('SELECT name, email FROM users WHERE id = ?', [userId], (err, row) => {
      if (err) reject(err);
      else if (!row) reject(new Error('User not found'));
      else resolve(row);
    });
  });

  const result = {
    id: documentId,
    title: trimmedTitle,
    description: trimmedDescription,
    ownerId: userId,
    parentId: parentId || undefined,
    status: ownershipType === 'organizational' ? 'proposal' : 'draft',
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

  console.log('✅ Document response built successfully');
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

  console.log('Executing documents query for user:', userId);
  console.log('Query:', query);

  // Execute main documents query first
  db.all(query, [userId, userId, userId], (err, documents) => {
    if (err) {
      console.error('Error fetching documents:', err);
      return res.status(500).json({ error: 'Failed to fetch documents' });
    }

    console.log('Found', documents.length, 'documents for user');

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
      console.error('Error fetching document data:', err);
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
      console.error('Error checking organization membership:', err);
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
        console.error('Error fetching organization documents:', err);
        return res.status(500).json({
          error: 'Failed to fetch organization documents',
          details: err.message
        });
      }

      console.log(`Found ${documents ? documents.length : 0} documents for organization ${organizationId}`);

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
                console.error('Error fetching organization members for document:', doc.id, err);
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
                console.error('Error fetching collaborators for document:', doc.id, err);
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
        console.error('Error processing documents:', err);
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

  const accessQuery = `
    SELECT d.*,
           u.name as owner_name,
           u.email as owner_email
    FROM documents d
    JOIN users u ON d.owner_id = u.id
    LEFT JOIN document_collaborators dc ON d.id = dc.document_id
    WHERE d.id = ? AND (d.owner_id = ? OR dc.user_id = ?)
  `;

  db.get(accessQuery, [documentId, userId, userId], (err, document) => {
    if (err) {
      console.error('Error fetching document:', err);
      return res.status(500).json({ error: 'Failed to fetch document' });
    }

    if (!document) {
      return res.status(404).json({ error: 'Document not found or access denied' });
    }


    const paragraphsQuery = `
      SELECT p.*
      FROM paragraphs p
      WHERE p.document_id = ?
      ORDER BY p.order_index
    `;

    db.all(paragraphsQuery, [documentId], (err, paragraphs) => {
      if (err) {
        console.error('Error fetching paragraphs:', err);
        return res.status(500).json({ error: 'Failed to fetch document content' });
      }

      const buildParagraphData = (para) => {
        return new Promise((resolve) => {
          const proposalsQuery = `
            SELECT pr.*,
                   u.name as user_name,
                   u.email as user_email
            FROM proposals pr
            LEFT JOIN users u ON pr.user_id = u.id
            WHERE pr.paragraph_id = ?
            ORDER BY pr.created_at ASC
          `;

          db.all(proposalsQuery, [para.id], (proposalErr, proposals) => {
            if (proposalErr) {
              console.error('Error fetching proposals:', proposalErr);
              return resolve({
                ...para,
                order: para.order_index,
                heading_level: para.heading_level,
                proposals: [],
                suggestions: [],
                history: []
              });
            }

            const enrichProposal = (prop) => {
              return new Promise((resolveProposal) => {
                // Get document voting_anonymous setting
                db.get(`SELECT voting_anonymous FROM documents WHERE id = ?`, [documentId], (docErr, doc) => {
                  const isAnonymous = doc?.voting_anonymous === 1;

                  const votesQuery = `
                    SELECT v.*,
                           u.name as user_name,
                           u.email as user_email
                    FROM votes v
                    LEFT JOIN users u ON v.user_id = u.id
                    WHERE v.proposal_id = ?
                    ORDER BY v.created_at ASC
                  `;

                  const commentsQuery = `
                    SELECT c.*,
                           u.name as user_name,
                           u.email as user_email,
                           pc.user_id as parent_user_id,
                           pu.name as parent_user_name
                    FROM comments c
                    LEFT JOIN users u ON c.user_id = u.id
                    LEFT JOIN comments pc ON c.parent_id = pc.id
                    LEFT JOIN users pu ON pc.user_id = pu.id
                    WHERE c.proposal_id = ?
                    ORDER BY c.created_at ASC
                  `;

                  const historyQuery = `
                    SELECT 
                      h.id,
                      h.paragraph_id,
                      h.user_id,
                      h.old_text,
                      h.new_text,
                      h.approval_percentage,
                      h.proposal_id,
                      h.created_at,
                      h.heading_level,
                      u.name as user_name,
                      u.email as user_email,
                      pr.type as proposal_type
                    FROM history h
                    JOIN users u ON h.user_id = u.id
                    LEFT JOIN proposals pr ON h.proposal_id = pr.id
                    WHERE h.paragraph_id = ?
                    ORDER BY h.created_at DESC
                  `;

                  const fetchVotes = new Promise((resolveVotes) => {
                    db.all(votesQuery, [prop.id], (votesErr, voteRows) => {
                      if (votesErr) {
                        console.error('Error fetching votes:', votesErr);
                        return resolveVotes([]);
                      }

                      const votes = (voteRows || []).map((vote) => {
                        const voteData = {
                          ...vote,
                          proposalId: vote.proposal_id,
                          vote: vote.vote
                        };

                        // Hide user info if voting is anonymous
                        if (!isAnonymous) {
                          voteData.userId = vote.user_id;
                          voteData.user = {
                            id: vote.user_id,
                            name: vote.user_name,
                            email: vote.user_email
                          };
                        } else {
                          // In anonymous mode, only include userId for the current user's own vote
                          // This allows users to see their own vote while hiding others
                          if (vote.user_id === userId) {
                            voteData.userId = vote.user_id;
                          }
                          // Don't include user object or userId for other users
                        }

                        return voteData;
                      });

                      resolveVotes(votes);
                    });
                  });

                const fetchComments = new Promise((resolveComments) => {
                  db.all(commentsQuery, [prop.id], (commentsErr, commentRows) => {
                    if (commentsErr) {
                      console.error('Error fetching comments:', commentsErr);
                      return resolveComments([]);
                    }

                    const comments = (commentRows || []).map((comment) => ({
                      ...comment,
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

                    resolveComments(comments);
                  });
                });

                  Promise.all([fetchVotes, fetchComments]).then(([votes, comments]) => {
                    resolveProposal({
                      ...prop,
                      heading_level: prop.heading_level,
                      user: {
                        id: prop.user_id,
                        name: prop.user_name,
                        email: prop.user_email
                      },
                      votes,
                      comments
                    });
                  });
                });
              });
            };

            Promise.all(proposals.map(enrichProposal)).then((enrichedProposals) => {
              db.all(
                `
                SELECT 
                  h.id,
                  h.paragraph_id,
                  h.user_id,
                  h.old_text,
                  h.new_text,
                  h.approval_percentage,
                  h.proposal_id,
                  h.created_at,
                  h.heading_level,
                  u.name as user_name,
                  u.email as user_email,
                  pr.type as proposal_type
                FROM history h
                JOIN users u ON h.user_id = u.id
                LEFT JOIN proposals pr ON h.proposal_id = pr.id
                WHERE h.paragraph_id = ?
                ORDER BY h.created_at DESC
              `,
                [para.id],
                (historyErr, historyRows) => {
                  if (historyErr) {
                    console.error('Error fetching history:', historyErr);
                  }

                  const historyEntries = (historyRows || []).map((entry) => ({
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

                  resolve({
                    ...para,
                    order: para.order_index,
                    heading_level: para.heading_level,
                    proposals: enrichedProposals,
                    suggestions: enrichedProposals,
                    history: historyEntries
                  });
                }
              );
            });
          });
        });
      };

      Promise.all(paragraphs.map(buildParagraphData)).then((paragraphData) => {
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
            console.error('Error fetching collaborators:', collabErr);
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
      errors: inputValidation.errors
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
          await createDocument(ownershipType, organizationId, options, userId, title, description, creatorIds, parentId);
          logDocumentSuccess('organizational_document_created', {
            userId,
            organizationId,
            title: title.substring(0, 50)
          });
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
      await createDocument(ownershipType, organizationId, options, userId, title, description, creatorIds, parentId);
      logDocumentSuccess('document_created', {
        userId,
        ownershipType,
        organizationId,
        title: title.substring(0, 50)
      });
    } catch (error) {
      logDocumentError('DOC_CREATION_FAILED', 'Error in document creation', {
        userId,
        ownershipType,
        organizationId,
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        error: 'Failed to create document',
        details: error.message,
        code: error.code || 'DOC_CREATION_FAILED'
      });
    }
  })();
});
  async function createDocument(ownershipType, organizationId, options, userId, title, description, creatorIds, parentId) {
    console.log('🚀 Starting createDocument function');
    console.log('Input params:', { ownershipType, organizationId, userId, title, description, parentId });

    const documentId = uuidv4();
    const trimmedTitle = title.trim();
    const trimmedDescription = description ? description.trim() : null;

    console.log('📄 Generated document ID:', documentId);
    console.log('📝 Title:', trimmedTitle);
    console.log('🏷️  Ownership type:', ownershipType);

    // Build the SQL query based on ownership type
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
        documentId, trimmedTitle, trimmedDescription, userId, ownershipType, JSON.stringify(creatorIds), null, parentId || null,
        acceptanceThreshold, votingAnonymous, votingAnonymityLocked, voteChangeAllowed, structureProposalsEnabled
      ];
    } else if (ownershipType === 'organizational') {
      console.log('🏢 Building organizational document SQL');
      // For organizational documents, set organization_id and start as proposal
      const proposalDeadline = new Date();
      proposalDeadline.setDate(proposalDeadline.getDate() + DOCUMENT_CONFIG.DEFAULT_PROPOSAL_PERIOD_DAYS);
      console.log('📅 Proposal deadline:', proposalDeadline.toISOString());

      // Ensure proposalDeadline is valid
      if (isNaN(proposalDeadline.getTime())) {
        console.error('Invalid proposal deadline generated');
        return res.status(500).json({ error: 'Failed to generate proposal deadline' });
      }

      sql = `
        INSERT INTO documents (
          id, title, description, owner_id, ownership_type, creator_ids, organization_id, parent_id, status, proposal_deadline,
          acceptance_threshold, voting_anonymous, voting_anonymity_locked, vote_change_allowed,
          structure_proposals_enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;
      // Ensure acceptanceThreshold is valid
      const finalAcceptanceThreshold = (typeof acceptanceThreshold === 'number' && !isNaN(acceptanceThreshold))
        ? acceptanceThreshold : DOCUMENT_CONFIG.DEFAULT_ACCEPTANCE_THRESHOLD;

      params = [
        documentId, trimmedTitle, trimmedDescription, userId, ownershipType, null, organizationId, parentId || null,
        'proposal', proposalDeadline.toISOString(),
        finalAcceptanceThreshold, votingAnonymous, votingAnonymityLocked, voteChangeAllowed, structureProposalsEnabled
      ];
      console.log('📋 Organizational SQL params:', params);
      console.log('Final acceptance threshold:', finalAcceptanceThreshold);
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

    continueExecution();

    function continueExecution() {
    console.log('🔄 Calling continueExecution()');
    console.log('📝 Final SQL:', sql);
    console.log('📊 Final params:', params);

    // Use transaction for atomic document creation
    try {
      console.log('🏦 Starting transaction for document creation...');
      db.run('BEGIN TRANSACTION', (beginErr) => {
        if (beginErr) {
          console.error('❌ Error beginning transaction:', beginErr);
          console.error('Transaction begin error details:', beginErr.message);
          console.error('Transaction begin error code:', beginErr.code);
          throw new Error(`Transaction begin failed: ${beginErr.message}`);
        }

        console.log('✅ Transaction started successfully');

        console.log('💾 Executing document INSERT...');
        db.run(sql, params, function(err) {
          if (err) {
            console.error('❌ Error creating document:', err);
            console.error('SQL Error details:', err.message);
            console.error('SQL Error code:', err.code);
            console.error('SQL:', sql.substring(0, 200) + '...');
            console.error('Params:', params);
            db.run('ROLLBACK', (rollbackErr) => {
              if (rollbackErr) {
                console.error('Error during rollback after document creation failure:', rollbackErr);
              }
              // Send error response
              if (!res.headersSent) {
                return res.status(500).json({
                  error: 'Failed to create document',
                  details: err.message,
                  code: err.code
                });
              } else {
                console.error('Response already sent, cannot send error response');
              }
            });
            return;
          }

          console.log('✅ Document inserted successfully, ID:', this.lastID);

        console.log('Document created in database, now creating initial paragraph...');

        // Declare responseSent and sendResponse BEFORE they're used
        let responseSent = false; // Prevent multiple responses
        
        function sendResponse() {
          // Prevent multiple responses
          if (responseSent) {
            console.warn('Attempted to send response multiple times for document creation');
            return;
          }
          
          // Get user details for owner information
          db.get('SELECT name, email FROM users WHERE id = ?', [userId], (err, user) => {
            if (err) {
              console.error('Error fetching user details:', err);
              console.error('User ID:', userId);
              if (!responseSent) {
                responseSent = true;
                return res.status(500).json({ 
                  error: 'Failed to create document',
                  details: 'Error fetching user details: ' + err.message
                });
              }
              return;
            }

            if (!user) {
              console.error('User not found:', userId);
              if (!responseSent) {
                responseSent = true;
                return res.status(500).json({ 
                  error: 'Failed to create document',
                  details: 'User not found'
                });
              }
              return;
            }

            const result = {
              id: documentId,
              title: trimmedTitle,
              description: trimmedDescription,
              ownerId: userId,
              parentId: parentId || undefined,
              status: ownershipType === 'organizational' ? 'proposal' : 'draft', // Organizational docs start as proposals
              owner: {
                id: userId,
                name: user.name,
                email: user.email
              },
              ownershipType,
              organizationId: ownershipType === 'organizational' ? organizationId : null,
              options: {
                acceptanceThreshold,
                votingAnonymous: votingAnonymous === 1,
                votingAnonymityLocked: votingAnonymityLocked === 1,
                voteChangeAllowed: voteChangeAllowed === 1,
                structureProposalsEnabled: structureProposalsEnabled === 1
              },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            console.log('Document created successfully:', { id: documentId, title: trimmedTitle });

            // Record business metrics
            try {
              metricsCollector.recordBusinessEvent('document_created', {
                documentId,
                ownerId: userId,
                ownershipType,
                organizationId: ownershipType === 'organizational' ? organizationId : null
              });
            } catch (metricsErr) {
              console.error('Error recording metrics:', metricsErr);
              // Don't fail the request if metrics fail
            }

            if (!responseSent) {
              responseSent = true;
              res.status(201).json({ document: result });
            }
          });
        }

        // Create initial title paragraph - CRITICAL: must succeed
        const paragraphId = uuidv4();
        db.run(`
          INSERT INTO paragraphs (
            id, document_id, title, text, order_index, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [paragraphId, documentId, trimmedTitle, trimmedDescription || trimmedTitle, -1], function(err) {
          if (err) {
            console.error('Error creating title paragraph:', err);
            console.error('Paragraph creation error details:', err.message);
            console.error('Paragraph creation SQL error code:', err.code);
            console.error('Document ID:', documentId);
            console.error('Paragraph ID:', paragraphId);
            db.run('ROLLBACK', (rollbackErr) => {
              if (rollbackErr) {
                console.error('Error during rollback:', rollbackErr);
              }
              if (!responseSent) {
                responseSent = true;
                return res.status(500).json({
                  error: 'Failed to create document: title paragraph creation failed',
                  details: err.message,
                  code: err.code
                });
              }
            });
            return;
          }

          // Add creators as collaborators if it's a shared document
          if (ownershipType === 'shared' && creatorIds) {
            // Serialize collaborator additions (SQLite doesn't handle concurrent writes well in transactions)
            const collaboratorsToAdd = creatorIds.filter(creatorId => creatorId !== userId); // Don't add owner as collaborator
            
            if (collaboratorsToAdd.length === 0) {
              // No collaborators to add, commit transaction
              db.run('COMMIT', (commitErr) => {
                if (commitErr) {
                  console.error('Error committing transaction:', commitErr);
                  console.error('Commit error details:', commitErr.message);
                  db.run('ROLLBACK', (rollbackErr) => {
                    if (rollbackErr) {
                      console.error('Error during rollback after commit failure:', rollbackErr);
                    }
                    if (!res.headersSent) {
                      return res.status(500).json({ 
                        error: 'Failed to create document: commit failed',
                        details: commitErr.message
                      });
                    }
                  });
                  return;
                }
                sendResponse();
              });
            } else {
              // Add collaborators sequentially
              let collaboratorIndex = 0;
              
              const addNextCollaborator = () => {
                if (collaboratorIndex >= collaboratorsToAdd.length) {
                  // All collaborators added successfully, commit transaction
                  db.run('COMMIT', (commitErr) => {
                    if (commitErr) {
                      console.error('Error committing transaction:', commitErr);
                      console.error('Commit error details:', commitErr.message);
                      db.run('ROLLBACK', (rollbackErr) => {
                        if (rollbackErr) {
                          console.error('Error during rollback after commit failure:', rollbackErr);
                        }
                        if (!res.headersSent) {
                          return res.status(500).json({ 
                            error: 'Failed to create document: commit failed',
                            details: commitErr.message
                          });
                        }
                      });
                      return;
                    }
                    sendResponse();
                  });
                  return;
                }
                
                const creatorId = collaboratorsToAdd[collaboratorIndex];
                const collabId = uuidv4();
                db.run(`
                  INSERT INTO document_collaborators (id, document_id, user_id)
                  VALUES (?, ?, ?)
                `, [collabId, documentId, creatorId], function(err) {
                  if (err) {
                    console.error('Error adding collaborator:', creatorId, err);
                    console.error('Collaborator addition error details:', err.message);
                    db.run('ROLLBACK', (rollbackErr) => {
                      if (rollbackErr) {
                        console.error('Error during rollback after collaborator addition failure:', rollbackErr);
                      }
                      if (!res.headersSent) {
                        return res.status(500).json({
                          error: 'Failed to create document: collaborator addition failed',
                          details: err.message
                        });
                      }
                    });
                    return;
                  }
                  collaboratorIndex++;
                  addNextCollaborator();
                });
              };
              
              addNextCollaborator();
            }
          } else if (ownershipType === 'organizational') {
            // For organizational documents, add all active organization members as collaborators
            // (excluding the document owner who is already associated with the document)
            db.all(`
              SELECT user_id FROM organization_members
              WHERE organization_id = ? AND status = 'active' AND user_id != ?
            `, [organizationId, userId], (membersErr, members) => {
              if (membersErr) {
                console.error('Error fetching organization members:', membersErr);
                db.run('ROLLBACK', (rollbackErr) => {
                  if (rollbackErr) {
                    console.error('Error during rollback after member fetch failure:', rollbackErr);
                  }
                  if (!res.headersSent) {
                    return res.status(500).json({
                      error: 'Failed to create document: member fetch failed',
                      details: membersErr.message
                    });
                  }
                });
                return;
              }

              if (members.length === 0) {
                // No members to add as collaborators (owner already excluded), just commit
                db.run('COMMIT', (commitErr) => {
                  if (commitErr) {
                    console.error('Error committing transaction:', commitErr);
                    db.run('ROLLBACK', (rollbackErr) => {
                      if (rollbackErr) {
                        console.error('Error during rollback after commit failure:', rollbackErr);
                      }
                      if (!res.headersSent) {
                        return res.status(500).json({
                          error: 'Failed to create document: commit failed',
                          details: commitErr.message
                        });
                      }
                    });
                    return;
                  }
                  console.log(`Created organizational document ${documentId} - no additional members to add as collaborators`);
                  sendResponse();
                });
                return;
              }

              // Add all organization members (except owner) as collaborators
              let collaboratorIndex = 0;
              const totalCollaborators = members.length;

              const addNextCollaborator = () => {
                if (collaboratorIndex >= totalCollaborators) {
                  // All collaborators added successfully, commit transaction
                  db.run('COMMIT', (commitErr) => {
                    if (commitErr) {
                      console.error('Error committing transaction:', commitErr);
                      db.run('ROLLBACK', (rollbackErr) => {
                        if (rollbackErr) {
                          console.error('Error during rollback after commit failure:', rollbackErr);
                        }
                        if (!res.headersSent) {
                          return res.status(500).json({
                            error: 'Failed to create document: commit failed',
                            details: commitErr.message
                          });
                        }
                      });
                      return;
                    }
                    console.log(`Created organizational document ${documentId} - added ${totalCollaborators} collaborators`);
                    sendResponse();
                  });
                  return;
                }

                const memberId = members[collaboratorIndex].user_id;
                const collabId = uuidv4();
                db.run(`
                  INSERT INTO document_collaborators (id, document_id, user_id)
                  VALUES (?, ?, ?)
                `, [collabId, documentId, memberId], function(err) {
                  if (err) {
                    console.error('Error adding organizational collaborator:', memberId, err);
                    db.run('ROLLBACK', (rollbackErr) => {
                      if (rollbackErr) {
                        console.error('Error during rollback after collaborator addition failure:', rollbackErr);
                      }
                      if (!res.headersSent) {
                        return res.status(500).json({
                          error: 'Failed to create document: collaborator addition failed',
                          details: err.message
                        });
                      }
                    });
                    return;
                  }
                  collaboratorIndex++;
                  addNextCollaborator();
                });
              };

              addNextCollaborator();
            });
          } else {
            // For personal documents, no collaborators to add, commit transaction
            db.run('COMMIT', (commitErr) => {
              if (commitErr) {
                console.error('Error committing transaction:', commitErr);
                console.error('Commit error details:', commitErr.message);
                db.run('ROLLBACK', (rollbackErr) => {
                  if (rollbackErr) {
                    console.error('Error during rollback after commit failure:', rollbackErr);
                  }
                  if (!res.headersSent) {
                    return res.status(500).json({
                      error: 'Failed to create document: commit failed',
                      details: commitErr.message
                    });
                  }
                });
                return;
              }
              sendResponse();
            });
          }
        });
      });
    });
    } catch (unexpectedErr) {
      console.error('Unexpected error in document creation:', unexpectedErr);
      console.error('Error stack:', unexpectedErr.stack);
      // Try to rollback if transaction was started
      try {
        db.run('ROLLBACK', () => {});
      } catch (rollbackErr) {
        console.error('Error during emergency rollback:', rollbackErr);
      }
      return res.status(500).json({
        error: 'Failed to create document',
        details: unexpectedErr.message || 'Unexpected error occurred',
        type: 'unexpected_error'
      });
    }
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
      console.error('Error fetching document:', err);
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
        console.error('Error updating document:', err);
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
      console.error('Error fetching document:', err);
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
        console.error('Error deleting document:', err);
        return res.status(500).json({ error: 'Failed to delete document' });
      }

      res.json({ message: 'Document deleted successfully' });
    });
  });
});

// Add collaborator to document
router.post('/:id/collaborators', requireAuth, (req, res) => {
  console.log(`[${new Date().toISOString()}] POST /api/documents/${req.params.id}/collaborators - Adding collaborator`);
  console.log('Current user:', req.user.id, 'Adding user:', req.body.userId);

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
      console.error('Error fetching document:', err);
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
        console.error('Error fetching user:', err);
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
          console.error('Error checking existing collaborator:', err);
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
            console.error('Error adding collaborator:', err);
            return res.status(500).json({ error: 'Failed to add collaborator' });
          }

          // Update document timestamp
          db.run(`
            UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
          `, [documentId], function(err) {
            if (err) {
              console.error('Error updating document timestamp:', err);
            }
          });

          console.log('Collaborator added successfully:', userId, 'to document:', documentId);
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
  console.log(`[${new Date().toISOString()}] DELETE /api/documents/${req.params.id}/collaborators/${req.params.userId} - Removing collaborator`);
  console.log('Current user:', req.user.id, 'Removing user:', req.params.userId);

  const db = req.app.locals.db;
  const documentId = req.params.id;
  const collaboratorUserId = req.params.userId;
  const currentUserId = req.user.id;

  // Check if current user is the document owner
  db.get(`
    SELECT owner_id FROM documents WHERE id = ?
  `, [documentId], (err, document) => {
    if (err) {
      console.error('Error fetching document:', err);
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
        console.error('Error removing collaborator:', err);
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
          console.error('Error updating document timestamp:', err);
        }
      });

      console.log('Collaborator removed successfully:', collaboratorUserId, 'from document:', documentId);
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
  db.get(`SELECT id, vote_change_allowed, status FROM documents WHERE id = ?`, [documentId], (err, document) => {
    if (err) {
      console.error('Error fetching document:', err);
      return res.status(500).json({ error: 'Failed to fetch document' });
    }

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Check if user already voted
    db.get(`SELECT id, vote FROM document_votes WHERE document_id = ? AND user_id = ?`, 
      [documentId, userId], (err, existingVote) => {
      if (err) {
        console.error('Error checking existing vote:', err);
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
            console.error('Error updating vote:', err);
            return res.status(500).json({ error: 'Failed to update vote' });
          }

          // Check if document should be marked as agreed
          checkDocumentAgreementStatus(db, documentId);

          res.json({ message: 'Vote updated successfully' });
        });
      } else {
        // Insert new vote
        const { v4: uuidv4 } = require('uuid');
        const voteId = uuidv4();
        
        db.run(`INSERT INTO document_votes (id, document_id, user_id, vote) VALUES (?, ?, ?, ?)`,
          [voteId, documentId, userId, vote], function(err) {
          if (err) {
            console.error('Error casting vote:', err);
            return res.status(500).json({ error: 'Failed to cast vote' });
          }

          // Check if document should be marked as agreed
          checkDocumentAgreementStatus(db, documentId);

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
      console.error('Error fetching document:', docErr);
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
        console.error('Error fetching votes:', err);
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
function checkDocumentAgreementStatus(db, documentId) {
  // Get document acceptance threshold, status, and proposal deadline
  db.get(`SELECT acceptance_threshold, status, proposal_deadline FROM documents WHERE id = ?`, [documentId], (docErr, doc) => {
    if (docErr) {
      console.error('Error getting document threshold:', docErr);
      return;
    }

    if (!doc || doc.status === 'agreed') {
      // Already agreed or document not found
      return;
    }

    // Only check for agreement if document is in 'proposal' status
    if (doc.status !== 'proposal') {
      return;
    }

    // Check if proposal deadline has passed
    if (doc.proposal_deadline) {
      const deadline = new Date(doc.proposal_deadline);
      const now = new Date();
      if (now < deadline) {
        // Deadline has not passed yet - cannot agree
        return;
      }
    }

    const acceptanceThreshold = doc?.acceptance_threshold || 75.0;

    // Get total collaborators
    const collabQuery = `
      SELECT COUNT(*) as total_users
      FROM (
        SELECT owner_id as user_id FROM documents WHERE id = ?
        UNION
        SELECT user_id FROM document_collaborators WHERE document_id = ?
      )
    `;

    db.get(collabQuery, [documentId, documentId], (err, result) => {
      if (err) {
        console.error('Error getting user count:', err);
        return;
      }

      const totalUsers = result.total_users || 1;

      // Get document-level votes
      db.all(`SELECT vote FROM document_votes WHERE document_id = ?`, [documentId], (err, votes) => {
        if (err) {
          console.error('Error getting document votes:', err);
          return;
        }

        if (!votes || votes.length === 0) {
          // No votes yet
          return;
        }

        // Count PRO votes
        const proVotes = votes.filter(v => v.vote === 'PRO').length;
        const approvalPercentage = totalUsers > 0 ? (proVotes / totalUsers) * 100 : 0;

        // Check if agreement threshold is met (quorum reached)
        if (approvalPercentage >= acceptanceThreshold) {
          // Update document status to 'agreed' (deadline passed AND quorum reached)
          db.run(`UPDATE documents SET status = 'agreed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [documentId], (updateErr) => {
            if (updateErr) {
              console.error('Error updating document status to agreed:', updateErr);
            } else {
              console.log(`Document ${documentId} status updated to 'agreed' - deadline passed and document-level votes reached threshold`);
            }
          });
        }
      });
    });
  });
    } // End of continueExecution function
}

module.exports = router;