const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { ApiError } = require('./errorHandler');
const { logger } = require('./logger');
const { getUserId } = require('../utils/routeHelpers');

/**
 * Get connection pool statistics from a Knex instance
 * @param {Object} knex - Knex database instance
 * @param {Object} req - Express request object (optional, for accessing dbManager)
 * @returns {Object|null} Pool statistics or null if not available
 */
function getPoolStats(knex, req = null) {
  // First, try to get stats from dbManager if available (most reliable)
  if (req && req.app && req.app.locals && req.app.locals.dbManager) {
    try {
      const dbManager = req.app.locals.dbManager;
      // Check if dbManager has a connection with getPoolStats method
      if (dbManager.connection && typeof dbManager.connection.getPoolStats === 'function') {
        const stats = dbManager.connection.getPoolStats();
        if (stats) {
          return stats;
        }
      }
    } catch (err) {
      // Fall through to other methods
      logger.debug('Failed to get pool stats from dbManager', { error: err.message });
    }
  }
  
  if (!knex) {
    return null;
  }
  
  // Try multiple ways to access the pool (different knex versions/structures)
  let pool = null;
  
  // Method 1: Standard knex structure
  if (knex.client && knex.client.pool) {
    pool = knex.client.pool;
  }
  // Method 2: Try accessing via dbManager if available
  else if (knex.getPoolStats && typeof knex.getPoolStats === 'function') {
    // If it's a DatabaseManager instance, use its method
    try {
      return knex.getPoolStats();
    } catch (err) {
      logger.debug('Failed to get pool stats from knex.getPoolStats', { error: err.message });
    }
  }
  // Method 3: Try accessing pool directly (some structures)
  else if (knex.pool) {
    pool = knex.pool;
  }
  
  if (!pool) {
    return null;
  }
  
  try {
    // Check if pool has the required methods
    if (typeof pool.numUsed !== 'function' || typeof pool.numFree !== 'function') {
      return null;
    }
    
    const used = pool.numUsed();
    const free = pool.numFree();
    const total = used + free;
    const pending = pool.numPendingAcquires ? pool.numPendingAcquires() : 0;
    
    return {
      total,
      used,
      free,
      pending,
      utilizationPercent: total > 0 ? Math.round((used / total) * 100) : 0
    };
  } catch (err) {
    // If accessing pool stats fails, return null
    logger.debug('Failed to get pool stats', { error: err.message });
    return null;
  }
}

// JWT token generation
function generateToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      name: user.name
    },
    config.JWT_CONFIG.secret,
    {
      expiresIn: config.JWT_CONFIG.expiresIn,
      issuer: config.JWT_CONFIG.issuer,
      audience: config.JWT_CONFIG.audience
    }
  );
}

