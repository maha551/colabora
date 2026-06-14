/**
 * Document validation and error handling for document routes.
 * Pure validation and error mapping; no req/res.
 */

const { logger } = require('../middleware/logger');

const DOCUMENT_CONFIG = {
  MAX_DEPTH: 10,
  DEFAULT_PROPOSAL_PERIOD_DAYS: 30,
  MIN_ACCEPTANCE_THRESHOLD: 0,
  MAX_ACCEPTANCE_THRESHOLD: 100,
  DEFAULT_ACCEPTANCE_THRESHOLD: 75
};

const ERROR_CODES = {
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
  DOC_CREATOR_IDS_NOT_ALLOWED: 'Creator IDs are only allowed for shared documents',
  DOC_PARENT_NOT_FOUND: 'Parent document not found',
  DOC_PARENT_OWNERSHIP_MISMATCH: 'Parent document ownership type mismatch',
  DOC_PARENT_NOT_ORGANIZATIONAL: 'Parent document must be organizational',
  DOC_PARENT_ORGANIZATION_MISMATCH: 'Parent document belongs to different organization',
  DOC_PARENT_ACCESS_DENIED: 'Access denied to parent document',
  DOC_CIRCULAR_REFERENCE: 'Circular reference detected in document hierarchy',
  DOC_MAX_DEPTH_EXCEEDED: 'Document hierarchy depth exceeds maximum allowed',
  DOC_CREATION_FAILED: 'Document creation failed',
  DOC_DB_ERROR: 'Database error during document creation',
  DOC_PARAGRAPH_ERROR: 'Failed to create document title paragraph',
  DOC_COLLABORATOR_ERROR: 'Failed to add document collaborators',
  DOC_USER_ERROR: 'User account error during document creation',
  DOC_TRANSACTION_CONFLICT: 'Database transaction conflict occurred',
  DOC_ORG_ACCESS_DENIED: 'You do not have permission to create documents in this organization',
  DOC_ORG_MEMBERSHIP_REQUIRED: 'You must be a member of the organization to create documents',
  DOC_ORG_NOT_FOUND: 'Organization not found or you do not have access',
  DOC_DB_CONSTRAINT: 'Database constraint violation. The document may already exist or conflict with existing data.',
  DOC_DB_BUSY: 'Database is busy. Please try again in a moment.',
  DOC_REFERENCE_REQUIRED: 'Reference document ID is required when position type is specified',
  DOC_REFERENCE_NOT_FOUND: 'Reference document not found',
  DOC_REFERENCE_ORG_MISMATCH: 'Reference document belongs to a different organization',
  DOC_REFERENCE_VALIDATION_ERROR: 'Failed to validate reference document',
  DOC_REFERENCE_INVALID_UUID: 'Reference document ID must be a valid UUID',
  DOC_POSITION_TYPE_INVALID: 'Position type must be one of: root, child, above_sibling, below_sibling',
};

function logDocumentEvent(level, event, data = {}) {
  const logEntry = { event, service: 'document-service', ...data };
  logger.log(level, event, logEntry);
}

function logDocumentError(errorCode, message, context = {}) {
  logDocumentEvent('error', 'document_error', { errorCode, message, ...context });
}

function logDocumentSuccess(event, context = {}) {
  logDocumentEvent('info', event, context);
}

/**
 * Handle document creation errors with consistent error codes and messages.
 * @returns {{ errorCode: string, errorMessage: string, statusCode: number, errorDetails?: string }}
 */
