/**
 * Vote verification API (Agent C log read; Agent D receipts).
 * GET /api/vote-verification/log, /log/chain, /receipts
 * See docs/active/VERIFIABILITY_SPEC.md § 5 and § 6.
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const TransactionManager = require('../database/services/TransactionManager');
const { VALID_VOTE_TYPES } = require('../utils/voteVerificationLog');
const ballotExport = require('../utils/ballotExport');
const {
  assertContestAccess,
  assertOrganizationContestAccess,
  getOrganizationContestIds
} = require('../utils/contestAccess');
const VoteReceiptService = require('../services/VoteReceiptService');
const { getUserId } = require('../utils/routeHelpers');

const router = express.Router();

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

/**
 * GET /api/vote-verification/log
 * Query: voteType (required), contestId (required), limit?, offset?
 * Response: { entries: [...], total } - entries in ascending sequence order; no PII.
 */
router.get('/log', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  if (!db) {
    throw ApiError.database('Database unavailable', null, 'DB_UNAVAILABLE');
  }

  const voteType = (req.query.voteType || '').trim();
  const contestId = (req.query.contestId || '').trim();
  const limit = Math.min(
    Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT),
    MAX_LIMIT
  );
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

  if (!voteType || !contestId) {
    throw ApiError.badRequest(
      'Query parameters voteType and contestId are required',
      { voteType: voteType || undefined, contestId: contestId || undefined },
      'MISSING_PARAMS'
    );
  }

  if (!VALID_VOTE_TYPES.has(voteType)) {
    throw ApiError.badRequest(
      `voteType must be one of: ${[...VALID_VOTE_TYPES].sort().join(', ')}`,
      { voteType },
      'INVALID_VOTE_TYPE'
    );
  }

  const userId = getUserId(req);
  await assertContestAccess(db, userId, voteType, contestId, req.user?.role);

  const whereClause = 'vote_type = ? AND contest_id = ?';
  const params = [voteType, contestId];

  const countRow = await TransactionManager.query(
    db,
    `SELECT COUNT(*) AS total FROM vote_verification_log WHERE ${whereClause}`,
    params
  );
  const total = countRow?.total ?? 0;

  const queryParams = [...params, limit, offset];
  const rows = await TransactionManager.queryAll(
    db,
    `SELECT sequence_index AS "logSequenceId", previous_entry_hash AS "previousEntryHash", vote_type AS "voteType",
            contest_id AS "contestId", choice, timestamp, vote_hash AS "voteHash", receipt_id AS "receiptId", created_at AS "createdAt"
     FROM vote_verification_log
     WHERE ${whereClause}
     ORDER BY sequence_index ASC
     LIMIT ? OFFSET ?`,
    queryParams
  );

  res.json({
    entries: rows || [],
    total,
    limit,
    offset
  });
}));

/**
 * GET /api/vote-verification/log/chain
 * Query: organizationId (required), limit? (default 50, max 500)
 * Response: { entries: [...], total } for chain verification scoped to org contests.
 */
router.get('/log/chain', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  if (!db) {
    throw ApiError.database('Database unavailable', null, 'DB_UNAVAILABLE');
  }

  const organizationId = (req.query.organizationId || '').trim();
  if (!organizationId) {
    throw ApiError.badRequest(
      'Query parameter organizationId is required',
      { organizationId: undefined },
      'MISSING_PARAMS'
    );
  }

  const limit = Math.min(
    Math.max(1, parseInt(req.query.limit, 10) || 50),
    500
  );

  const userId = getUserId(req);
  await assertOrganizationContestAccess(db, userId, organizationId, req.user?.role);

  const contestIds = await getOrganizationContestIds(db, organizationId);
  if (contestIds.length === 0) {
    return res.json({ entries: [], total: 0, limit });
  }

  const placeholders = contestIds.map(() => '?').join(', ');
  const countRow = await TransactionManager.query(
    db,
    `SELECT COUNT(*) AS total FROM vote_verification_log WHERE contest_id IN (${placeholders})`,
    contestIds
  );
  const total = countRow?.total ?? 0;

  const rows = await TransactionManager.queryAll(
    db,
    `SELECT sequence_index AS "logSequenceId", previous_entry_hash AS "previousEntryHash", vote_type AS "voteType",
            contest_id AS "contestId", choice, timestamp, vote_hash AS "voteHash", receipt_id AS "receiptId", created_at AS "createdAt"
     FROM vote_verification_log
     WHERE contest_id IN (${placeholders})
     ORDER BY sequence_index DESC
     LIMIT ?`,
    [...contestIds, limit]
  );

  res.json({
    entries: (rows || []).reverse(),
    total,
    limit
  });
}));