// JWT token verification middleware
async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!token) {
    const err = ApiError.auth('Access token required');
    return res.status(err.statusCode).json(err.toJSON());
  }

  try {
    const decoded = jwt.verify(token, config.JWT_CONFIG.secret, {
      issuer: config.JWT_CONFIG.issuer,
      audience: config.JWT_CONFIG.audience,
      ignoreExpiration: false
    });

    // Fetch user role from database using Knex with retry logic for connection pool exhaustion
    try {
      const knex = req.app.locals.knex || req.app.locals.db;
      // Check if database is marked as unavailable
      if (!knex || req.app.locals.dbAvailable === false) {
        logger.error('Database not available during authentication', { userId: decoded.userId });
        // Return 503 (Service Unavailable) instead of 500 when database is unavailable
        // This is more accurate - the service is temporarily unavailable, not an internal error
        const err = ApiError.serviceUnavailable(
          'Service temporarily unavailable',
          { message: 'Database connection is temporarily unavailable. Please try again later.' }
        );
        return res.status(err.statusCode).json(err.toJSON());
      }

      // Check pool stats before attempting query to avoid contributing to exhaustion
      const poolStats = getPoolStats(knex, req);
      
      // If pool is severely exhausted (no free connections and many pending), wait longer
      if (poolStats && poolStats.free === 0 && poolStats.used >= poolStats.total && poolStats.total > 0) {
        if (poolStats.pending > 20) {
          // Many requests waiting - pool is under severe stress
          logger.warn('Connection pool severely exhausted during authentication, waiting longer', {
            userId: decoded.userId,
            poolStats
          });
          // Wait longer to give connections time to be released
          await new Promise(resolve => setTimeout(resolve, 200));
        } else {
          // Pool exhausted but not too many pending - wait a bit
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Retry logic for connection acquisition failures
      const maxRetries = 3;
      const queryTimeout = 5000; // 5 second timeout per query attempt
      let lastError;
      let delay = 100; // Start with 100ms delay (increased from 50ms)

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          // Wrap query in timeout to prevent hanging
          const queryPromise = knex.raw(
            'SELECT role, COALESCE(is_active, true) as is_active FROM users WHERE id = ?',
            [decoded.userId]
          );
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Query timeout - unable to acquire connection')), queryTimeout);
          });
          
          const result = await Promise.race([queryPromise, timeoutPromise]);
          const row = (result.rows && result.rows[0]) || null;

          if (!row) {
            const err = ApiError.auth('User not found');
            return res.status(err.statusCode).json(err.toJSON());
          }

          if (row.is_active === false || row.is_active === 0) {
            const err = ApiError.forbidden('Account suspended', 'ACCOUNT_SUSPENDED');
            return res.status(err.statusCode).json(err.toJSON());
          }

          req.user = {
            id: decoded.userId,
            email: decoded.email,
            name: decoded.name,
            role: (row.role && row.role.trim()) || 'user',
            isActive: row.is_active !== false && row.is_active !== 0,
          };

          next();
          return; // Success - exit retry loop
        } catch (error) {
          lastError = error;
          
          // Check if this is a connection pool exhaustion error or dead connection error
          const isConnectionPoolError = error.message && (
            error.message.includes('Unable to acquire a connection') ||
            error.message.includes('timeout') ||
            error.message.includes('Connection pool') ||
            error.message.includes('Query timeout') ||
            error.message.includes('Connection terminated') ||
            error.message.includes('Connection ended') ||
            error.message.includes('socket hang up') ||
            error.message.includes('ECONNRESET') ||
            error.message.includes('ENOTFOUND') ||
            error.code === 'ETIMEDOUT' ||
            error.code === 'ECONNRESET' ||
            error.code === 'ECONNREFUSED' ||
            error.code === 'ENOTFOUND'
          );

          // Get current pool stats for retry logging
          const currentPoolStats = getPoolStats(knex, req);
          
          // If we have "free" connections but still can't acquire, they might be dead
          // Try to trigger pool cleanup by accessing the pool directly
          if (isConnectionPoolError && currentPoolStats && currentPoolStats.free > 0) {
            logger.warn('Connection pool reports free connections but acquisition failed - possible dead connections', {
              userId: decoded.userId,
              error: error.message,
              poolStats: currentPoolStats,
              attempt: attempt + 1
            });
            
            // Try to access the pool and trigger cleanup of dead connections
            try {
              if (knex.client && knex.client.pool) {
                const pool = knex.client.pool;
                // Force pool to check and remove dead connections
                // This is a workaround - the pool should handle this automatically
                if (typeof pool.destroyAllNow === 'function') {
                  // Don't destroy all - that's too aggressive
                  // Instead, let the pool's natural cleanup handle it
                }
              }
            } catch (poolError) {
              // Ignore pool access errors
              logger.debug('Could not access pool for cleanup', { error: poolError.message });
            }
          }

          // Only retry on connection pool errors and if we haven't exceeded max retries
          if (!isConnectionPoolError || attempt === maxRetries) {
            // Not a retryable error or max retries reached
            break;
          }
          
          // Log retry attempt with pool stats
          logger.warn(`Connection pool exhausted during authentication, retrying (attempt ${attempt + 1}/${maxRetries})`, {
            userId: decoded.userId,
            error: error.message,
            errorCode: error.code,
            delay,
            poolStats: currentPoolStats,
            poolExhausted: currentPoolStats && currentPoolStats.free === 0 && currentPoolStats.used >= currentPoolStats.total,
            note: currentPoolStats && currentPoolStats.free > 0 
              ? 'Pool reports free connections but acquisition failed - possible dead connections in pool'
              : 'Pool exhausted or connection error'
          });

          // Wait before retrying with exponential backoff
          // Longer delay if pool reports free connections (dead connections need time to be cleaned up)
          const retryDelay = currentPoolStats && currentPoolStats.free > 0 
            ? Math.min(delay * 1.5, 2000) // Longer delay for dead connection cleanup
            : delay;
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          delay = Math.min(delay * 2, 1000); // Exponential backoff, max 1000ms (increased from 500ms)
        }
      }

      // All retries failed or non-retryable error
      // Get final pool stats for debugging
      const finalPoolStats = getPoolStats(knex, req);
      const isConnectionPoolError = lastError && (
        lastError.message?.includes('Unable to acquire a connection') ||
        lastError.message?.includes('timeout') ||
        lastError.message?.includes('Connection pool') ||
        lastError.message?.includes('Query timeout') ||
        lastError.code === 'ETIMEDOUT' ||
        lastError.code === 'ECONNRESET'
      );
      
      // Try to get pool stats from dbManager if available
      let dbManagerStats = null;
      try {
        if (req.app.locals.dbManager && typeof req.app.locals.dbManager.getPoolStats === 'function') {
          dbManagerStats = req.app.locals.dbManager.getPoolStats();
        }
      } catch (err) {
        // Ignore errors getting stats
      }
      
      // Safely extract pool stats to avoid undefined access errors
      const stats = finalPoolStats || dbManagerStats;
      const poolExhausted = stats && stats.free === 0 && stats.used >= stats.total;
      const poolUtilization = stats ? `${stats.utilizationPercent || 0}%` : 'unknown';
      
      logger.error('Error fetching user role during authentication', {
        userId: decoded.userId,
        error: lastError?.message || 'Unknown error',
        errorCode: lastError?.code,
        attempts: maxRetries + 1,
        initialPoolStats: poolStats,
        finalPoolStats: stats,
        isConnectionPoolError,
        poolExhausted: poolExhausted || false,
        poolUtilization: poolUtilization
      });
      
      // Check if this is a database connection issue
      const isDatabaseError = lastError && (
        lastError.message.includes('Unable to acquire a connection') ||
        lastError.message.includes('timeout') ||
        lastError.message.includes('Connection pool') ||
        lastError.code === 'ETIMEDOUT' ||
        lastError.message.includes('ECONNREFUSED') ||
        lastError.message.includes('ENOTFOUND')
      );
      
      // Return 503 for database connection issues, 500 for other errors
      const retryErr = isDatabaseError
        ? ApiError.serviceUnavailable(
            'Service temporarily unavailable',
            { message: 'Database connection is temporarily unavailable. Please try again later.' }
          )
        : ApiError.database('Authentication failed', { message: 'Authentication service error' });
      return res.status(retryErr.statusCode).json(retryErr.toJSON());
    } catch (error) {
      logger.error('Unexpected error during authentication', { userId: decoded.userId, error: error.message });
      
      // Check if this is a database connection issue
      const isDatabaseError = error.message && (
        error.message.includes('Unable to acquire a connection') ||
        error.message.includes('timeout') ||
        error.message.includes('Connection pool') ||
        error.code === 'ETIMEDOUT' ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ENOTFOUND')
      );
      
      // Return 503 for database connection issues, 500 for other errors
      const err = isDatabaseError
        ? ApiError.serviceUnavailable(
            'Service temporarily unavailable',
            { message: 'Database connection is temporarily unavailable. Please try again later.' }
          )
        : ApiError.database('Authentication failed', { message: 'Authentication service error' });
      return res.status(err.statusCode).json(err.toJSON());
    }
  } catch (error) {
    logger.warn('JWT verification failed', { error: error.message });
    const err = ApiError.auth('Invalid or expired token');
    return res.status(err.statusCode).json(err.toJSON());
  }
}

