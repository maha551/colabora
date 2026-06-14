/**
 * Vote verification log – append-only immutable log of vote events.
 * Used for audit and chain verification. See docs/active/VERIFIABILITY_SPEC.md § 5.
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const TransactionManager = require('../database/services/TransactionManager');
const votingLockManager = require('./votingLocks');
const { logger } = require('../middleware/logger');

const VALID_VOTE_TYPES = new Set([
  'paragraph',
  'document',
  'document_deletion',
  'document_tree',
  'structure',
  'governance_rule',
  'organization',
  'representative_election',
  'meeting_vote'
]);

/**
 * Build deterministic canonical string for a log row (for chaining).
 * Keys in alphabetical order; null/undefined omitted or normalized.
 * @param {Object} row - Log row fields
 * @returns {string}
 */
function canonicalLogRowString(row) {
  const obj = {
    choice: row.choice ?? '',
    contest_id: row.contest_id ?? '',
    created_at: row.created_at ?? '',
    id: row.id ?? '',
    previous_entry_hash: row.previous_entry_hash ?? '',
    receipt_id: row.receipt_id ?? '',
    sequence_index: row.sequence_index ?? 0,
    timestamp: row.timestamp ?? '',
    vote_hash: row.vote_hash ?? '',
    vote_type: row.vote_type ?? ''
  };
  return JSON.stringify(obj);
}

/**
 * Hash a canonical string (SHA-256 hex).
 * @param {string} str
 * @returns {string}
 */
function hashCanonical(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

/**
 * Append one entry to the vote verification log.
 * Must be called from within the same transaction as the vote write when possible.
 * Uses a global lock so only one append runs at a time (preserves chain).
 *
 * @param {Object} dbOrTrx - Knex instance or transaction (same as vote write transaction)
 * @param {Object} entry - { voteType, contestId, choice, timestamp, receiptId?, voteHash? }
 * @returns {Promise<{ id: string, sequence_index: number }>}
 */
async function appendLogEntry(dbOrTrx, entry) {
  const { voteType, contestId, choice, timestamp, receiptId = null, voteHash = null } = entry;

  if (!voteType || !VALID_VOTE_TYPES.has(voteType)) {
    throw new Error(`voteVerificationLog.appendLogEntry: invalid voteType "${voteType}"`);
  }
  if (contestId == null || contestId === '') {
    throw new Error('voteVerificationLog.appendLogEntry: contestId is required');
  }
  if (choice == null || choice === '') {
    throw new Error('voteVerificationLog.appendLogEntry: choice is required');
  }
  if (!timestamp) {
    throw new Error('voteVerificationLog.appendLogEntry: timestamp is required');
  }

  const runAppend = async (conn) => {
    const lastRow = await TransactionManager.query(
      conn,
      `SELECT id, sequence_index, previous_entry_hash, vote_type, contest_id, choice, timestamp, vote_hash, receipt_id, created_at
       FROM vote_verification_log
       ORDER BY sequence_index DESC
       LIMIT 1`
    );

    const sequenceIndex = lastRow ? (lastRow.sequence_index + 1) : 1;
    const previousEntryHash = lastRow
      ? hashCanonical(canonicalLogRowString(lastRow))
      : '';

    const id = uuidv4();
    const createdAt = new Date().toISOString();

    await TransactionManager.execute(
      conn,
      `INSERT INTO vote_verification_log (
        id, sequence_index, previous_entry_hash, vote_type, contest_id, choice, timestamp, vote_hash, receipt_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, sequenceIndex, previousEntryHash, voteType, contestId, choice, timestamp, voteHash, receiptId, createdAt]
    );

    logger.debug('Vote verification log entry appended', { voteType, contestId, sequenceIndex });
    return { id, sequence_index: sequenceIndex };
  };

  return votingLockManager.withVoteLock('verification_log', 'append', async () => {
    const isTransaction = dbOrTrx && typeof dbOrTrx.commit === 'function';
    if (isTransaction) {
      return runAppend(dbOrTrx);
    }
    return TransactionManager.executeInTransaction(dbOrTrx, runAppend);
  });
}

module.exports = {
  appendLogEntry,
  canonicalLogRowString,
  hashCanonical,
  VALID_VOTE_TYPES
};
