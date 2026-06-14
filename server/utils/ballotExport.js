/**
 * Ballot export utilities for vote verifiability (Agent B).
 * Provides: closed check, ballot query, anonymization, and announced result per vote type.
 * See docs/active/VERIFIABILITY_SPEC.md and docs/active/TALLY_SPEC.md.
 */

const TransactionManager = require('../database/services/TransactionManager');
const { calculateVoteCounts } = require('./voteCounts');

const VOTE_TYPES = [
  'paragraph',
  'document',
  'document_deletion',
  'document_tree',
  'structure',
  'governance_rule',
  'organization',
  'representative_election',
  'meeting_vote'
];

async function resolveRepresentativeElectionContext(db, contestId) {
  const session = await TransactionManager.query(db, `
    SELECT id, organization_id, related_entity_id, anonymous_voting
    FROM voting_sessions
    WHERE id = ?
  `, [contestId]);
  if (session) {
    return {
      organizationId: session.organization_id,
      electionId: session.related_entity_id,
      anonymousVoting: session.anonymous_voting === 1 || session.anonymous_voting === true,
      contestKind: 'session'
    };
  }

  const election = await TransactionManager.query(db, `
    SELECT id, organization_id, anonymous_voting, status, election_completed_at
    FROM representative_elections
    WHERE id = ?
  `, [contestId]);
  if (!election) return null;

  return {
    organizationId: election.organization_id,
    electionId: election.id,
    anonymousVoting: election.anonymous_voting === 1 || election.anonymous_voting === true,
    contestKind: 'election',
    electionStatus: election.status,
    electionCompletedAt: election.election_completed_at
  };
}

/**
 * Check if a contest is closed (voting ended) so ballot export is allowed.
 * @param {Object} db - Knex/db instance
 * @param {string} voteType - One of VOTE_TYPES
 * @param {string} contestId - Contest identifier (proposal_id, document_id, vote_id, voting_session_id)
 * @returns {Promise<{ closed: boolean, closedAt?: string }>}
 */
async function isContestClosed(db, voteType, contestId) {
  switch (voteType) {
    case 'paragraph': {
      const row = await TransactionManager.query(db, `
        SELECT p.id, p.invalidated, d.status AS doc_status,
               (SELECT 1 FROM history h WHERE h.proposal_id = p.id LIMIT 1) AS has_history
        FROM proposals p
        JOIN paragraphs pr ON p.paragraph_id = pr.id
        JOIN documents d ON pr.document_id = d.id
        WHERE p.id = ?
      `, [contestId]);
      if (!row) return { closed: false };
      const closed = row.doc_status !== 'voting' && row.doc_status !== 'proposal' ||
        row.invalidated === true || row.invalidated === true ||
        row.has_history != null;
      return { closed, closedAt: null };
    }
    case 'document':
    case 'document_deletion': {
      const doc = await TransactionManager.query(db, `
        SELECT status, updated_at FROM documents WHERE id = ?
      `, [contestId]);
      if (!doc) return { closed: false };
      const closed = doc.status !== 'voting';
      const closedAt = doc.updated_at ? new Date(doc.updated_at).toISOString() : null;
      return { closed, closedAt };
    }
    case 'document_tree': {
      const row = await TransactionManager.query(db, `
        SELECT status FROM document_tree_proposals WHERE id = ?
      `, [contestId]);
      if (!row) return { closed: false };
      const closed = ['approved', 'rejected', 'applied'].includes(row.status);
      return { closed, closedAt: null };
    }
    case 'structure': {
      const row = await TransactionManager.query(db, `
        SELECT voting_deadline, applied, updated_at FROM structure_proposals WHERE id = ?
      `, [contestId]);
      if (!row) return { closed: false };
      const now = new Date();
      const deadlinePassed = row.voting_deadline && new Date(row.voting_deadline) <= now;
      const applied = row.applied === true || row.applied === true;
      const closed = deadlinePassed || applied;
      const closedAt = row.updated_at ? new Date(row.updated_at).toISOString() : null;
      return { closed, closedAt };
    }
    case 'governance_rule': {
      const row = await TransactionManager.query(db, `
        SELECT status, voting_ends_at FROM governance_rule_proposals WHERE id = ?
      `, [contestId]);
      if (!row) return { closed: false };
      const closed = row.status !== 'active';
      const closedAt = row.voting_ends_at ? new Date(row.voting_ends_at).toISOString() : null;
      return { closed, closedAt };
    }
    case 'organization': {
      const row = await TransactionManager.query(db, `
        SELECT status, voting_ends_at, rejected_at, created_at FROM organization_votes WHERE id = ?
      `, [contestId]);
      if (!row) return { closed: false };
      const closed = ['passed', 'failed', 'cancelled'].includes(row.status);
      const closedAtSource = row.voting_ends_at || row.rejected_at || row.created_at;
      const closedAt = closedAtSource ? new Date(closedAtSource).toISOString() : null;
      return { closed, closedAt };
    }
    case 'representative_election': {
      const ctx = await resolveRepresentativeElectionContext(db, contestId);
      if (!ctx) return { closed: false };
      if (ctx.contestKind === 'session') {
        const row = await TransactionManager.query(db, `
          SELECT status, completed_at FROM voting_sessions WHERE id = ?
        `, [contestId]);
        if (!row) return { closed: false };
        const closed = ['completed', 'cancelled', 'failed'].includes(row.status);
        const closedAt = row.completed_at ? new Date(row.completed_at).toISOString() : null;
        return { closed, closedAt };
      }
      const closed = ['completed', 'cancelled'].includes(ctx.electionStatus);
      const closedAt = ctx.electionCompletedAt ? new Date(ctx.electionCompletedAt).toISOString() : null;
      return { closed, closedAt };
    }
    case 'meeting_vote': {
      const row = await TransactionManager.query(db, `
        SELECT status, closed_at FROM meeting_votes WHERE id = ?
      `, [contestId]);
      if (!row) return { closed: false };
      const closed = row.status === 'closed';
      const closedAt = row.closed_at ? new Date(row.closed_at).toISOString() : null;
      return { closed, closedAt };
    }
    default:
      return { closed: false };
  }
}

