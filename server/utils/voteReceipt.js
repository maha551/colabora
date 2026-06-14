/**
 * Voter receipt and vote hash utilities (Agent D).
 * See docs/active/VERIFIABILITY_SPEC.md §6 (Receipt) and §7 (Vote hash).
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

/** Vote types that are non-anonymous (hash may include userId). Only organization is non-anonymous. */
const NON_ANONYMOUS_VOTE_TYPES = new Set(['organization']);

/**
 * Serialize an object to JSON with alphabetically sorted keys for deterministic hashing.
 * @param {Object} obj
 * @returns {string}
 */
function canonicalJson(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  const keys = Object.keys(obj).sort();
  const out = {};
  for (const k of keys) {
    out[k] = obj[k];
  }
  return JSON.stringify(out);
}

/**
 * SHA-256 hash of a string, hex-encoded.
 * @param {string} str
 * @returns {string}
 */
function sha256Hex(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

/**
 * Generate a new receipt ID (UUID).
 * @returns {string}
 */
function generateReceiptId() {
  return uuidv4();
}

/**
 * Compute vote hash for a given vote type. Deterministic: same inputs => same hash.
 * Anonymous types: do not include userId (use contestId, choice, timestamp, receiptId).
 * Non-anonymous (organization): include contestId, userId, choice, timestamp, receiptId.
 * Representative election: anonymous uses sessionId, token, ranking, timestamp with sorted keys (no userId).
 * Public representative elections include contestId, userId, choice, timestamp, receiptId.
 *
 * @param {string} voteType - One of: paragraph, document, document_deletion, document_tree, structure, governance_rule, organization, representative_election
 * @param {Object} options - Hash input fields
 * @param {string} options.contestId - Contest identifier
 * @param {string} options.choice - Vote value (PRO/NEUTRAL/CONTRA or yes/no/abstain)
 * @param {string} options.timestamp - ISO 8601 timestamp
 * @param {string} options.receiptId - Receipt/nonce (required for anonymous generic; used as nonce for organization)
 * @param {string} [options.userId] - User ID (only for non-anonymous; must not be set for anonymous)
 * @param {string} [options.sessionId] - For representative_election only (voting_session_id)
 * @param {string} [options.token] - For representative_election only (anonymous token; not exported/logged)
 * @param {Array|string} [options.ranking] - For representative_election only (candidate ranking or vote_choice)
 * @returns {string} SHA-256 hex hash
 */
function computeVoteHash(voteType, options) {
  const {
    contestId,
    choice,
    timestamp,
    receiptId,
    userId,
    sessionId,
    token,
    ranking
  } = options;

  if (voteType === 'representative_election') {
    if (userId) {
      const obj = {
        choice: choice != null ? choice : (ranking != null ? ranking : undefined),
        contestId: contestId || '',
        receiptId,
        timestamp: timestamp || new Date().toISOString(),
        userId
      };
      return sha256Hex(canonicalJson(obj));
    }
    // Spec §7.4: anonymous elections hash sessionId, token, ranking, timestamp.
    const obj = {
      sessionId: sessionId || contestId,
      token: token,
      ranking: ranking != null ? ranking : undefined,
      timestamp: timestamp || new Date().toISOString()
    };
    return sha256Hex(JSON.stringify(obj));
  }

  const isNonAnonymous = NON_ANONYMOUS_VOTE_TYPES.has(voteType);
  if (isNonAnonymous) {
    // Organization: H(contestId, userId, choice, timestamp, nonce=receiptId)
    const obj = {
      choice,
      contestId,
      receiptId,
      timestamp,
      userId: userId || ''
    };
    return sha256Hex(canonicalJson(obj));
  }

  // Anonymous: do not include userId. H(contestId, choice, timestamp, receiptId)
  const obj = {
    choice,
    contestId,
    receiptId,
    timestamp
  };
  return sha256Hex(canonicalJson(obj));
}

/**
 * Optional short verification code derived from receiptId (e.g. first 8 chars) for "my receipt is in the list" checks.
 * @param {string} receiptId
 * @param {number} [length=8]
 * @returns {string}
 */
function verificationCodeFromReceipt(receiptId, length = 8) {
  if (!receiptId || typeof receiptId !== 'string') return '';
  return receiptId.replace(/-/g, '').slice(0, length);
}

module.exports = {
  generateReceiptId,
  computeVoteHash,
  verificationCodeFromReceipt,
  canonicalJson,
  sha256Hex,
  NON_ANONYMOUS_VOTE_TYPES
};
