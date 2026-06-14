'use strict';

const { v4: uuidv4 } = require('uuid');
const TransactionManager = require('../database/services/TransactionManager');
const { logger } = require('../middleware/logger');

function extractRequestMeta(req) {
  if (!req) return { ipAddress: null, userAgent: null };
  return {
    ipAddress: req.ip || req.connection?.remoteAddress || null,
    userAgent: req.get?.('User-Agent') || null,
  };
}

async function ensurePlatformAuditTable(db) {
  const row = await TransactionManager.query(
    db,
    "SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'platform_audit'",
    []
  );
  if (row) return;

  await TransactionManager.execute(db, `CREATE TABLE IF NOT EXISTS platform_audit (
    id TEXT PRIMARY KEY,
    admin_user_id TEXT NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    details TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await TransactionManager.execute(db, 'CREATE INDEX IF NOT EXISTS idx_platform_audit_created_at ON platform_audit(created_at DESC)');
  await TransactionManager.execute(db, 'CREATE INDEX IF NOT EXISTS idx_platform_audit_admin_user_id ON platform_audit(admin_user_id)');
  await TransactionManager.execute(db, 'CREATE INDEX IF NOT EXISTS idx_platform_audit_target ON platform_audit(target_type, target_id)');
}

/**
 * @param {Object} db
 * @param {{ adminUserId: string, action: string, targetType?: string, targetId?: string, details?: Object, req?: Object }} params
 */
async function logAction(db, params) {
  if (!db || !params?.adminUserId || !params?.action) return;

  try {
    await ensurePlatformAuditTable(db);
    const { ipAddress, userAgent } = extractRequestMeta(params.req);
    await TransactionManager.execute(
      db,
      `INSERT INTO platform_audit (id, admin_user_id, action, target_type, target_id, details, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        uuidv4(),
        params.adminUserId,
        params.action,
        params.targetType || null,
        params.targetId || null,
        params.details ? JSON.stringify(params.details) : null,
        ipAddress,
        userAgent,
      ]
    );
  } catch (err) {
    logger.warn('Failed to persist platform audit entry', { error: err.message, action: params.action });
  }
}

async function listActions(db, options = {}) {
  await ensurePlatformAuditTable(db);
  const limit = Math.min(Math.max(1, parseInt(options.limit, 10) || 50), 200);
  const offset = parseInt(options.offset, 10) || 0;
  const { action, adminUserId } = options;

  let where = 'WHERE 1=1';
  const params = [];
  if (action) {
    where += ' AND pa.action = ?';
    params.push(action);
  }
  if (adminUserId) {
    where += ' AND pa.admin_user_id = ?';
    params.push(adminUserId);
  }

  const rows = await TransactionManager.queryAll(
    db,
    `SELECT pa.*, u.name as admin_name, u.email as admin_email
     FROM platform_audit pa
     LEFT JOIN users u ON pa.admin_user_id = u.id
     ${where}
     ORDER BY pa.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const countRow = await TransactionManager.query(
    db,
    `SELECT COUNT(*) as count FROM platform_audit pa ${where}`,
    params
  );

  return {
    actions: rows.map((row) => ({
      id: row.id,
      adminUserId: row.admin_user_id,
      adminName: row.admin_name || row.admin_email,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      details: row.details ? JSON.parse(row.details) : null,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at,
    })),
    total: parseInt(countRow?.count || 0, 10),
    limit,
    offset,
  };
}

async function getStats(db) {
  await ensurePlatformAuditTable(db);
  const totalRow = await TransactionManager.query(db, 'SELECT COUNT(*) as count FROM platform_audit', []);
  const byAction = await TransactionManager.queryAll(
    db,
    `SELECT action, COUNT(*) as count FROM platform_audit GROUP BY action ORDER BY count DESC LIMIT 20`,
    []
  );
  return {
    total: parseInt(totalRow?.count || 0, 10),
    byAction: byAction.reduce((acc, row) => {
      acc[row.action] = parseInt(row.count, 10);
      return acc;
    }, {}),
  };
}

module.exports = {
  logAction,
  listActions,
  getStats,
  ensurePlatformAuditTable,
};