/**
 * Resolve contest exists and return minimal context (for 404 and access).
 * @param {Object} db
 * @param {string} voteType
 * @param {string} contestId
 * @returns {Promise<Object|null>} e.g. { documentId }, { organizationId }, or null
 */
async function resolveContest(db, voteType, contestId) {
  switch (voteType) {
    case 'paragraph': {
      const row = await TransactionManager.query(db, `
        SELECT d.id AS document_id FROM proposals p
        JOIN paragraphs pr ON p.paragraph_id = pr.id
        JOIN documents d ON pr.document_id = d.id
        WHERE p.id = ?
      `, [contestId]);
      return row ? { documentId: row.document_id } : null;
    }
    case 'document':
    case 'document_deletion': {
      const row = await TransactionManager.query(db, 'SELECT id AS document_id FROM documents WHERE id = ?', [contestId]);
      return row ? { documentId: row.document_id } : null;
    }
    case 'document_tree': {
      const row = await TransactionManager.query(db, `
        SELECT document_id FROM document_tree_proposals WHERE id = ?
      `, [contestId]);
      return row ? { documentId: row.document_id } : null;
    }
    case 'structure': {
      const row = await TransactionManager.query(db, 'SELECT document_id FROM structure_proposals WHERE id = ?', [contestId]);
      return row ? { documentId: row.document_id } : null;
    }
    case 'governance_rule': {
      const row = await TransactionManager.query(db, 'SELECT organization_id FROM governance_rule_proposals WHERE id = ?', [contestId]);
      return row ? { organizationId: row.organization_id } : null;
    }
    case 'organization': {
      const row = await TransactionManager.query(db, 'SELECT organization_id FROM organization_votes WHERE id = ?', [contestId]);
      return row ? { organizationId: row.organization_id } : null;
    }
    case 'representative_election': {
      const ctx = await resolveRepresentativeElectionContext(db, contestId);
      return ctx ? { organizationId: ctx.organizationId, electionId: ctx.electionId } : null;
    }
    case 'meeting_vote': {
      const row = await TransactionManager.query(db, `
        SELECT m.organization_id, mv.meeting_id
        FROM meeting_votes mv
        JOIN meetings m ON m.id = mv.meeting_id
        WHERE mv.id = ?
      `, [contestId]);
      return row ? { organizationId: row.organization_id, meetingId: row.meeting_id } : null;
    }
    default:
      return null;
  }
}

/**
 * Fetch raw ballot rows for a contest, ordered deterministically (created_at ASC, id ASC).
 * Does not include forbidden fields for anonymous types; caller must anonymize.
 * @param {Object} db
 * @param {string} voteType
 * @param {string} contestId
 * @returns {Promise<Array>}
 */