// Password hashing
async function hashPassword(password) {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

// Password verification
async function verifyPassword(password, hashedPassword) {
  return await bcrypt.compare(password, hashedPassword);
}

// JWT-only authentication middleware
function requireAuth(req, res, next) {
  // Require JWT token for authentication
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticateToken(req, res, next);
  }

  // No token provided
  const err = ApiError.auth('Authentication required');
  return res.status(err.statusCode).json(err.toJSON());
}

// Admin role check - uses role cached in req.user by authenticateToken
// This eliminates a duplicate database query on every admin request
// If req.user is not set, calls requireAuth first to authenticate the user
function requireAdmin(req, res, next) {
  // If req.user is not set, authenticate first
  if (!req.user) {
    // Call requireAuth, which will call authenticateToken and set req.user with role
    // Then continue to role check in the next middleware call
    return requireAuth(req, res, () => {
      // After authentication, check admin role
      if (req.user.role !== 'admin') {
        logger.debug('Admin access denied', { userId: getUserId(req, false), role: req.user.role });
        const err = ApiError.forbidden('Admin access required');
        return res.status(err.statusCode).json(err.toJSON());
      }
      next();
    });
  }

  // Use role from req.user (already fetched in authenticateToken)
  // This prevents duplicate DB queries for the same role check
  if (req.user.role !== 'admin') {
    logger.debug('Admin access denied', { userId: req.user.id, role: req.user.role });
    const err = ApiError.forbidden('Admin access required');
    return res.status(err.statusCode).json(err.toJSON());
  }

  next();
}