/**
 * GET /api/vote-verification/receipts (Agent D)
 * Query: voteType (required), contestId (required)
 * Response: { receiptIds: string[], voteHashes: string[] } in deterministic order (created_at ASC, id ASC). No PII.
 */
router.get('/receipts', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  if (!db) {
    throw ApiError.database('Database unavailable', null, 'DB_UNAVAILABLE');
  }
  const voteType = (req.query.voteType || '').trim();
  const contestId = (req.query.contestId || '').trim();
  if (!voteType || !contestId) {
    throw ApiError.badRequest('voteType and contestId are required', { voteType: voteType || undefined, contestId: contestId || undefined }, 'MISSING_PARAMS');
  }
  if (!VALID_VOTE_TYPES.has(voteType)) {
    throw ApiError.badRequest(
      `voteType must be one of: ${[...VALID_VOTE_TYPES].sort().join(', ')}`,
      { voteType },
      'INVALID_VOTE_TYPE'
    );
  }

  const userId = getUserId(req);
  await assertContestAccess(db, userId, voteType, contestId, req.user?.role);

  const context = await ballotExport.resolveContest(db, voteType, contestId);
  if (!context) {
    throw ApiError.notFound('Contest', 'CONTEST_NOT_FOUND');
  }

  const { closed } = await ballotExport.isContestClosed(db, voteType, contestId);
  if (!closed) {
    throw ApiError.forbidden(
      'Contest is not closed; receipts are only available after voting has ended.',
      'CONTEST_NOT_CLOSED'
    );
  }

  const rows = await ballotExport.getBallotsForContest(db, voteType, contestId);
  const receiptIds = [];
  const voteHashes = [];
  for (const row of rows || []) {
    const rid = row.receipt_id != null ? row.receipt_id : row.id;
    if (rid) receiptIds.push(String(rid));
    if (row.vote_hash != null) voteHashes.push(String(row.vote_hash));
  }
  res.json({ receiptIds, voteHashes });
}));

/**
 * POST /api/vote-verification/my-receipts
 * Body: { organizationId, voteType, contestId, receiptId, contestTitle?, voteRecordedAt? }
 */
router.post('/my-receipts', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  if (!db) {
    throw ApiError.database('Database unavailable', null, 'DB_UNAVAILABLE');
  }

  const userId = getUserId(req);
  const {
    organizationId,
    voteType,
    contestId,
    receiptId,
    contestTitle,
    voteRecordedAt
  } = req.body || {};

  if (!organizationId || !voteType || !contestId || !receiptId) {
    throw ApiError.badRequest(
      'organizationId, voteType, contestId, and receiptId are required',
      null,
      'MISSING_PARAMS'
    );
  }

  if (!VALID_VOTE_TYPES.has(voteType)) {
    throw ApiError.badRequest(
      `voteType must be one of: ${[...VALID_VOTE_TYPES].sort().join(', ')}`,
      { voteType },
      'INVALID_VOTE_TYPE'
    );
  }

  await assertOrganizationContestAccess(db, userId, organizationId, req.user?.role);

  const saved = await VoteReceiptService.saveUserReceipt(db, {
    userId,
    organizationId,
    voteType,
    contestId,
    receiptId,
    contestTitle,
    voteRecordedAt
  });

  res.status(201).json({ success: true, receipt: saved });
}));

/**
 * GET /api/vote-verification/my-receipts?organizationId=
 */
router.get('/my-receipts', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  if (!db) {
    throw ApiError.database('Database unavailable', null, 'DB_UNAVAILABLE');
  }

  const organizationId = (req.query.organizationId || '').trim();
  if (!organizationId) {
    throw ApiError.badRequest('Query parameter organizationId is required', null, 'MISSING_PARAMS');
  }

  const userId = getUserId(req);
  await assertOrganizationContestAccess(db, userId, organizationId, req.user?.role);

  const limit = parseInt(req.query.limit, 10);
  const offset = parseInt(req.query.offset, 10);
  const result = await VoteReceiptService.listUserReceipts(db, userId, organizationId, {
    limit: Number.isFinite(limit) ? limit : 100,
    offset: Number.isFinite(offset) ? offset : 0
  });

  res.json(result);
}));

module.exports = router;