async function getBallotsForContest(db, voteType, contestId) {
  const orderBy = voteType === 'representative_election' || voteType === 'governance_rule'
    ? 'voted_at ASC, id ASC'
    : 'created_at ASC, id ASC';

  switch (voteType) {
    case 'paragraph': {
      const rows = await TransactionManager.queryAll(db, `
        SELECT id, proposal_id, vote, created_at, receipt_id, vote_hash
        FROM votes
        WHERE proposal_id = ?
        ORDER BY created_at ASC, id ASC
      `, [contestId]);
      return rows.map(r => ({ ...r, contestId }));
    }
    case 'document': {
      const rows = await TransactionManager.queryAll(db, `
        SELECT id, document_id, vote, created_at, receipt_id, vote_hash
        FROM document_votes
        WHERE document_id = ?
        ORDER BY created_at ASC, id ASC
      `, [contestId]);
      return rows.map(r => ({ ...r, contestId }));
    }
    case 'document_deletion': {
      const rows = await TransactionManager.queryAll(db, `
        SELECT id, document_id, vote, created_at, receipt_id, vote_hash
        FROM document_deletion_votes
        WHERE document_id = ?
        ORDER BY created_at ASC, id ASC
      `, [contestId]);
      return rows.map(r => ({ ...r, contestId }));
    }
    case 'document_tree': {
      const rows = await TransactionManager.queryAll(db, `
        SELECT id, proposal_id, vote, created_at, receipt_id, vote_hash
        FROM document_tree_proposal_votes
        WHERE proposal_id = ?
        ORDER BY created_at ASC, id ASC
      `, [contestId]);
      return rows.map(r => ({ ...r, contestId }));
    }
    case 'structure': {
      const rows = await TransactionManager.queryAll(db, `
        SELECT id, structure_proposal_id, vote, created_at, receipt_id, vote_hash
        FROM structure_proposal_votes
        WHERE structure_proposal_id = ?
        ORDER BY created_at ASC, id ASC
      `, [contestId]);
      return rows.map(r => ({ ...r, contestId: r.structure_proposal_id }));
    }
    case 'governance_rule': {
      const rows = await TransactionManager.queryAll(db, `
        SELECT id, proposal_id, vote, voted_at, receipt_id, vote_hash
        FROM governance_rule_proposal_votes
        WHERE proposal_id = ?
        ORDER BY voted_at ASC, id ASC
      `, [contestId]);
      return rows.map(r => ({ ...r, contestId: r.proposal_id, created_at: r.voted_at }));
    }
    case 'organization': {
      const rows = await TransactionManager.queryAll(db, `
        SELECT vb.id, vb.vote_id, vb.user_id, vb.vote_choice, vb.created_at, vb.receipt_id, vb.vote_hash
        FROM vote_ballots vb
        WHERE vb.vote_id = ?
        ORDER BY vb.created_at ASC, vb.id ASC
      `, [contestId]);
      return rows.map(r => ({ ...r, contestId: r.vote_id, choice: r.vote_choice }));
    }
    case 'representative_election': {
      const ctx = await resolveRepresentativeElectionContext(db, contestId);
      if (!ctx) return [];

      if (ctx.anonymousVoting) {
        const rows = await TransactionManager.queryAll(db, `
          SELECT id, voting_session_id, vote_choice, voted_at, vote_hash, receipt_id
          FROM anonymous_vote_ballots
          WHERE voting_session_id = ?
          ORDER BY voted_at ASC, id ASC
        `, [contestId]);
        return rows.map(r => ({
          ...r,
          contestId: r.voting_session_id,
          choice: r.vote_choice,
          created_at: r.voted_at,
          vote_hash: r.vote_hash
        }));
      }

      const voteRows = await TransactionManager.queryAll(db, `
        SELECT id, election_id, user_id, candidate_id, vote_rank, created_at
        FROM election_votes
        WHERE election_id = ?
        ORDER BY user_id ASC, vote_rank ASC, created_at ASC, id ASC
      `, [ctx.electionId]);

      const grouped = new Map();
      for (const row of voteRows) {
        if (!grouped.has(row.user_id)) {
          grouped.set(row.user_id, {
            id: row.id,
            user_id: row.user_id,
            created_at: row.created_at,
            rankedChoices: []
          });
        }
        const entry = grouped.get(row.user_id);
        if (row.vote_rank != null) {
          entry.rankedChoices[row.vote_rank - 1] = row.candidate_id;
        } else {
          entry.rankedChoices.push(row.candidate_id);
        }
      }

      return Array.from(grouped.values()).map(entry => {
        const choices = entry.rankedChoices.filter(Boolean);
        const choice = choices.length <= 1 ? (choices[0] || null) : JSON.stringify(choices);
        return {
          id: entry.id,
          contestId: ctx.electionId,
          user_id: entry.user_id,
          choice,
          created_at: entry.created_at
        };
      }).sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (aTime !== bTime) return aTime - bTime;
        return String(a.id).localeCompare(String(b.id));
      });
    }
    case 'meeting_vote': {
      const rows = await TransactionManager.queryAll(db, `
        SELECT id, meeting_vote_id, option_id, user_id, created_at, receipt_id, vote_hash
        FROM meeting_vote_responses
        WHERE meeting_vote_id = ?
        ORDER BY created_at ASC, id ASC
      `, [contestId]);
      return rows.map(r => ({
        ...r,
        contestId: r.meeting_vote_id,
        choice: r.option_id
      }));
    }
    default:
      return [];
  }
}

