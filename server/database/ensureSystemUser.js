const crypto = require('crypto');
const TransactionManager = require('./services/TransactionManager');
const { hashPassword } = require('../middleware/auth');
const { SYSTEM_USER_ID } = require('../utils/auditUserIds');

const SYSTEM_USER_EMAIL = 'system@system.local';

/**
 * Ensure the synthetic "system" user exists for audit FK constraints.
 * Idempotent and concurrency-safe — safe to call after test schema truncation,
 * or on app boot when several instances/workers may initialize the same database
 * at once. The SELECT short-circuits the common case; the INSERT uses
 * `ON CONFLICT DO NOTHING` so a concurrent insert of the same fixed row cannot
 * raise a duplicate-key error.
 */
async function ensureSystemUser(knex) {
  const existing = await TransactionManager.query(
    knex,
    'SELECT id FROM users WHERE id = ?',
    [SYSTEM_USER_ID]
  );
  if (existing) {
    return;
  }

  const passwordHash = await hashPassword(crypto.randomBytes(32).toString('hex'));
  await TransactionManager.execute(
    knex,
    `INSERT INTO users (id, name, email, password_hash, role, created_at)
     VALUES (?, ?, ?, ?, 'user', CURRENT_TIMESTAMP)
     ON CONFLICT DO NOTHING`,
    [SYSTEM_USER_ID, 'System', SYSTEM_USER_EMAIL, passwordHash]
  );
}

module.exports = { ensureSystemUser, SYSTEM_USER_EMAIL };