// Middleware to check document access (owner, collaborator, or organizational member)
async function requireDocumentAccess(req, res, next) {
  const db = req.app.locals.db;
  const documentId = req.params.documentId || req.params.id;
  const userId = getUserId(req);

  if (!documentId) {
    const err = ApiError.badRequest('Document ID is required');
    return res.status(err.statusCode).json(err.toJSON());
  }

  // Access query: check ownership, direct collaboration, OR organizational membership
  const { buildAccessCheck } = require('../utils/documentQueries');
  
  let query = `
    SELECT d.id, d.owner_id, d.ownership_type, 
           d.voting_deadline, d.status, d.vote_change_allowed, d.amendments_open,
           d.document_kind
    FROM documents d
    LEFT JOIN document_collaborators dc ON d.id = dc.document_id AND dc.user_id = ?
    LEFT JOIN organization_members om ON d.organization_id = om.organization_id AND om.user_id = ? AND om.status = 'active'
    LEFT JOIN organizations o ON d.organization_id = o.id AND o.is_active = true
    WHERE d.id = ? 
      AND ${buildAccessCheck('d', '?', true)}
  `;

  // Parameters: userId (dc JOIN), userId (om JOIN), documentId, userId (owner check), userId (dc check)
  try {
    const result = await db.raw(query, [userId, userId, documentId, userId, userId]);
    const document = (result.rows && result.rows[0]) || result[0] || null;

    if (!document) {
      logger.warn('Document access denied', { userId, documentId });
      const err = ApiError.forbidden('Access denied to this document');
      return res.status(err.statusCode).json(err.toJSON());
    }

    // Cache document data for route handlers to avoid redundant queries
    req.document = document;

    logger.debug('Document access granted', { userId, documentId });

    next();
  } catch (err) {
    logger.error('Error checking document access', { userId, documentId, error: err.message });
    const apiErr = ApiError.database('Access check failed');
    return res.status(apiErr.statusCode).json(apiErr.toJSON());
  }
}

// Middleware to check if user is a member or representative of an organization
// This should be used after requireAuth to ensure user is authenticated
async function requireOrganizationMember(req, res, next) {
  const db = req.app.locals.db || req.app.locals.knex;
  const organizationId = req.params.organizationId;
  const userId = getUserId(req);

  if (!organizationId) {
    const err = ApiError.badRequest('Organization ID is required');
    return res.status(err.statusCode).json(err.toJSON());
  }

  if (!db) {
    logger.error('Database not available during organization member check', { userId, organizationId });
    const err = ApiError.serviceUnavailable(
      'Service temporarily unavailable',
      { message: 'Database connection is temporarily unavailable. Please try again later.' }
    );
    return res.status(err.statusCode).json(err.toJSON());
  }

  try {
    const { getUserOrganizationStatus } = require('../utils/permissionUtils');
    const { ApiError } = require('./errorHandler');
    
    // Check if user is a member or representative
    const status = await getUserOrganizationStatus(db, userId, organizationId, req.user?.role);
    const hasAccess = status.isRepresentative || status.isActiveMember || status.isAdmin;

    if (!hasAccess) {
      // Before denying access, verify the organization exists
      // This prevents leaking information about organization existence
      const TransactionManager = require('../database/services/TransactionManager');
      let orgExists = false;
      try {
        const orgExistsRow = await TransactionManager.query(db, 'SELECT 1 FROM organizations WHERE id = ?', [organizationId]);
        orgExists = !!orgExistsRow;
      } catch (err) {
        logger.error('Error checking organization existence', { 
          error: err.message, 
          organizationId 
        });
      }

      if (!orgExists) {
        return next(ApiError.notFound('Organization', 'ORGANIZATION_NOT_FOUND'));
      }

      logger.warn('Organization access denied - user is not a member', { 
        userId, 
        organizationId,
        isRepresentative: status.isRepresentative,
        isActiveMember: status.isActiveMember,
        isAdmin: status.isAdmin
      });
      return next(ApiError.forbidden('You must be a member of this organization to access this area', 'MEMBERSHIP_REQUIRED'));
    }

    logger.debug('Organization member access granted', { 
      userId, 
      organizationId,
      isRepresentative: status.isRepresentative,
      isActiveMember: status.isActiveMember,
      isAdmin: status.isAdmin
    });

    // Store status in request for use in route handlers
    req.organizationMemberStatus = status;
    next();
  } catch (err) {
    logger.error('Error checking organization membership', { 
      userId, 
      organizationId, 
      error: err.message 
    });
    return res.status(500).json({ 
      error: 'Failed to verify organization membership',
      message: 'An error occurred while checking your access permissions'
    });
  }
}

module.exports = {
  generateToken,
  authenticateToken,
  requireAuth,
  requireAdmin,
  requireDocumentAccess,
  requireOrganizationMember,
  hashPassword,
  verifyPassword
};
