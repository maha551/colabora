const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { logger } = require('../middleware/logger');
const { errorReportValidation } = require('../middleware/validation');
const TransactionManager = require('../database/services/TransactionManager');
const { requireDatabase } = require('../utils/dbHelpers');
const { getUserId } = require('../utils/routeHelpers');

const router = express.Router();

/**
 * Helper function to ensure error_reports table exists
 * Creates the table if it doesn't exist
 */
async function ensureErrorReportsTable(db) {
  try {
    const tableExistsQuery =
      "SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'error_reports'";
    const row = await TransactionManager.query(
      db,
      tableExistsQuery,
      []
    );
    const tableExists = !!row;
    
    if (!tableExists) {
      logger.info('error_reports table not found, creating it automatically');
      
      const dateType = 'TIMESTAMP';
      
      // Create the table automatically
      const createTableSql = `CREATE TABLE IF NOT EXISTS error_reports (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          user_email TEXT,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          error_message TEXT,
          error_stack TEXT,
          url TEXT,
          user_agent TEXT,
          browser_info TEXT,
          screen_resolution TEXT,
          console_logs TEXT,
          screenshot_url TEXT,
          status TEXT CHECK(status IN ('new', 'in_progress', 'resolved', 'dismissed')) DEFAULT 'new',
          priority TEXT CHECK(priority IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
          assigned_to TEXT,
          resolution_notes TEXT,
          created_at ${dateType} DEFAULT CURRENT_TIMESTAMP,
          updated_at ${dateType} DEFAULT CURRENT_TIMESTAMP,
          resolved_at ${dateType},
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
        )`;
      
      await TransactionManager.execute(db, createTableSql);
      
      // Create indexes (non-blocking, errors are logged)
      try {
        await TransactionManager.execute(db, `CREATE INDEX IF NOT EXISTS idx_error_reports_status ON error_reports(status, created_at DESC)`);
      } catch (e) {
        logger.warn('Failed to create index (non-critical)', {
          error: e.message,
          index: 'idx_error_reports_status'
        });
      }
      try {
        await TransactionManager.execute(db, `CREATE INDEX IF NOT EXISTS idx_error_reports_user ON error_reports(user_id, created_at DESC)`);
      } catch (e) {
        logger.warn('Failed to create index (non-critical)', {
          error: e.message,
          index: 'idx_error_reports_user'
        });
      }
      try {
        await TransactionManager.execute(db, `CREATE INDEX IF NOT EXISTS idx_error_reports_created_at ON error_reports(created_at DESC)`);
      } catch (e) {
        logger.warn('Failed to create index (non-critical)', {
          error: e.message,
          index: 'idx_error_reports_created_at'
        });
      }
      
      logger.info('error_reports table created successfully');
    }
  } catch (err) {
    throw err;
  }
}

/**
 * POST /api/error-reports
 * Submit a new error report
 */
