/**
 * List closed, verifiable contests for an organization (Transparency tab).
 */

const TransactionManager = require('../database/services/TransactionManager');
const ballotExport = require('./ballotExport');

function toIso(value) {
  if (!value) return null;
  return new Date(value).toISOString();
}

function pushContest(contests, item) {
  if (!item || !item.contestId || !item.voteType) return;
  contests.push(item);
}

/**
 * @param {Object} db
 * @param {string} organizationId
 * @param {{ limit?: number, offset?: number }} options
 * @returns {Promise<{ contests: Array, total: number, limit: number, offset: number }>}
 */
async function listVerifiableContestsForOrganization(db, organizationId, options = {}) {
  const limit = Math.min(Math.max(1, options.limit || 100), 500);
  const offset = Math.max(0, options.offset || 0);
  const contests = [];

  const orgVotes = await TransactionManager.queryAll(db, `
    SELECT id, title, status, voting_ends_at, rejected_at, created_at
    FROM organization_votes
    WHERE organization_id = ?
      AND status IN ('passed', 'failed', 'cancelled')
  `, [organizationId]);
  for (const row of orgVotes || []) {
    pushContest(contests, {
      voteType: 'organization',
      contestId: row.id,
      title: row.title || 'Organization vote',
      closedAt: toIso(row.voting_ends_at || row.rejected_at || row.created_at),
      statusLabel: row.status
    });
  }

  const elections = await TransactionManager.queryAll(db, `
    SELECT e.id, e.election_title, e.status, e.election_completed_at, e.anonymous_voting,
           vs.id AS voting_session_id
    FROM representative_elections e
    LEFT JOIN voting_sessions vs ON vs.related_entity_id = e.id AND vs.session_type = 'election'
    WHERE e.organization_id = ?
      AND e.status IN ('completed', 'cancelled')
  `, [organizationId]);
  for (const row of elections || []) {
    const contestId = row.voting_session_id || row.id;
    pushContest(contests, {
      voteType: 'representative_election',
      contestId,
      title: row.election_title || 'Representative election',
      closedAt: toIso(row.election_completed_at),
      statusLabel: row.status
    });
  }

  const ruleProposals = await TransactionManager.queryAll(db, `
    SELECT id, title, status, voting_ends_at
    FROM governance_rule_proposals
    WHERE organization_id = ?
      AND status NOT IN ('draft', 'active')
  `, [organizationId]);
  for (const row of ruleProposals || []) {
    pushContest(contests, {
      voteType: 'governance_rule',
      contestId: row.id,
      title: row.title || 'Rule proposal',
      closedAt: toIso(row.voting_ends_at),
      statusLabel: row.status
    });
  }

  const orgDocs = await TransactionManager.queryAll(db, `
    SELECT id, title, status, updated_at
    FROM documents
    WHERE organization_id = ?
      AND ownership_type = 'organizational'
      AND status != 'voting'
  `, [organizationId]);
  for (const row of orgDocs || []) {
    const docVoteClosed = row.status !== 'voting';
    if (docVoteClosed) {
      const docVotes = await TransactionManager.query(db,
        'SELECT COUNT(*) AS c FROM document_votes WHERE document_id = ?',
        [row.id]
      );
      if ((docVotes?.c || 0) > 0) {
        pushContest(contests, {
          voteType: 'document',
          contestId: row.id,
          title: row.title ? `Document: ${row.title}` : 'Document vote',
          closedAt: toIso(row.updated_at),
          statusLabel: row.status,
          documentId: row.id
        });
      }
      const delVotes = await TransactionManager.query(db,
        'SELECT COUNT(*) AS c FROM document_deletion_votes WHERE document_id = ?',
        [row.id]
      );
      if ((delVotes?.c || 0) > 0) {
        pushContest(contests, {
          voteType: 'document_deletion',
          contestId: row.id,
          title: row.title ? `Deletion: ${row.title}` : 'Document deletion vote',
          closedAt: toIso(row.updated_at),
          statusLabel: row.status,
          documentId: row.id
        });
      }
    }
  }

  const treeProposals = await TransactionManager.queryAll(db, `
    SELECT tp.id, tp.title, tp.status, tp.updated_at, tp.document_id
    FROM document_tree_proposals tp
    JOIN documents d ON d.id = tp.document_id
    WHERE d.organization_id = ?
      AND tp.status IN ('approved', 'rejected', 'applied')
  `, [organizationId]);
  for (const row of treeProposals || []) {
    pushContest(contests, {
      voteType: 'document_tree',
      contestId: row.id,
      title: row.title || 'Tree proposal',
      closedAt: toIso(row.updated_at),
      statusLabel: row.status,
      documentId: row.document_id
    });
  }

  const structureProposals = await TransactionManager.queryAll(db, `
    SELECT sp.id, sp.title, sp.status, sp.updated_at, sp.document_id
    FROM structure_proposals sp
    JOIN documents d ON d.id = sp.document_id
    WHERE d.organization_id = ?
      AND (sp.applied = 1 OR sp.voting_deadline <= CURRENT_TIMESTAMP OR sp.status IN ('approved', 'rejected'))
  `, [organizationId]);
  for (const row of structureProposals || []) {
    const { closed } = await ballotExport.isContestClosed(db, 'structure', row.id);
    if (!closed) continue;
    pushContest(contests, {
      voteType: 'structure',
      contestId: row.id,
      title: row.title || 'Structure proposal',
      closedAt: toIso(row.updated_at),
      statusLabel: row.status,
      documentId: row.document_id
    });
  }

  const paragraphRows = await TransactionManager.queryAll(db, `
    SELECT p.id AS proposal_id, p.title, d.id AS document_id, d.updated_at
    FROM proposals p
    JOIN paragraphs pr ON p.paragraph_id = pr.id
    JOIN documents d ON pr.document_id = d.id
    WHERE d.organization_id = ?
      AND d.ownership_type = 'organizational'
  `, [organizationId]);
  for (const row of paragraphRows || []) {
    const { closed } = await ballotExport.isContestClosed(db, 'paragraph', row.proposal_id);
    if (!closed) continue;
    const voteCount = await TransactionManager.query(db,
      'SELECT COUNT(*) AS c FROM votes WHERE proposal_id = ?',
      [row.proposal_id]
    );
    if ((voteCount?.c || 0) === 0) continue;
    pushContest(contests, {
      voteType: 'paragraph',
      contestId: row.proposal_id,
      title: row.title || 'Paragraph proposal',
      closedAt: toIso(row.updated_at),
      statusLabel: 'closed',
      documentId: row.document_id
    });
  }

  const meetingVotes = await TransactionManager.queryAll(db, `
    SELECT mv.id, mv.title, mv.status, mv.closed_at, mv.meeting_id
    FROM meeting_votes mv
    JOIN meetings m ON m.id = mv.meeting_id
    WHERE m.organization_id = ?
      AND mv.status = 'closed'
  `, [organizationId]);
  for (const row of meetingVotes || []) {
    pushContest(contests, {
      voteType: 'meeting_vote',
      contestId: row.id,
      title: row.title || 'Meeting vote',
      closedAt: toIso(row.closed_at),
      statusLabel: row.status,
      meetingId: row.meeting_id
    });
  }

  contests.sort((a, b) => {
    const aTime = a.closedAt ? new Date(a.closedAt).getTime() : 0;
    const bTime = b.closedAt ? new Date(b.closedAt).getTime() : 0;
    return bTime - aTime;
  });

  const total = contests.length;
  const page = contests.slice(offset, offset + limit);
  return { contests: page, total, limit, offset };
}

module.exports = {
  listVerifiableContestsForOrganization
};