function handleDocumentCreationError(error, userId, ownershipType, organizationId = null) {
  let errorCode = error.code || 'DOC_CREATION_FAILED';
  let errorMessage = ownershipType === 'organizational'
    ? 'Failed to create organizational document'
    : 'Failed to create document';
  let errorDetails = error.message;
  let statusCode = 500;

  if (error.message && error.message.includes('permission')) {
    errorCode = ownershipType === 'organizational' ? 'DOC_ORG_ACCESS_DENIED' : 'DOC_ACCESS_DENIED';
    errorMessage = ownershipType === 'organizational' ? ERROR_CODES.DOC_ORG_ACCESS_DENIED : 'You do not have permission to create this document';
    statusCode = 403;
    logDocumentError(errorCode, 'Permission check failed', { userId, organizationId, ownershipType, error: error.message, operationStep: 'permission_validation' });
  } else if (error.message.includes('not found') || error.message.includes('does not exist')) {
    errorCode = ownershipType === 'organizational' ? 'DOC_ORG_NOT_FOUND' : 'DOC_CREATION_FAILED';
    errorMessage = ownershipType === 'organizational' ? ERROR_CODES.DOC_ORG_NOT_FOUND : 'Resource not found';
    statusCode = 404;
    logDocumentError(errorCode, 'Resource not found', { userId, organizationId, ownershipType, error: error.message, operationStep: 'resource_validation' });
  } else if (error.message.includes('constraint') || error.message.includes('SQLITE_CONSTRAINT')) {
    errorCode = 'DOC_DB_CONSTRAINT';
    errorMessage = ERROR_CODES.DOC_DB_CONSTRAINT;
    statusCode = ownershipType === 'organizational' ? 409 : 400;
    logDocumentError('DOC_DB_CONSTRAINT', 'Database constraint violation', { userId, organizationId, ownershipType, error: error.message, operationStep: 'database_insert' });
  } else if (error.message.includes('SQLITE_BUSY') || error.message.includes('locked') || error.message.includes('transaction')) {
    errorCode = ownershipType === 'organizational' ? 'DOC_TRANSACTION_CONFLICT' : 'DOC_DB_BUSY';
    errorMessage = ownershipType === 'organizational' ? ERROR_CODES.DOC_TRANSACTION_CONFLICT : ERROR_CODES.DOC_DB_BUSY;
    statusCode = 503;
    logDocumentError(errorCode, 'Transaction conflict or database locked', { userId, organizationId, ownershipType, error: error.message, operationStep: 'transaction_execution' });
  } else if (error.message.includes('membership') || error.message.includes('member')) {
    errorCode = 'DOC_ORG_MEMBERSHIP_REQUIRED';
    errorMessage = ERROR_CODES.DOC_ORG_MEMBERSHIP_REQUIRED;
    statusCode = 403;
    logDocumentError('DOC_ORG_MEMBERSHIP_REQUIRED', 'Organization membership required', { userId, organizationId, ownershipType, error: error.message, operationStep: 'membership_validation' });
  } else if (error.message.includes('Document creation failed')) {
    errorCode = 'DOC_DB_ERROR';
    errorMessage = 'Failed to create document due to database error';
    statusCode = 500;
  } else if (error.message.includes('Failed to create title paragraph')) {
    errorCode = 'DOC_PARAGRAPH_ERROR';
    errorMessage = ERROR_CODES.DOC_PARAGRAPH_ERROR;
    statusCode = 500;
  } else if (error.message.includes('Failed to add collaborator')) {
    errorCode = 'DOC_COLLABORATOR_ERROR';
    errorMessage = ERROR_CODES.DOC_COLLABORATOR_ERROR;
    statusCode = 500;
  } else if (error.message.includes('User not found')) {
    errorCode = 'DOC_USER_ERROR';
    errorMessage = ERROR_CODES.DOC_USER_ERROR;
    statusCode = 500;
  } else if (error.message.includes('validation') || error.message.includes('Invalid')) {
    errorCode = 'DOC_VALIDATION_ERROR';
    errorMessage = 'Invalid input. Please check all fields and try again.';
    statusCode = 400;
  } else {
    logDocumentError('DOC_CREATION_FAILED', `Error in ${ownershipType} document creation`, {
      userId, organizationId, ownershipType, error: error.message, stack: error.stack, errorCode: error.code, operationStep: 'document_creation'
    });
  }

  return {
    errorCode,
    errorMessage,
    statusCode,
    errorDetails: process.env.NODE_ENV !== 'production' ? errorDetails : undefined
  };
}

/**
 * Validate document creation inputs.
 * @returns {{ valid: boolean, errors: Array<{field: string, error: string, message: string}> }}
 */