router.post('/', ...errorReportValidation.create, asyncHandler(async (req, res) => {
  // Always return JSON responses from this route
  res.type('application/json');

  // Requires DB for persistence; consider fallback (e.g. file or queue) if reports must be accepted when DB is down
  const db = requireDatabase(req.app.locals.db, 'submitting error report');

  // Verify error_reports table exists, create if missing
  try {
    await ensureErrorReportsTable(db);
  } catch (tableCheckError) {
    logger.error('Error checking/creating error_reports table', {
      error: tableCheckError.message,
      stack: tableCheckError.stack
    });
    
    throw new ApiError(500, 'Database error while setting up error reports table', 'DATABASE_ERROR', {
      details: process.env.NODE_ENV !== 'production' ? tableCheckError.message : undefined
    });
  }

  const {
    title,
    description,
    error_message,
    error_stack,
    url,
    console_logs,
    screenshot_url,
    browser_info,
    screen_resolution
  } = req.body;

  const userId = getUserId(req, false);
  const userEmail = req.user?.email || null;
  const userAgent = req.get('User-Agent') || 'unknown';

  // Collect browser info if not provided
  const browserInfo = browser_info || JSON.stringify({
    userAgent: userAgent,
    language: req.get('Accept-Language'),
    platform: req.get('sec-ch-ua-platform')
  });

  const reportId = uuidv4();

  try {
    await TransactionManager.execute(
      db,
      `INSERT INTO error_reports (
        id, user_id, user_email, title, description, error_message, error_stack,
        url, user_agent, browser_info, screen_resolution, console_logs, screenshot_url,
        status, priority, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        reportId,
        userId,
        userEmail,
        title,
        description,
        error_message || null,
        error_stack || null,
        url || null,
        userAgent,
        browserInfo,
        screen_resolution || null,
        console_logs || null,
        screenshot_url || null,
        'new',
        'medium'
      ]
    );
    
    const result = {
      id: reportId,
      report: {
        id: reportId,
        title,
        description,
        errorMessage: error_message || null,
        url: url || null,
        status: 'new',
        priority: 'medium'
      },
      message: 'Error report submitted successfully'
    };

    logger.info('Error report created successfully', {
      reportId,
      userId: userId || 'anonymous',
      title,
      hasError: !!error_message
    });

    res.status(201).json(result);
  } catch (err) {
    // Log detailed error information
    logger.error('Error creating error report', {
      error: err.message,
      stack: err.stack,
      code: err.code,
      userId: userId || 'anonymous',
      title,
      reportId
    });

    // Handle specific database errors
    if (err.code && err.code.startsWith('SQLITE_')) {
      if (err.code === 'SQLITE_CONSTRAINT') {
        throw new ApiError(400, 'Invalid data provided', 'VALIDATION_ERROR', {
          details: err.message
        });
      }
      throw new ApiError(500, 'Database error occurred while submitting error report', 'DATABASE_ERROR', {
        code: err.code,
        details: process.env.NODE_ENV !== 'production' ? err.message : undefined
      });
    }

    // Re-throw ApiError instances as-is
    if (err instanceof ApiError) {
      throw err;
    }

    // For other errors, wrap in ApiError
    throw new ApiError(500, 'Failed to submit error report', 'SUBMISSION_ERROR', {
      details: process.env.NODE_ENV !== 'production' ? err.message : undefined
    });
  }
}));

/**
 * GET /api/error-reports
 * Get all error reports (admin only)
 */
router.get('/', requireAdmin, asyncHandler(async (req, res, next) => {
  const db = requireDatabase(req.app.locals.db, 'fetching error reports');

  // Ensure table exists
  try {
    await ensureErrorReportsTable(db);
  } catch (tableCheckError) {
    logger.error('Error checking/creating error_reports table', {
      error: tableCheckError.message
    });
    throw ApiError.database('Database error while setting up error reports table', { originalError: tableCheckError.message }, 'SETUP_ERROR_REPORTS_TABLE_FAILED');
  }

  const { status, limit = 50, offset = 0 } = req.query;

  try {
    let query = `SELECT id, user_id, user_email, title, description, error_message, error_stack,
      url, user_agent, browser_info, screen_resolution, console_logs, screenshot_url,
      status, priority, assigned_to, resolution_notes, created_at, updated_at, resolved_at
      FROM error_reports`;
    const params = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const reports = await TransactionManager.queryAll(db, query, params);
    res.json({ reports });
  } catch (err) {
    // Re-throw ApiError instances
    if (err instanceof ApiError) {
      throw err;
    }
    logger.error('Error fetching error reports', {
      error: err.message,
      stack: err.stack
    });
    throw ApiError.database('Failed to fetch error reports', { originalError: err.message }, 'FETCH_ERROR_REPORTS_FAILED');
  }
}));

/**
 * GET /api/error-reports/stats/summary
 * Get error report statistics (admin only)
 */
router.get('/stats/summary', requireAdmin, asyncHandler(async (req, res, next) => {
  const db = requireDatabase(req.app.locals.db, 'fetching error report stats');

  // Ensure table exists
  try {
    await ensureErrorReportsTable(db);
  } catch (tableCheckError) {
    logger.error('Error checking/creating error_reports table', {
      error: tableCheckError.message
    });
    throw ApiError.database('Database error while setting up error reports table', { originalError: tableCheckError.message }, 'SETUP_ERROR_REPORTS_TABLE_FAILED');
  }

  try {
    const statusCounts = await TransactionManager.queryAll(
      db,
      `SELECT 
        status,
        COUNT(*) as count
      FROM error_reports
      GROUP BY status`,
      []
    );

    const priorityCounts = await TransactionManager.queryAll(
      db,
      `SELECT 
        priority,
        COUNT(*) as count
      FROM error_reports
      WHERE status != 'resolved' AND status != 'dismissed'
      GROUP BY priority`,
      []
    );

    const totalResult = await TransactionManager.query(
      db,
      `SELECT COUNT(*) as total FROM error_reports`,
      []
    );

    const stats = {
      total: totalResult.total,
      byStatus: statusCounts.reduce((acc, row) => {
        acc[row.status] = row.count;
        return acc;
      }, {}),
      byPriority: priorityCounts.reduce((acc, row) => {
        acc[row.priority] = row.count;
        return acc;
      }, {})
    };

    res.json(stats);
  } catch (err) {
    // Re-throw ApiError instances
    if (err instanceof ApiError) {
      throw err;
    }
    logger.error('Error fetching error report stats', {
      error: err.message
    });
    throw ApiError.database('Failed to fetch statistics', { originalError: err.message }, 'FETCH_STATISTICS_FAILED');
  }
}));

/**
 * GET /api/error-reports/:id
 * Get a specific error report (admin only)
 */
router.get('/:id', requireAdmin, asyncHandler(async (req, res, next) => {
  const db = requireDatabase(req.app.locals.db, 'fetching error report');

  // Ensure table exists
  try {
    await ensureErrorReportsTable(db);
  } catch (tableCheckError) {
    logger.error('Error checking/creating error_reports table', {
      error: tableCheckError.message
    });
    throw ApiError.database('Database error while setting up error reports table', { originalError: tableCheckError.message }, 'SETUP_ERROR_REPORTS_TABLE_FAILED');
  }

  const { id } = req.params;

  try {
    const report = await TransactionManager.query(
      db,
      `SELECT id, user_id, user_email, title, description, error_message, error_stack,
      url, user_agent, browser_info, screen_resolution, console_logs, screenshot_url,
      status, priority, assigned_to, resolution_notes, created_at, updated_at, resolved_at
      FROM error_reports WHERE id = ?`,
      [id]
    );

    if (!report) {
      return next(ApiError.notFound('Report', 'REPORT_NOT_FOUND'));
    }

    res.json({ report });
  } catch (err) {
    // Re-throw ApiError instances
    if (err instanceof ApiError) {
      throw err;
    }
    logger.error('Error fetching error report', {
      error: err.message,
      reportId: id
    });
    throw ApiError.database('Failed to fetch error report', { originalError: err.message }, 'FETCH_ERROR_REPORT_FAILED');
  }
}));

/**
 * PATCH /api/error-reports/:id
 * Update error report status (admin only)
 */
router.patch('/:id', requireAdmin, ...errorReportValidation.update, asyncHandler(async (req, res, next) => {

  const db = requireDatabase(req.app.locals.db, 'updating error report');

  // Ensure table exists
  try {
    await ensureErrorReportsTable(db);
  } catch (tableCheckError) {
    logger.error('Error checking/creating error_reports table', {
      error: tableCheckError.message
    });
    throw ApiError.database('Database error while setting up error reports table', { originalError: tableCheckError.message }, 'SETUP_ERROR_REPORTS_TABLE_FAILED');
  }

  const { id } = req.params;
  const { status, priority, assigned_to, resolution_notes } = req.body;

  const updates = [];
  const params = [];

  if (status) {
    updates.push('status = ?');
    params.push(status);
    
    if (status === 'resolved') {
      updates.push('resolved_at = CURRENT_TIMESTAMP');
    }
  }

  if (priority) {
    updates.push('priority = ?');
    params.push(priority);
  }

  if (assigned_to !== undefined) {
    updates.push('assigned_to = ?');
    params.push(assigned_to || null);
  }

  if (resolution_notes !== undefined) {
    updates.push('resolution_notes = ?');
    params.push(resolution_notes || null);
  }

  if (updates.length === 0) {
    return next(ApiError.validation('No fields to update', null, 'NO_FIELDS_TO_UPDATE'));
  }

  // Validate field names against whitelist to prevent SQL injection
  const { validateFieldNames, getFieldWhitelist } = require('../utils/fieldValidation');
  const allowedFields = getFieldWhitelist('error_reports');
  // Extract field names from "field = ?" format
  const fieldNames = updates
    .filter(update => update.includes(' = ?'))
    .map(update => update.split(' = ?')[0]);
  validateFieldNames(fieldNames, allowedFields);

  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  try {
    const result = await TransactionManager.execute(
      db,
      `UPDATE error_reports SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    if (result.changes === 0) {
      return next(ApiError.notFound('Report', 'REPORT_NOT_FOUND'));
    }

    res.json({ message: 'Report updated successfully' });
  } catch (err) {
    // Re-throw ApiError instances
    if (err instanceof ApiError) {
      throw err;
    }
    logger.error('Error updating error report', {
      error: err.message,
      reportId: id
    });
    throw ApiError.database('Failed to update error report', { originalError: err.message }, 'UPDATE_ERROR_REPORT_FAILED');
  }
}));

module.exports = router;

