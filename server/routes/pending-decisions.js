/**
 * GET /api/pending-decisions - Get all open decisions for the current user
 * Aggregates: paragraph proposals (not yet voted), open elections, open org votes,
 * active rule proposals, open structure proposals, open tree proposals,
 * document-level voting (content/deletion), documents open for amendments.
 * Query params: limit, offset, kind, documentId, organizationId
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { logger } = require('../middleware/logger');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const TransactionManager = require('../database/services/TransactionManager');
const { getUserId } = require('../utils/routeHelpers');
const { buildAccessCheck } = require('../utils/documentQueries');
const { getDocumentIdsForPendingVotes, getFormattedPendingProposals } = require('../utils/pendingParagraphProposals');
const router = express.Router();

const PER_KIND_LIMIT = 50;

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const userId = getUserId(req);
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = parseInt(req.query.offset) || 0;
  const kind = req.query.kind;
  const documentId = req.query.documentId;
  const organizationId = req.query.organizationId;

  try {
    const allEntries = [];

    const orgRows = await TransactionManager.queryAll(db,
      'SELECT organization_id FROM organization_members WHERE user_id = ? AND status = ?',
      [userId, 'active']
    );
    const userOrgIds = orgRows.map(r => r.organization_id).filter(Boolean);

    const documentsQuery = `
      SELECT d.id, d.title, d.description, d.organization_id
      FROM documents d
      LEFT JOIN document_collaborators dc ON d.id = dc.document_id AND dc.user_id = ?
      LEFT JOIN organization_members om ON d.organization_id = om.organization_id AND om.user_id = ? AND om.status = 'active'
      LEFT JOIN organizations o ON d.organization_id = o.id AND o.is_active = true
      WHERE ${buildAccessCheck('d')}
        AND (d.document_kind IS NULL OR d.document_kind = 'standard')
    `;
    let documentsParams = [userId, userId, userId, userId];
    if (documentId) {
      documentsParams.push(documentId);
    }
    const documentsQueryWithFilter = documentId ? documentsQuery + ' AND d.id = ?' : documentsQuery;
    const documents = await TransactionManager.queryAll(db, documentsQueryWithFilter, documentsParams);
    const documentIds = documents.map(d => d.id);

    const orgIdsToQuery = organizationId
      ? (userOrgIds.includes(organizationId) ? [organizationId] : [])
      : userOrgIds;

    const docPlaceholders = documentIds.length ? documentIds.map(() => '?').join(',') : '';
    const orgPlaceholders = orgIdsToQuery.length ? orgIdsToQuery.map(() => '?').join(',') : '';

    const safeQuery = async (label, fn) => {
      try {
        await fn();
      } catch (err) {
        logger.warn(`Pending decisions: ${label} failed, skipping`, { error: err.message });
      }
    };

    // 1. Paragraph proposals (user has not voted)
    if ((!kind || kind === 'paragraph_proposal') && documentIds.length > 0) {
      await safeQuery('paragraph proposals', async () => {
        const pendingDocIds = await getDocumentIdsForPendingVotes(db, userId);
        const docIdsForParagraph = documentId
          ? (pendingDocIds.includes(documentId) ? [documentId] : [])
          : pendingDocIds.filter(id => documentIds.includes(id));
        if (docIdsForParagraph.length === 0) return;
        const proposals = await getFormattedPendingProposals(db, userId, docIdsForParagraph);
        const limited = proposals.slice(0, PER_KIND_LIMIT);
        limited.forEach(proposal => {
          const ts = proposal.createdAt instanceof Date
            ? proposal.createdAt.toISOString()
            : (proposal.createdAt ? String(proposal.createdAt) : new Date().toISOString());
          allEntries.push({
            id: `paragraph_proposal-${proposal.id}`,
            kind: 'paragraph_proposal',
            timestamp: ts,
            organizationId: undefined,
            organizationName: undefined,
            documentId: proposal.documentId,
            documentTitle: proposal.documentTitle,
            payload: proposal,
          });
        });
      });
    }

    // 2. Open elections (active, voting, announced)
    if ((!kind || kind === 'election') && orgIdsToQuery.length > 0) {
      await safeQuery('elections', async () => {
        const electionQuery = `
          SELECT re.id, re.organization_id, re.election_title, re.election_description, re.status,
            re.positions_available, re.voting_ends_at, re.quorum_required, re.total_voters, re.votes_cast, re.quorum_met,
            re.created_at, re.updated_at, o.name as organization_name,
            u.name as created_by_name
          FROM representative_elections re
          LEFT JOIN organizations o ON re.organization_id = o.id
          LEFT JOIN users u ON re.created_by = u.id
          WHERE re.organization_id IN (${orgPlaceholders})
            AND re.status IN ('active', 'voting', 'announced', 'nomination')
            AND NOT EXISTS (
              SELECT 1 FROM election_votes ev
              WHERE ev.election_id = re.id AND ev.user_id = ?
            )
          ORDER BY re.updated_at DESC
          LIMIT ${PER_KIND_LIMIT}
        `;
        const rows = await TransactionManager.queryAll(db, electionQuery, [...orgIdsToQuery, userId]);
        const electionIds = rows.map(r => r.id).filter(Boolean);
        let candidatesMap = {};
        if (electionIds.length > 0) {
          const ph = electionIds.map(() => '?').join(',');
          const candidates = await TransactionManager.queryAll(db, `
            SELECT ec.*, u.name as user_name, u.email as user_email, u.avatar as user_avatar,
              nb.name as nominated_by_name
            FROM election_candidates ec
            LEFT JOIN users u ON ec.user_id = u.id
            LEFT JOIN users nb ON ec.nominated_by = nb.id
            WHERE ec.election_id IN (${ph})
            ORDER BY ec.created_at ASC
          `, electionIds);
          candidates.forEach(c => {
            if (!candidatesMap[c.election_id]) candidatesMap[c.election_id] = [];
            candidatesMap[c.election_id].push({
              id: c.id,
              electionId: c.election_id,
              userId: c.user_id,
              candidateStatement: c.candidate_statement,
              acceptedNomination: c.accepted_nomination === true || c.accepted_nomination === true,
              nominatedBy: c.nominated_by,
              nominatedByName: c.nominated_by_name,
              nominationAcceptedAt: c.nomination_accepted_at,
              votesReceived: c.votes_received || 0,
              elected: c.elected === true || c.elected === true,
              electedPosition: c.elected_position,
              createdAt: c.created_at,
              updatedAt: c.updated_at,
              user: { id: c.user_id, name: c.user_name, email: c.user_email, avatar: c.user_avatar },
            });
          });
        }
        rows.forEach(row => {
          const ts = row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || row.created_at || '');
          let status = row.status;
          if (status === 'nomination') status = 'announced';
          else if (status === 'voting') status = 'active';
          allEntries.push({
            id: `election-${row.id}`,
            kind: 'election',
            timestamp: ts,
            organizationId: row.organization_id,
            organizationName: row.organization_name || undefined,
            documentId: undefined,
            documentTitle: undefined,
            payload: {
              id: row.id,
              organizationId: row.organization_id,
              electionTitle: row.election_title,
              electionDescription: row.election_description || undefined,
              status,
              positionsAvailable: row.positions_available || 1,
              votingEndsAt: row.voting_ends_at,
              quorumRequired: row.quorum_required || 0,
              totalVoters: row.total_voters || 0,
              votesCast: row.votes_cast || 0,
              quorumMet: row.quorum_met === true || row.quorum_met === true,
              createdByName: row.created_by_name,
              candidates: candidatesMap[row.id] || [],
            },
          });
        });
      });
    }

    // 3. Open organization votes (status = approved = open for members to vote)
    if ((!kind || kind === 'organization_vote') && orgIdsToQuery.length > 0) {
      await safeQuery('organization votes', async () => {
        const voteQuery = `
          SELECT ov.id, ov.organization_id, ov.title, ov.description, ov.vote_type, ov.status,
            ov.voting_starts_at, ov.voting_ends_at, ov.created_at, ov.threshold, ov.target_document_id,
            ov.result_yes, ov.result_no, ov.result_abstain, o.name as organization_name,
            d.title as target_document_title
          FROM organization_votes ov
          LEFT JOIN organizations o ON ov.organization_id = o.id
          LEFT JOIN documents d ON ov.target_document_id = d.id
          WHERE ov.organization_id IN (${orgPlaceholders})
            AND ov.status = 'approved'
            AND NOT EXISTS (
              SELECT 1 FROM vote_ballots vb
              WHERE vb.vote_id = ov.id AND vb.user_id = ?
            )
          ORDER BY ov.voting_ends_at DESC, ov.created_at DESC
          LIMIT ${PER_KIND_LIMIT}
        `;
        const rows = await TransactionManager.queryAll(db, voteQuery, [...orgIdsToQuery, userId]);
        rows.forEach(row => {
          const ts = row.voting_ends_at
            ? (row.voting_ends_at instanceof Date ? row.voting_ends_at.toISOString() : String(row.voting_ends_at))
            : (row.created_at ? (row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)) : new Date().toISOString());
          const raw = row.threshold ?? 0.5;
          const threshold = raw <= 1 ? raw * 100 : raw;
          allEntries.push({
            id: `organization_vote-${row.id}`,
            kind: 'organization_vote',
            timestamp: ts,
            organizationId: row.organization_id,
            organizationName: row.organization_name || undefined,
            documentId: row.target_document_id || undefined,
            documentTitle: row.target_document_title || undefined,
            payload: {
              id: row.id,
              organizationId: row.organization_id,
              title: row.title,
              description: row.description || undefined,
              voteType: row.vote_type,
              status: row.status,
              votingStartsAt: row.voting_starts_at,
              votingEndsAt: row.voting_ends_at,
              threshold,
              targetDocumentId: row.target_document_id || undefined,
              resultYes: row.result_yes || 0,
              resultNo: row.result_no || 0,
              resultAbstain: row.result_abstain || 0,
            },
          });
        });
      });
    }

    // 4. Active rule proposals
    if ((!kind || kind === 'rule_proposal') && orgIdsToQuery.length > 0) {
      await safeQuery('rule proposals', async () => {
        const ruleQuery = `
          SELECT grp.id, grp.title, grp.description, grp.current_rule_field as rule_field, grp.status,
            grp.current_rule_value, grp.proposed_rule_value, grp.voting_ends_at, grp.updated_at as timestamp,
            grp.organization_id, o.name as organization_name,
            grp.votes_yes, grp.votes_no, grp.votes_abstain, grp.total_voters, grp.votes_cast,
            u.name as created_by_name
          FROM governance_rule_proposals grp
          LEFT JOIN organizations o ON grp.organization_id = o.id
          LEFT JOIN users u ON grp.created_by = u.id
          WHERE grp.organization_id IN (${orgPlaceholders})
            AND grp.status = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM governance_rule_proposal_votes grpv
              WHERE grpv.proposal_id = grp.id AND grpv.user_id = ?
            )
          ORDER BY grp.updated_at DESC
          LIMIT ${PER_KIND_LIMIT}
        `;
        const rows = await TransactionManager.queryAll(db, ruleQuery, [...orgIdsToQuery, userId]);
        rows.forEach(row => {
          const ts = row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp || '');
          allEntries.push({
            id: `rule_proposal-${row.id}`,
            kind: 'rule_proposal',
            timestamp: ts,
            organizationId: row.organization_id,
            organizationName: row.organization_name || undefined,
            documentId: undefined,
            documentTitle: undefined,
            payload: {
              id: row.id,
              title: row.title,
              description: row.description || undefined,
              ruleField: row.rule_field,
              status: row.status,
              currentValue: row.current_rule_value,
              proposedValue: row.proposed_rule_value,
              votesYes: row.votes_yes || 0,
              votesNo: row.votes_no || 0,
              votesAbstain: row.votes_abstain || 0,
              totalVoters: row.total_voters || 0,
              votesCast: row.votes_cast || 0,
              votingEndsAt: row.voting_ends_at,
              createdByName: row.created_by_name,
            },
          });
        });
      });
    }

    // 5. Open structure proposals (approved = false, applied = false)
    if ((!kind || kind === 'structure_proposal') && documentIds.length > 0) {
      await safeQuery('structure proposals', async () => {
        const structQuery = `
          SELECT sp.id, sp.title, sp.description, sp.document_id, sp.voting_deadline, sp.updated_at as timestamp,
            sp.approved, sp.applied, d.title as document_title, d.organization_id, o.name as organization_name,
            u.name as user_name
          FROM structure_proposals sp
          JOIN documents d ON sp.document_id = d.id
          LEFT JOIN organizations o ON d.organization_id = o.id
          LEFT JOIN users u ON sp.user_id = u.id
          WHERE sp.document_id IN (${docPlaceholders})
            AND (sp.approved = false OR sp.approved IS NULL)
            AND (sp.applied = false OR sp.applied IS NULL)
            AND NOT EXISTS (
              SELECT 1 FROM structure_proposal_votes spv
              WHERE spv.structure_proposal_id = sp.id AND spv.user_id = ?
            )
          ORDER BY sp.updated_at DESC
          LIMIT ${PER_KIND_LIMIT}
        `;
        const rows = await TransactionManager.queryAll(db, structQuery, [...documentIds, userId]);
        rows.forEach(row => {
          const ts = row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp || '');
          allEntries.push({
            id: `structure_proposal-${row.id}`,
            kind: 'structure_proposal',
            timestamp: ts,
            organizationId: row.organization_id || undefined,
            organizationName: row.organization_name || undefined,
            documentId: row.document_id,
            documentTitle: row.document_title,
            payload: {
              id: row.id,
              documentId: row.document_id,
              title: row.title,
              description: row.description || undefined,
              votingDeadline: row.voting_deadline,
              approved: row.approved === true,
              applied: row.applied === true,
              createdByName: row.user_name,
            },
          });
        });
      });
    }

    // 6. Open tree proposals (status = 'pending')
    if ((!kind || kind === 'tree_proposal') && documentIds.length > 0) {
      await safeQuery('tree proposals', async () => {
        const treeQuery = `
          SELECT dtp.id, dtp.document_id, dtp.operation_type, dtp.reason, dtp.status, dtp.updated_at as timestamp,
            dtp.organization_id, d.title as document_title, o.name as organization_name,
            u.name as created_by_name
          FROM document_tree_proposals dtp
          JOIN documents d ON dtp.document_id = d.id
          LEFT JOIN organizations o ON dtp.organization_id = o.id
          LEFT JOIN users u ON dtp.proposed_by_user_id = u.id
          WHERE dtp.document_id IN (${docPlaceholders})
            AND dtp.status = 'pending'
            AND NOT EXISTS (
              SELECT 1 FROM document_tree_proposal_votes dtpv
              WHERE dtpv.proposal_id = dtp.id AND dtpv.user_id = ?
            )
          ORDER BY dtp.updated_at DESC
          LIMIT ${PER_KIND_LIMIT}
        `;
        const rows = await TransactionManager.queryAll(db, treeQuery, [...documentIds, userId]);
        rows.forEach(row => {
          const ts = row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp || '');
          allEntries.push({
            id: `tree_proposal-${row.id}`,
            kind: 'tree_proposal',
            timestamp: ts,
            organizationId: row.organization_id || undefined,
            organizationName: row.organization_name || undefined,
            documentId: row.document_id,
            documentTitle: row.document_title,
            payload: {
              id: row.id,
              documentId: row.document_id,
              operationType: row.operation_type,
              reason: row.reason || undefined,
              status: row.status,
              createdByName: row.created_by_name,
            },
          });
        });
      });
    }

    // 7. Document-level voting (content vote or deletion vote open)
    if ((!kind || kind === 'document_voting') && documentIds.length > 0) {
      await safeQuery('document voting', async () => {
        const now = new Date().toISOString();
        const votingQuery = `
          SELECT d.id, d.title, d.organization_id, d.status, d.voting_deadline,
            d.deletion_proposed_at, d.deletion_vote_deadline,
            o.name as organization_name
          FROM documents d
          LEFT JOIN organizations o ON d.organization_id = o.id
          WHERE d.id IN (${docPlaceholders})
            AND (
              d.status = 'voting'
              OR (d.deletion_proposed_at IS NOT NULL AND d.deletion_vote_deadline IS NOT NULL AND d.deletion_vote_deadline > ?)
            )
          ORDER BY d.updated_at DESC
          LIMIT ${PER_KIND_LIMIT}
        `;
        const rows = await TransactionManager.queryAll(db, votingQuery, [...documentIds, now]);
        rows.forEach(row => {
          const contentVoting = row.status === 'voting';
          const deletionVoting = !!(row.deletion_proposed_at && row.deletion_vote_deadline && new Date(row.deletion_vote_deadline) > new Date());
          const ts = contentVoting && row.voting_deadline
            ? (row.voting_deadline instanceof Date ? row.voting_deadline.toISOString() : String(row.voting_deadline))
            : (row.deletion_vote_deadline ? (row.deletion_vote_deadline instanceof Date ? row.deletion_vote_deadline.toISOString() : String(row.deletion_vote_deadline)) : new Date().toISOString());
          allEntries.push({
            id: `document_voting-${row.id}`,
            kind: 'document_voting',
            timestamp: ts,
            organizationId: row.organization_id || undefined,
            organizationName: row.organization_name || undefined,
            documentId: row.id,
            documentTitle: row.title,
            payload: {
              documentId: row.id,
              documentTitle: row.title,
              organizationId: row.organization_id || undefined,
              contentVoting,
              deletionVoting,
              votingDeadline: contentVoting ? row.voting_deadline : undefined,
              deletionVoteDeadline: row.deletion_vote_deadline || undefined,
            },
          });
        });
      });
    }

    // 8b. Documents with pending amendment adoption org vote
    if ((!kind || kind === 'document_amendment_adoption_pending') && documentIds.length > 0) {
      await safeQuery('document amendment adoption pending', async () => {
        const adoptionPendingQuery = `
          SELECT d.id, d.title, d.organization_id, d.updated_at, d.amendment_adoption_vote_id,
            o.name as organization_name
          FROM documents d
          LEFT JOIN organizations o ON d.organization_id = o.id
          WHERE d.id IN (${docPlaceholders})
            AND d.status = 'agreed'
            AND d.amendment_adoption_vote_id IS NOT NULL
          ORDER BY d.updated_at DESC
          LIMIT ${PER_KIND_LIMIT}
        `;
        const rows = await TransactionManager.queryAll(db, adoptionPendingQuery, documentIds);
        rows.forEach(row => {
          const ts = row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || '');
          allEntries.push({
            id: `document_amendment_adoption_pending-${row.id}`,
            kind: 'document_amendment_adoption_pending',
            timestamp: ts,
            organizationId: row.organization_id || undefined,
            organizationName: row.organization_name || undefined,
            documentId: row.id,
            documentTitle: row.title,
            payload: {
              documentId: row.id,
              documentTitle: row.title,
              organizationId: row.organization_id || undefined,
              voteId: row.amendment_adoption_vote_id,
            },
          });
        });
      });
    }

    // 8. Documents open for amendments (agreed + amendments_open = 1)
    if ((!kind || kind === 'document_amendments_open') && documentIds.length > 0) {
      await safeQuery('document amendments open', async () => {
        const amendmentsQuery = `
          SELECT d.id, d.title, d.organization_id, d.updated_at,
            o.name as organization_name
          FROM documents d
          LEFT JOIN organizations o ON d.organization_id = o.id
          WHERE d.id IN (${docPlaceholders})
            AND d.status = 'agreed'
            AND d.amendments_open = 1
          ORDER BY d.updated_at DESC
          LIMIT ${PER_KIND_LIMIT}
        `;
        const rows = await TransactionManager.queryAll(db, amendmentsQuery, documentIds);
        rows.forEach(row => {
          const ts = row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || '');
          allEntries.push({
            id: `document_amendments_open-${row.id}`,
            kind: 'document_amendments_open',
            timestamp: ts,
            organizationId: row.organization_id || undefined,
            organizationName: row.organization_name || undefined,
            documentId: row.id,
            documentTitle: row.title,
            payload: {
              documentId: row.id,
              documentTitle: row.title,
              organizationId: row.organization_id || undefined,
            },
          });
        });
      });
    }

    allEntries.sort((a, b) => (b.timestamp < a.timestamp ? -1 : b.timestamp > a.timestamp ? 1 : 0));
    const total = allEntries.length;
    const paginated = allEntries.slice(offset, offset + limit);
    const hasMore = offset + paginated.length < total;

    logger.debug('Pending decisions fetched', { userId, total, returned: paginated.length });

    res.json({
      entries: paginated,
      pagination: { total, limit, offset, hasMore },
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Failed to fetch pending decisions', { error: error.message, stack: error.stack, userId: getUserId(req) });
    throw ApiError.database('Failed to fetch pending decisions', { originalError: error.message }, 'FETCH_PENDING_DECISIONS_FAILED');
  }
}));

module.exports = router;
