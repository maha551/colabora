/**
 * Shared helpers for governance routes (main and sub-routers).
 * Avoids circular requires and duplication.
 * Status helpers live in utils/governanceStatus.js so services do not depend on routes.
 */

const crypto = require('crypto');
const { ApiError } = require('../../middleware/errorHandler');
const { logger } = require('../../middleware/logger');
const { logAudit } = require('../../utils/auditLog');
const { validateStatusTransition, getStatusInfo } = require('../../utils/governanceStatus');

function generateAnonymousToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashVote(voteData) {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(voteData));
  return hash.digest('hex');
}

/**
 * Handle errors for governance endpoints with consistent error messages
 * @param {Error} error - The error that occurred
 * @param {string} endpointName - Name of endpoint (e.g., 'rule proposals', 'elections')
 * @param {string} organizationId - Organization ID
 * @param {string} userId - User ID
 */
function handleGovernanceEndpointError(error, endpointName, organizationId, userId) {
  if (error instanceof ApiError) {
    logger.error(`Error fetching ${endpointName} (ApiError)`, {
      error: error.message,
      code: error.code,
      statusCode: error.statusCode,
      organizationId,
      userId
    });
    throw error;
  }

  logger.error(`Error fetching ${endpointName}`, {
    error: error.message,
    stack: error.stack,
    organizationId,
    userId,
    errorName: error.name,
    errorType: error.constructor.name
  });

  let errorMessage = `Failed to fetch ${endpointName}`;
  let errorCode = 'INTERNAL_ERROR';

  if (error.message && error.message.includes('database')) {
    errorMessage = `Database error while fetching ${endpointName}`;
    errorCode = 'DATABASE_ERROR';
  } else if (error.message && error.message.includes('timeout')) {
    errorMessage = `Request timed out while fetching ${endpointName}`;
    errorCode = 'TIMEOUT_ERROR';
  } else if (error.message && error.message.includes('connection')) {
    errorMessage = `Database connection error while fetching ${endpointName}`;
    errorCode = 'CONNECTION_ERROR';
  }

  throw ApiError.database(errorMessage, {
    organizationId,
    originalError: error.message,
    ...(process.env.NODE_ENV !== 'production' && {
      message: error.message,
      stack: error.stack
    })
  }, errorCode);
}

module.exports = {
  generateAnonymousToken,
  hashVote,
  validateStatusTransition,
  getStatusInfo,
  handleGovernanceEndpointError,
  logAudit
};