function validateDocumentInputs(title, description, options, ownershipType, organizationId, creatorIds) {
  logDocumentEvent('info', 'input_validation_started', {
    hasTitle: !!title, hasDescription: !!description, hasOptions: !!options,
    ownershipType, hasOrganizationId: !!organizationId, hasCreatorIds: !!creatorIds
  });

  const errors = [];

  if (!title || typeof title !== 'string') {
    errors.push({ field: 'title', error: 'DOC_TITLE_REQUIRED', message: ERROR_CODES.DOC_TITLE_REQUIRED });
  } else if (title.trim().length > 200) {
    errors.push({ field: 'title', error: 'DOC_TITLE_TOO_LONG', message: ERROR_CODES.DOC_TITLE_TOO_LONG });
  }

  if (description && typeof description !== 'string') {
    errors.push({ field: 'description', error: 'DOC_DESCRIPTION_INVALID', message: ERROR_CODES.DOC_DESCRIPTION_INVALID });
  } else if (description && description.length > 1000) {
    errors.push({ field: 'description', error: 'DOC_DESCRIPTION_TOO_LONG', message: ERROR_CODES.DOC_DESCRIPTION_TOO_LONG });
  }

  if (options) {
    const getOptionValue = (camelKey, snakeKey) => options[camelKey] !== undefined ? options[camelKey] : options[snakeKey];

    const acceptanceThreshold = getOptionValue('acceptanceThreshold', 'acceptance_threshold');
    if (acceptanceThreshold !== undefined) {
      const threshold = Number(acceptanceThreshold);
      if (isNaN(threshold) || threshold < DOCUMENT_CONFIG.MIN_ACCEPTANCE_THRESHOLD || threshold > DOCUMENT_CONFIG.MAX_ACCEPTANCE_THRESHOLD) {
        errors.push({ field: 'options.acceptanceThreshold', error: 'DOC_THRESHOLD_INVALID', message: ERROR_CODES.DOC_THRESHOLD_INVALID });
      }
    }

    const booleanOptions = [
      { camel: 'votingAnonymous', snake: 'voting_anonymous' },
      { camel: 'votingAnonymityLocked', snake: 'voting_anonymity_locked' },
      { camel: 'voteChangeAllowed', snake: 'vote_change_allowed' },
      { camel: 'structureProposalsEnabled', snake: 'structure_proposals_enabled' }
    ];
    booleanOptions.forEach(({ camel, snake }) => {
      let value = getOptionValue(camel, snake);
      if (value !== undefined) {
        if (typeof value === 'number') {
          value = value !== 0;
          if (options[camel] !== undefined) options[camel] = value;
          else if (options[snake] !== undefined) options[snake] = value;
        }
        if (typeof value !== 'boolean') {
          errors.push({ field: `options.${camel}`, error: 'DOC_OPTION_INVALID_TYPE', message: `${camel} must be a boolean value` });
        }
      }
    });

    const positionType = getOptionValue('positionType', 'position_type');
    if (positionType !== undefined) {
      const validPositionTypes = ['root', 'child', 'above_sibling', 'below_sibling'];
      if (!validPositionTypes.includes(positionType)) {
        errors.push({ field: 'options.positionType', error: 'DOC_POSITION_TYPE_INVALID', message: 'Position type must be one of: root, child, above_sibling, below_sibling' });
      }
    }

    const referenceDocumentId = getOptionValue('referenceDocumentId', 'reference_document_id');
    if (positionType && positionType !== 'root') {
      if (!referenceDocumentId || typeof referenceDocumentId !== 'string') {
        errors.push({ field: 'options.referenceDocumentId', error: 'DOC_REFERENCE_REQUIRED', message: ERROR_CODES.DOC_REFERENCE_REQUIRED });
      } else {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(referenceDocumentId)) {
          errors.push({ field: 'options.referenceDocumentId', error: 'DOC_REFERENCE_INVALID_UUID', message: 'Reference document ID must be a valid UUID' });
        }
      }
    }
  }

  const validOwnershipTypes = ['personal', 'shared', 'organizational'];
  const normalizedOwnershipType = (ownershipType && validOwnershipTypes.includes(ownershipType)) ? ownershipType : 'personal';

  if (!validOwnershipTypes.includes(normalizedOwnershipType)) {
    errors.push({ field: 'ownershipType', error: 'DOC_OWNERSHIP_TYPE_INVALID', message: ERROR_CODES.DOC_OWNERSHIP_TYPE_INVALID });
  }

  if (normalizedOwnershipType === 'organizational') {
    if (!organizationId) {
      errors.push({ field: 'organizationId', error: 'DOC_ORG_ID_REQUIRED', message: ERROR_CODES.DOC_ORG_ID_REQUIRED });
    } else if (typeof organizationId !== 'string' || !organizationId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      errors.push({ field: 'organizationId', error: 'DOC_ORG_ID_INVALID', message: 'Organization ID must be a valid UUID' });
    }
  } else if (organizationId) {
    if (typeof organizationId === 'string' && !organizationId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      errors.push({ field: 'organizationId', error: 'DOC_ORG_ID_INVALID', message: 'Organization ID must be a valid UUID' });
    } else {
      errors.push({ field: 'organizationId', error: 'DOC_ORG_ID_NOT_ALLOWED', message: ERROR_CODES.DOC_ORG_ID_NOT_ALLOWED });
    }
  }

  if (ownershipType === 'shared') {
    if (creatorIds !== undefined && creatorIds !== null) {
      if (!Array.isArray(creatorIds)) {
        errors.push({ field: 'creatorIds', error: 'DOC_SHARED_CREATORS_INVALID', message: 'Creator IDs must be an array' });
      } else {
        const uniqueCreators = [...new Set(creatorIds)];
        if (uniqueCreators.length !== creatorIds.length) {
          errors.push({ field: 'creatorIds', error: 'DOC_CREATOR_IDS_DUPLICATE', message: ERROR_CODES.DOC_CREATOR_IDS_DUPLICATE });
        }
      }
    }
  } else if (creatorIds) {
    if (!Array.isArray(creatorIds)) {
      errors.push({ field: 'creatorIds', error: 'DOC_CREATOR_IDS_INVALID', message: 'Creator IDs must be an array' });
    } else {
      errors.push({ field: 'creatorIds', error: 'DOC_CREATOR_IDS_NOT_ALLOWED', message: ERROR_CODES.DOC_CREATOR_IDS_NOT_ALLOWED });
    }
  }

  const validationResult = { valid: errors.length === 0, errors };
  logDocumentEvent('info', 'input_validation_completed', { errorsCount: errors.length, valid: validationResult.valid });
  if (errors.length > 0) {
    logDocumentError('DOC_VALIDATION_FAILED', `Input validation failed with ${errors.length} errors`, { errors: errors.map(e => ({ field: e.field, error: e.error })) });
  }
  return validationResult;
}

module.exports = {
  DOCUMENT_CONFIG,
  ERROR_CODES,
  logDocumentEvent,
  logDocumentError,
  logDocumentSuccess,
  handleDocumentCreationError,
  validateDocumentInputs,
};
