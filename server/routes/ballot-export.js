/**
 * Ballot export API for vote verifiability (Agent B).
 * GET /api/verification/ballots?voteType=&contestId=
 * Returns anonymized ballots for closed contests only.
 * See docs/active/VERIFIABILITY_SPEC.md §4.
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { VOTE_TYPES, exportBallots } = require('../utils/ballotExport');
const { verifyContestExport } = require('../utils/tallyVerifier');
const { assertContestAccess, assertOrganizationContestAccess } = require('../utils/contestAccess');
const { listVerifiableContestsForOrganization } = require('../utils/verificationContestList');
const { getUserId } = require('../utils/routeHelpers');

const router = express.Router();

/**
 * GET /api/verification/ballots
 * Query: voteType (required), contestId (required)
 * Response: { contestId, voteType, ballots, closedAt?, announcedResult? }
 */
router.get('/ballots', requireAuth, asyncHandler(async (req, res) => {
  const voteType = (req.query.voteType || '').trim();
  const contestId = (req.query.contestId || '').trim();

  if (!voteType || !contestId) {
    throw ApiError.badRequest(
      'Query parameters voteType and contestId are required',
      { voteType: voteType || undefined, contestId: contestId || undefined },
      'MISSING_PARAMS'
    );
  }

  if (!VOTE_TYPES.includes(voteType)) {
    throw ApiError.badRequest(
      `voteType must be one of: ${VOTE_TYPES.join(', ')}`,
      { voteType },
      'INVALID_VOTE_TYPE'
    );
  }

  const db = req.app.locals.knex || req.app.locals.db;
  if (!db) {
    throw ApiError.database('Database unavailable', null, 'DB_UNAVAILABLE');
  }

  const userId = getUserId(req);
  await assertContestAccess(db, userId, voteType, contestId, req.user?.role);

  const result = await exportBallots(db, voteType, contestId);

  if (!result) {
    throw ApiError.notFound('Contest', 'CONTEST_NOT_FOUND');
  }

  if (result.notClosed) {
    throw ApiError.forbidden(
      'Contest is not closed; ballot export is only available after voting has ended.',
      'CONTEST_NOT_CLOSED'
    );
  }

  res.json({
    contestId: result.contestId,
    voteType: result.voteType,
    ballots: result.ballots,
    closedAt: result.closedAt ?? null,
    ...(result.announcedResult && { announcedResult: result.announcedResult }),
    ...(result.announcedOptionCounts && { announcedOptionCounts: result.announcedOptionCounts })
  });
}));

/**
 * GET /api/verification/contests
 * Query: organizationId (required), limit?, offset?
 * Lists closed verifiable contests for an organization.
 */
router.get('/contests', requireAuth, asyncHandler(async (req, res) => {
  const organizationId = (req.query.organizationId || '').trim();
  if (!organizationId) {
    throw ApiError.badRequest('Query parameter organizationId is required', null, 'MISSING_PARAMS');
  }

  const db = req.app.locals.knex || req.app.locals.db;
  if (!db) {
    throw ApiError.database('Database unavailable', null, 'DB_UNAVAILABLE');
  }

  const userId = getUserId(req);
  await assertOrganizationContestAccess(db, userId, organizationId, req.user?.role);

  const limit = parseInt(req.query.limit, 10);
  const offset = parseInt(req.query.offset, 10);
  const result = await listVerifiableContestsForOrganization(db, organizationId, {
    limit: Number.isFinite(limit) ? limit : 100,
    offset: Number.isFinite(offset) ? offset : 0
  });

  res.json(result);
}));

/**
 * GET /api/verification/verify (Agent E)
 * Query: voteType (required), contestId (required)
 * Recomputes tally from ballots and compares to announced result.
 * Response: { match, contestId, voteType, computed, announcedResult?, diff? }
 */
router.get('/verify', requireAuth, asyncHandler(async (req, res) => {
  const voteType = (req.query.voteType || '').trim();
  const contestId = (req.query.contestId || '').trim();

  if (!voteType || !contestId) {
    throw ApiError.badRequest(
      'Query parameters voteType and contestId are required',
      { voteType: voteType || undefined, contestId: contestId || undefined },
      'MISSING_PARAMS'
    );
  }

  if (!VOTE_TYPES.includes(voteType)) {
    throw ApiError.badRequest(
      `voteType must be one of: ${VOTE_TYPES.join(', ')}`,
      { voteType },
      'INVALID_VOTE_TYPE'
    );
  }

  const db = req.app.locals.knex || req.app.locals.db;
  if (!db) {
    throw ApiError.database('Database unavailable', null, 'DB_UNAVAILABLE');
  }

  const userId = getUserId(req);
  await assertContestAccess(db, userId, voteType, contestId, req.user?.role);

  const result = await exportBallots(db, voteType, contestId);

  if (!result) {
    throw ApiError.notFound('Contest', 'CONTEST_NOT_FOUND');
  }

  if (result.notClosed) {
    throw ApiError.forbidden(
      'Contest is not closed; verification is only available after voting has ended.',
      'CONTEST_NOT_CLOSED'
    );
  }

  const verification = await verifyContestExport(db, result);

  res.json({
    contestId: result.contestId,
    voteType: result.voteType,
    ...verification
  });
}));

module.exports = router;