/**
 * Map a raw row to canonical ballot record (VERIFIABILITY_SPEC §4.1).
 * Strips forbidden fields when isAnonymous.
 * @param {Object} row - Raw row (may have vote, vote_choice, created_at, voted_at, vote_hash, receipt_id, user_id)
 * @param {string} voteType
 * @param {string} contestId
 * @param {boolean} isAnonymous
 * @returns {Object} { contestId, choice, createdAt, receiptId?, voteHash?, userId? }
 */
function mapRowToBallot(row, voteType, contestId, isAnonymous) {
  const choice = row.vote != null ? row.vote : row.vote_choice || row.choice;
  const createdAt = (row.created_at || row.voted_at || row.createdAt);
  const createdAtIso = createdAt ? new Date(createdAt).toISOString() : null;

  const ballot = {
    contestId: String(contestId),
    choice,
    createdAt: createdAtIso
  };
  if (row.receipt_id != null) ballot.receiptId = row.receipt_id;
  if (row.vote_hash != null) ballot.voteHash = row.vote_hash;
  if (!isAnonymous && row.user_id != null) ballot.userId = row.user_id;
  return ballot;
}

/**
 * Get anonymity flag for a contest (document or governance rule).
 * @param {Object} db
 * @param {string} voteType
 * @param {string} contestId
 * @returns {Promise<boolean>}
 */
async function isAnonymousContest(db, voteType, contestId) {
  switch (voteType) {
    case 'paragraph':
    case 'document':
    case 'document_deletion':
    case 'document_tree':
    case 'structure': {
      let documentId = contestId;
      if (voteType === 'paragraph' || voteType === 'document_tree' || voteType === 'structure') {
        const docIdRow = await TransactionManager.query(db, getDocumentIdQuery(voteType, contestId), getDocumentIdParams(voteType, contestId));
        documentId = docIdRow?.document_id;
      }
      if (!documentId) return true;
      const d = await TransactionManager.query(db, 'SELECT voting_anonymous FROM documents WHERE id = ?', [documentId]);
      return d && (d.voting_anonymous === true || d.voting_anonymous === true);
    }
    case 'governance_rule': {
      const g = await TransactionManager.query(db, 'SELECT anonymous_voting FROM governance_rule_proposals WHERE id = ?', [contestId]);
      return g && (g.anonymous_voting === 1 || g.anonymous_voting === true);
    }
    case 'organization':
      return false;
    case 'representative_election': {
      const ctx = await resolveRepresentativeElectionContext(db, contestId);
      if (!ctx) return true;
      return ctx.anonymousVoting;
    }
    case 'meeting_vote': {
      const row = await TransactionManager.query(db, 'SELECT anonymous FROM meeting_votes WHERE id = ?', [contestId]);
      return row && (row.anonymous === 1 || row.anonymous === true);
    }
    default:
      return true;
  }
}

function getDocumentIdQuery(voteType, contestId) {
  if (voteType === 'paragraph') {
    return 'SELECT d.id AS document_id FROM proposals p JOIN paragraphs pr ON p.paragraph_id = pr.id JOIN documents d ON pr.document_id = d.id WHERE p.id = ?';
  }
  if (voteType === 'document_tree') {
    return 'SELECT document_id FROM document_tree_proposals WHERE id = ?';
  }
  if (voteType === 'structure') {
    return 'SELECT document_id FROM structure_proposals WHERE id = ?';
  }
  return null;
}

function getDocumentIdParams(voteType, contestId) {
  return [contestId];
}

/**
 * Build announcedResult { pro, contra, neutral, total } for the contest.
 * @param {Object} db
 * @param {string} voteType
 * @param {string} contestId
 * @param {Array} ballots - Optional; if provided (canonical ballot list), counts computed from it; otherwise from DB
 * @returns {Promise<{ pro: number, contra: number, neutral: number, total: number }|null>}
 */
