/**
 * Server-side store for user vote receipts (convenience / cross-device access).
 */

const { v4: uuidv4 } = require('uuid');
const TransactionManager = require('../database/services/TransactionManager');
const { ApiError } = require('../middleware/errorHandler');
const { VALID_VOTE_TYPES } = require('../utils/voteVerificationLog');

function normalizeReceiptRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    voteType: row.vote_type,
    contestId: row.contest_id,
    receiptId: row.receipt_id,
    contestTitle: row.contest_title || undefined,
    voteRecordedAt: row.vote_recorded_at
      ? new Date(row.vote_recorded_at).toISOString()
      : undefined,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined
  };
}

async function saveUserReceipt(db, {
  userId,
  organizationId,
  voteType,
  contestId,
  receiptId,
  contestTitle,
  voteRecordedAt
}) {
  if (!userId || !organizationId || !voteType || !contestId || !receiptId) {
    throw ApiError.validation('userId, organizationId, voteType, contestId, and receiptId are required');
  }
  if (!VALID_VOTE_TYPES.has(voteType)) {
    throw ApiError.validation(`Invalid voteType: ${voteType}`);
  }

  const existing = await TransactionManager.query(db, `
    SELECT id FROM user_vote_receipts
    WHERE user_id = ? AND vote_type = ? AND contest_id = ?
  `, [userId, voteType, contestId]);

  const now = new Date().toISOString();
  if (existing) {
    await TransactionManager.execute(db, `
      UPDATE user_vote_receipts
      SET receipt_id = ?, contest_title = ?, vote_recorded_at = ?, organization_id = ?, updated_at = ?
      WHERE id = ?
    `, [receiptId, contestTitle || null, voteRecordedAt || now, organizationId, now, existing.id]);
    const row = await TransactionManager.query(db, 'SELECT * FROM user_vote_receipts WHERE id = ?', [existing.id]);
    return normalizeReceiptRow(row);
  }

  const id = uuidv4();
  await TransactionManager.execute(db, `
    INSERT INTO user_vote_receipts (
      id, user_id, organization_id, vote_type, contest_id, receipt_id, contest_title, vote_recorded_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, userId, organizationId, voteType, contestId, receiptId,
    contestTitle || null, voteRecordedAt || now, now, now
  ]);
  const row = await TransactionManager.query(db, 'SELECT * FROM user_vote_receipts WHERE id = ?', [id]);
  return normalizeReceiptRow(row);
}

async function listUserReceipts(db, userId, organizationId, { limit = 100, offset = 0 } = {}) {
  const safeLimit = Math.min(Math.max(1, limit), 500);
  const safeOffset = Math.max(0, offset);
  const countRow = await TransactionManager.query(db, `
    SELECT COUNT(*) AS total FROM user_vote_receipts WHERE user_id = ? AND organization_id = ?
  `, [userId, organizationId]);
  const rows = await TransactionManager.queryAll(db, `
    SELECT * FROM user_vote_receipts
    WHERE user_id = ? AND organization_id = ?
    ORDER BY COALESCE(vote_recorded_at, updated_at) DESC
    LIMIT ? OFFSET ?
  `, [userId, organizationId, safeLimit, safeOffset]);
  return {
    receipts: (rows || []).map(normalizeReceiptRow),
    total: countRow?.total ?? 0,
    limit: safeLimit,
    offset: safeOffset
  };
}

async function getUserReceiptForContest(db, userId, voteType, contestId) {
  const row = await TransactionManager.query(db, `
    SELECT * FROM user_vote_receipts
    WHERE user_id = ? AND vote_type = ? AND contest_id = ?
  `, [userId, voteType, contestId]);
  return normalizeReceiptRow(row);
}

module.exports = {
  saveUserReceipt,
  listUserReceipts,
  getUserReceiptForContest,
  normalizeReceiptRow
};