async function getAnnouncedResult(db, voteType, contestId, ballots = null) {
  if (voteType === 'representative_election' || voteType === 'meeting_vote') {
    ballots = null;
  } else if (ballots && Array.isArray(ballots) && ballots.length >= 0) {
    const withChoice = ballots.map(b => ({ vote: b.choice, voteChoice: b.choice }));
    const counts = calculateVoteCounts(withChoice);
    return { pro: counts.pro, contra: counts.contra, neutral: counts.neutral, total: counts.total };
  }

  switch (voteType) {
    case 'organization': {
      const row = await TransactionManager.query(db, `
        SELECT result_yes, result_no, result_abstain FROM organization_votes WHERE id = ?
      `, [contestId]);
      if (!row) return null;
      const total = (row.result_yes || 0) + (row.result_no || 0) + (row.result_abstain || 0);
      return {
        pro: row.result_yes || 0,
        contra: row.result_no || 0,
        neutral: row.result_abstain || 0,
        total
      };
    }
    case 'representative_election': {
      const ctx = await resolveRepresentativeElectionContext(db, contestId);
      if (!ctx) return null;
      if (!ctx.anonymousVoting) {
        const row = await TransactionManager.query(db, `
          SELECT votes_cast FROM representative_elections WHERE id = ?
        `, [ctx.electionId]);
        const total = row?.votes_cast || 0;
        return { pro: total, contra: 0, neutral: 0, total };
      }
      const row = await TransactionManager.query(db, `
        SELECT yes_votes, no_votes, abstain_votes FROM voting_sessions WHERE id = ?
      `, [contestId]);
      if (!row) return null;
      const total = (row.yes_votes || 0) + (row.no_votes || 0) + (row.abstain_votes || 0);
      return {
        pro: row.yes_votes || 0,
        contra: row.no_votes || 0,
        neutral: row.abstain_votes || 0,
        total
      };
    }
    case 'meeting_vote': {
      const vote = await TransactionManager.query(db, 'SELECT id FROM meeting_votes WHERE id = ?', [contestId]);
      if (!vote) return null;
      const options = await TransactionManager.queryAll(db, `
        SELECT id FROM meeting_vote_options WHERE meeting_vote_id = ?
      `, [contestId]);
      const optionCounts = {};
      let total = 0;
      for (const opt of options || []) {
        const countRow = await TransactionManager.query(db, `
          SELECT COUNT(*) AS c FROM meeting_vote_responses WHERE meeting_vote_id = ? AND option_id = ?
        `, [contestId, opt.id]);
        const c = Number(countRow?.c ?? countRow?.C ?? 0) || 0;
        optionCounts[opt.id] = c;
        total += c;
      }
      return { optionCounts, total, pro: total, contra: 0, neutral: 0 };
    }
    default:
      return null;
  }
}

/**
 * Full export: closed check, ballots, anonymization, announcedResult, closedAt.
 * @param {Object} db
 * @param {string} voteType
 * @param {string} contestId
 * @returns {Promise<{ contestId, voteType, ballots, closedAt, announcedResult }|null>}
 */
async function exportBallots(db, voteType, contestId) {
  const resolved = await resolveContest(db, voteType, contestId);
  if (!resolved) return null;

  const { closed, closedAt } = await isContestClosed(db, voteType, contestId);
  if (!closed) return { notClosed: true, closedAt: closedAt || null };

  const rawRows = await getBallotsForContest(db, voteType, contestId);
  const isAnonymous = await isAnonymousContest(db, voteType, contestId);

  const ballots = rawRows.map(row => {
    const cId = row.contestId || contestId;
    return mapRowToBallot(row, voteType, cId, isAnonymous);
  });

  const announcedResult = await getAnnouncedResult(db, voteType, contestId, ballots);
  const finalClosedAt = closedAt || null;

  let announcedOptionCounts;
  if (voteType === 'meeting_vote' && announcedResult && announcedResult.optionCounts) {
    announcedOptionCounts = announcedResult.optionCounts;
  }

  const proContraResult = announcedResult && voteType !== 'meeting_vote'
    ? {
      pro: announcedResult.pro,
      contra: announcedResult.contra,
      neutral: announcedResult.neutral,
      total: announcedResult.total
    }
    : undefined;

  return {
    contestId: String(contestId),
    voteType,
    ballots,
    closedAt: finalClosedAt,
    ...(proContraResult && { announcedResult: proContraResult }),
    ...(announcedOptionCounts && { announcedOptionCounts })
  };
}

module.exports = {
  VOTE_TYPES,
  isContestClosed,
  resolveContest,
  resolveRepresentativeElectionContext,
  getBallotsForContest,
  mapRowToBallot,
  isAnonymousContest,
  getAnnouncedResult,
  exportBallots
};
