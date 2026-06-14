const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { logger } = require('../middleware/logger');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const TransactionManager = require('../database/services/TransactionManager');
const { getUserId } = require('../utils/routeHelpers');
const { buildAccessCheck } = require('../utils/documentQueries');
const VoterManager = require('../modules/voting');
const UnifiedVotingService = require('../modules/unified-voting');
const router = express.Router();

async function getEligibleVoterCountsByOrg(db, orgIds) {
  const unique = [...new Set(orgIds.filter(Boolean))];
  if (unique.length === 0) return {};
  const entries = await Promise.all(
    unique.map(async (id) => [id, await UnifiedVotingService.getEligibleVoterCount(db, id, 'organization')])
  );
  return Object.fromEntries(entries);
}

/**
 * GET /api/decisions - Get unified timeline of all resolved decisions
 * Aggregates: paragraph changes, rule proposals, elections, org votes,
 * structure proposals, tree proposals, document status changes, meeting decisions
 *
 * Query params: limit, offset, documentId, organizationId, kind
 */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const userId = getUserId(req);
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = parseInt(req.query.offset) || 0;
  const documentId = req.query.documentId;
  const organizationId = req.query.organizationId;
  const kind = req.query.kind;

  try {
    const allEntries = [];

    // Get user's organization IDs
    const orgRows = await TransactionManager.queryAll(db,
      'SELECT organization_id FROM organization_members WHERE user_id = ? AND status = ?',
      [userId, 'active']
    );
    const userOrgIds = orgRows.map(r => r.organization_id).filter(Boolean);

    // Get user's accessible document IDs
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
    const documentsQueryWithFilter = documentId
      ? documentsQuery + ' AND d.id = ?'
      : documentsQuery;
    const documents = await TransactionManager.queryAll(db, documentsQueryWithFilter, documentsParams);
    const documentIds = documents.map(d => d.id);
    const docById = Object.fromEntries(documents.map(d => [d.id, d]));

    // Filter orgs if organizationId provided
    const orgIdsToQuery = organizationId
      ? (userOrgIds.includes(organizationId) ? [organizationId] : [])
      : userOrgIds;

    const docPlaceholders = documentIds.length ? documentIds.map(() => '?').join(',') : '';
    const orgPlaceholders = orgIdsToQuery.length ? orgIdsToQuery.map(() => '?').join(',') : '';

    const safeQuery = async (label, fn) => {
      try {
        await fn();
      } catch (err) {
        logger.warn(`Decisions: ${label} failed, skipping`, { error: err.message });
      }
    };

    // 1. Paragraph changes (history)
    if ((!kind || kind === 'paragraph_change') && documentIds.length > 0) {
      await safeQuery('paragraph changes', async () => {
      const historyQuery = `
        SELECT
          h.id, h.paragraph_id, h.new_text as text, h.old_text as old_text,
          h.approval_percentage, COALESCE(h.accepted_at, h.created_at) as timestamp,
          h.proposal_id, h.user_id, h.heading_level,
          COALESCE(pr.type, CASE WHEN p.order_index = 1 THEN 'TITLE' ELSE 'BODY' END) as type,
          d.id as document_id, d.title as document_title, d.description as document_description,
          d.organization_id, o.name as organization_name,
          p.title as paragraph_title,
          u.id as user_id, u.name as user_name, u.email as user_email, u.avatar as user_avatar,
          (SELECT COUNT(*) FROM votes v WHERE v.proposal_id = h.proposal_id AND v.vote = 'PRO') as pro_votes,
          (SELECT COUNT(*) FROM votes v WHERE v.proposal_id = h.proposal_id AND v.vote = 'CONTRA') as contra_votes,
          (SELECT COUNT(*) FROM votes v WHERE v.proposal_id = h.proposal_id AND v.vote = 'NEUTRAL') as neutral_votes
        FROM history h
        JOIN paragraphs p ON h.paragraph_id = p.id
        JOIN documents d ON p.document_id = d.id
        JOIN users u ON h.user_id = u.id
        LEFT JOIN proposals pr ON h.proposal_id = pr.id
        LEFT JOIN organizations o ON d.organization_id = o.id
        WHERE p.document_id IN (${docPlaceholders})
          AND h.approval_percentage >= COALESCE(d.acceptance_threshold, 75.0)
        ORDER BY COALESCE(h.accepted_at, h.created_at) DESC
        LIMIT 50
      `;
      const rows = await TransactionManager.queryAll(db, historyQuery, documentIds);
      const voterCountByDoc = await VoterManager.getEligibleVoterCountsByDocument(
        db,
        rows.map((r) => r.document_id)
      );
      rows.forEach(row => {
        const ts = row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp || '');
        allEntries.push({
          id: `paragraph_change-${row.id}`,
          kind: 'paragraph_change',
          outcome: 'accepted',
          timestamp: ts,
          organizationId: row.organization_id || undefined,
          organizationName: row.organization_name || undefined,
          documentId: row.document_id,
          documentTitle: row.document_title,
          payload: {
            id: String(row.id),
            paragraphId: row.paragraph_id,
            userId: row.user_id,
            text: row.text || '',
            oldText: row.old_text || null,
            proposalId: row.proposal_id || null,
            acceptedAt: ts,
            approvalPercentage: Number(row.approval_percentage || 0),
            proVotes: Number(row.pro_votes || 0),
            contraVotes: Number(row.contra_votes || 0),
            neutralVotes: Number(row.neutral_votes || 0),
            totalEligibleVoters: voterCountByDoc[row.document_id] || 0,
            type: row.type || 'BODY',
            headingLevel: row.heading_level || undefined,
            user: { id: row.user_id, name: row.user_name, email: row.user_email, avatar: row.user_avatar },
            documentId: row.document_id,
            documentTitle: row.document_title,
            documentDescription: row.document_description || undefined,
            paragraphTitle: row.paragraph_title || undefined,
          },
        });
      });
      });
    }

    // 2. Rule proposals (approved/rejected)
    if ((!kind || kind === 'rule_proposal') && orgIdsToQuery.length > 0) {
      await safeQuery('rule proposals', async () => {
      const ruleQuery = `
        SELECT grp.id, grp.title, grp.description, grp.current_rule_field as rule_field, grp.status,
          grp.current_rule_value, grp.proposed_rule_value,
          COALESCE(grp.approved_at, grp.updated_at) as timestamp,
          grp.organization_id, o.name as organization_name,
          grp.votes_yes, grp.votes_no, grp.votes_abstain, u.name as created_by_name
        FROM governance_rule_proposals grp
        LEFT JOIN organizations o ON grp.organization_id = o.id
        LEFT JOIN users u ON grp.created_by = u.id
        WHERE grp.organization_id IN (${orgPlaceholders})
          AND grp.status IN ('approved', 'rejected')
        ORDER BY COALESCE(grp.approved_at, grp.updated_at) DESC
        LIMIT 50
      `;
      const rows = await TransactionManager.queryAll(db, ruleQuery, orgIdsToQuery);
      const orgEligibleById = await getEligibleVoterCountsByOrg(db, rows.map((r) => r.organization_id));
      rows.forEach(row => {
        const ts = row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp || '');
        allEntries.push({
          id: `rule_proposal-${row.id}`,
          kind: 'rule_proposal',
          outcome: row.status === 'approved' ? 'accepted' : 'rejected',
          timestamp: ts,
          organizationId: row.organization_id,
          organizationName: row.organization_name || undefined,
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
            totalEligibleVoters: orgEligibleById[row.organization_id] || 0,
            createdByName: row.created_by_name,
          },
        });
      });
      });
    }

    // 3. Elections (completed/cancelled)
    if ((!kind || kind === 'election') && orgIdsToQuery.length > 0) {
      await safeQuery('elections', async () => {
      const electionQuery = `
        SELECT re.id, re.election_title, re.election_description, re.status,
          COALESCE(re.election_completed_at, re.updated_at) as timestamp,
          re.organization_id, o.name as organization_name,
          re.positions_available, re.votes_cast, re.total_voters, re.quorum_met, u.name as created_by_name
        FROM representative_elections re
        LEFT JOIN organizations o ON re.organization_id = o.id
        LEFT JOIN users u ON re.created_by = u.id
        WHERE re.organization_id IN (${orgPlaceholders})
          AND re.status IN ('completed', 'cancelled')
        ORDER BY COALESCE(re.election_completed_at, re.updated_at) DESC
        LIMIT 50
      `;
      const rows = await TransactionManager.queryAll(db, electionQuery, orgIdsToQuery);
      const electionIds = rows.map((r) => r.id).filter(Boolean);
      const electedByElectionId = {};
      if (electionIds.length > 0) {
        const electionIdPlaceholders = electionIds.map(() => '?').join(',');
        const electedRows = await TransactionManager.queryAll(db, `
          SELECT ec.election_id, ec.user_id, u.name as user_name,
            ec.votes_received, ec.elected_position
          FROM election_candidates ec
          LEFT JOIN users u ON ec.user_id = u.id
          WHERE ec.election_id IN (${electionIdPlaceholders}) AND ec.elected = true
          ORDER BY ec.elected_position ASC
        `, electionIds);
        electedRows.forEach((c) => {
          if (!electedByElectionId[c.election_id]) {
            electedByElectionId[c.election_id] = [];
          }
          electedByElectionId[c.election_id].push({
            userId: c.user_id,
            name: c.user_name || 'Unknown',
            votesReceived: Number(c.votes_received || 0),
            position: Number(c.elected_position || 0),
          });
        });
      }
      rows.forEach(row => {
        const ts = row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp || '');
        allEntries.push({
          id: `election-${row.id}`,
          kind: 'election',
          outcome: row.status === 'completed' ? 'completed' : 'cancelled',
          timestamp: ts,
          organizationId: row.organization_id,
          organizationName: row.organization_name || undefined,
          payload: {
            id: row.id,
            electionTitle: row.election_title,
            electionDescription: row.election_description || undefined,
            status: row.status,
            positionsAvailable: row.positions_available || 1,
            votesCast: row.votes_cast || 0,
            totalVoters: row.total_voters || 0,
            quorumMet: !!row.quorum_met,
            createdByName: row.created_by_name,
            electedCandidates: electedByElectionId[row.id] || [],
          },
        });
      });
      });
    }

    // 4. Organization votes (passed/failed/cancelled)
    if ((!kind || kind === 'organization_vote') && orgIdsToQuery.length > 0) {
      const voteQuery = `
        SELECT ov.id, ov.title, ov.description, ov.vote_type, ov.status,
          COALESCE(ov.voting_ends_at, ov.created_at) as timestamp,
          ov.organization_id, o.name as organization_name,
          ov.target_document_id, d.title as target_document_title,
          ov.result_yes, ov.result_no, ov.result_abstain, ov.threshold,
          u.name as proposed_by_name
        FROM organization_votes ov
        LEFT JOIN organizations o ON ov.organization_id = o.id
        LEFT JOIN documents d ON ov.target_document_id = d.id
        LEFT JOIN users u ON ov.proposed_by_user_id = u.id
        WHERE ov.organization_id IN (${orgPlaceholders})
          AND ov.status IN ('passed', 'failed', 'cancelled')
        ORDER BY COALESCE(ov.voting_ends_at, ov.created_at) DESC
        LIMIT 50
      `;
      const rows = await TransactionManager.queryAll(db, voteQuery, orgIdsToQuery);
      const orgEligibleById = await getEligibleVoterCountsByOrg(db, rows.map((r) => r.organization_id));
      rows.forEach(row => {
        const ts = row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp || '');
        allEntries.push({
          id: `organization_vote-${row.id}`,
          kind: 'organization_vote',
          outcome: row.status === 'passed' ? 'passed' : row.status === 'failed' ? 'failed' : 'cancelled',
          timestamp: ts,
          organizationId: row.organization_id,
          organizationName: row.organization_name || undefined,
          documentId: row.target_document_id || undefined,
          documentTitle: row.target_document_title || undefined,
          payload: {
            id: row.id,
            title: row.title,
            description: row.description || undefined,
            voteType: row.vote_type,
            status: row.status,
            resultYes: row.result_yes || 0,
            resultNo: row.result_no || 0,
            resultAbstain: row.result_abstain || 0,
            totalEligibleVoters: orgEligibleById[row.organization_id] || 0,
            threshold: row.threshold,
            targetDocumentId: row.target_document_id || undefined,
            proposedByName: row.proposed_by_name || undefined,
          },
        });
      });
    }

    // 5. Structure proposals (approved/rejected)
    if ((!kind || kind === 'structure_proposal') && documentIds.length > 0) {
      await safeQuery('structure proposals', async () => {
      const structQuery = `
        SELECT sp.id, sp.title, sp.description, sp.status, sp.updated_at as timestamp,
          sp.document_id, d.title as document_title, d.organization_id, o.name as organization_name,
          u.name as created_by_name,
          (SELECT COUNT(*) FROM structure_proposal_votes spv WHERE spv.structure_proposal_id = sp.id AND spv.vote = 'PRO') as pro_votes,
          (SELECT COUNT(*) FROM structure_proposal_votes spv WHERE spv.structure_proposal_id = sp.id AND spv.vote = 'CONTRA') as contra_votes,
          (SELECT COUNT(*) FROM structure_proposal_votes spv WHERE spv.structure_proposal_id = sp.id AND spv.vote = 'NEUTRAL') as neutral_votes
        FROM structure_proposals sp
        JOIN documents d ON sp.document_id = d.id
        LEFT JOIN organizations o ON d.organization_id = o.id
        LEFT JOIN users u ON sp.user_id = u.id
        WHERE sp.document_id IN (${docPlaceholders})
          AND sp.status IN ('approved', 'rejected')
        ORDER BY sp.updated_at DESC
        LIMIT 50
      `;
      const rows = await TransactionManager.queryAll(db, structQuery, documentIds);
      const voterCountByDoc = await VoterManager.getEligibleVoterCountsByDocument(
        db,
        rows.map((r) => r.document_id)
      );
      rows.forEach(row => {
        const ts = row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp || '');
        allEntries.push({
          id: `structure_proposal-${row.id}`,
          kind: 'structure_proposal',
          outcome: row.status === 'approved' ? 'accepted' : 'rejected',
          timestamp: ts,
          organizationId: row.organization_id || undefined,
          organizationName: row.organization_name || undefined,
          documentId: row.document_id,
          documentTitle: row.document_title,
          payload: {
            id: row.id,
            title: row.title,
            description: row.description || undefined,
            status: row.status,
            proVotes: Number(row.pro_votes || 0),
            contraVotes: Number(row.contra_votes || 0),
            neutralVotes: Number(row.neutral_votes || 0),
            totalEligibleVoters: voterCountByDoc[row.document_id] || 0,
            createdByName: row.created_by_name,
          },
        });
      });
      });
    }

    // 6. Tree proposals (approved/rejected/applied)
    if ((!kind || kind === 'tree_proposal') && documentIds.length > 0) {
      await safeQuery('tree proposals', async () => {
      const treeQuery = `
        SELECT dtp.id, dtp.operation_type, dtp.reason, dtp.status, dtp.updated_at as timestamp,
          dtp.document_id, d.title as document_title, dtp.organization_id, o.name as organization_name,
          u.name as created_by_name,
          (SELECT COUNT(*) FROM document_tree_proposal_votes tv WHERE tv.proposal_id = dtp.id AND tv.vote = 'PRO') as pro_votes,
          (SELECT COUNT(*) FROM document_tree_proposal_votes tv WHERE tv.proposal_id = dtp.id AND tv.vote = 'CONTRA') as contra_votes,
          (SELECT COUNT(*) FROM document_tree_proposal_votes tv WHERE tv.proposal_id = dtp.id AND tv.vote = 'NEUTRAL') as neutral_votes
        FROM document_tree_proposals dtp
        JOIN documents d ON dtp.document_id = d.id
        LEFT JOIN organizations o ON dtp.organization_id = o.id
        LEFT JOIN users u ON dtp.proposed_by_user_id = u.id
        WHERE dtp.document_id IN (${docPlaceholders})
          AND dtp.status IN ('approved', 'rejected', 'applied')
        ORDER BY dtp.updated_at DESC
        LIMIT 50
      `;
      const rows = await TransactionManager.queryAll(db, treeQuery, documentIds);
      const orgEligibleById = await getEligibleVoterCountsByOrg(db, rows.map((r) => r.organization_id));
      rows.forEach(row => {
        const ts = row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp || '');
        allEntries.push({
          id: `tree_proposal-${row.id}`,
          kind: 'tree_proposal',
          outcome: row.status === 'rejected' ? 'rejected' : 'accepted',
          timestamp: ts,
          organizationId: row.organization_id || undefined,
          organizationName: row.organization_name || undefined,
          documentId: row.document_id,
          documentTitle: row.document_title,
          payload: {
            id: row.id,
            operationType: row.operation_type,
            reason: row.reason || undefined,
            status: row.status,
            proVotes: Number(row.pro_votes || 0),
            contraVotes: Number(row.contra_votes || 0),
            neutralVotes: Number(row.neutral_votes || 0),
            totalEligibleVoters: orgEligibleById[row.organization_id] || 0,
            createdByName: row.created_by_name,
          },
        });
      });
      });
    }

    // 7. Document status (agreed/rejected) and amendment lifecycle (same-status transitions)
    if ((!kind || kind === 'document_status' || kind === 'document_amendment') && documentIds.length > 0) {
      await safeQuery('document status', async () => {
      const statusQuery = `
        SELECT dsh.id, dsh.old_status, dsh.new_status, dsh.change_reason, dsh.created_at as timestamp,
          dsh.document_id, d.title as document_title, d.description as document_description,
          d.organization_id, o.name as organization_name,
          u.name as changed_by_name,
          (SELECT COUNT(*) FROM document_votes dv WHERE dv.document_id = dsh.document_id AND dv.vote = 'PRO') as pro_votes,
          (SELECT COUNT(*) FROM document_votes dv WHERE dv.document_id = dsh.document_id AND dv.vote = 'CONTRA') as contra_votes,
          (SELECT COUNT(*) FROM document_votes dv WHERE dv.document_id = dsh.document_id AND dv.vote = 'NEUTRAL') as neutral_votes
        FROM document_status_history dsh
        JOIN documents d ON dsh.document_id = d.id
        LEFT JOIN organizations o ON d.organization_id = o.id
        LEFT JOIN users u ON dsh.changed_by = u.id
        WHERE dsh.document_id IN (${docPlaceholders})
          AND (
            dsh.new_status IN ('agreed', 'rejected')
            OR dsh.change_reason IN (
              'amendments_opened', 'amendments_closed_empty', 'amendments_closed_pending_adoption',
              'amendment_adopted', 'amendment_adoption_rejected'
            )
          )
        ORDER BY dsh.created_at DESC
        LIMIT 50
      `;
      const rows = await TransactionManager.queryAll(db, statusQuery, documentIds);
      const voterCountByDoc = await VoterManager.getEligibleVoterCountsByDocument(
        db,
        rows.map((r) => r.document_id)
      );
      rows.forEach(row => {
        const ts = row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp || '');
        const amendmentReasons = new Set([
          'amendments_opened',
          'amendments_closed_empty',
          'amendments_closed_pending_adoption',
          'amendment_adopted',
          'amendment_adoption_rejected',
        ]);
        const isAmendmentEvent = row.change_reason && amendmentReasons.has(String(row.change_reason));
        if (kind === 'document_amendment' && !isAmendmentEvent) return;
        if (kind === 'document_status' && isAmendmentEvent) return;
        allEntries.push({
          id: `document_status-${row.id}`,
          kind: isAmendmentEvent ? 'document_amendment' : 'document_status',
          outcome: row.new_status === 'agreed' ? 'accepted' : 'rejected',
          timestamp: ts,
          organizationId: row.organization_id || undefined,
          organizationName: row.organization_name || undefined,
          documentId: row.document_id,
          documentTitle: row.document_title,
          payload: {
            id: row.id,
            oldStatus: row.old_status,
            newStatus: row.new_status,
            changeReason: row.change_reason || undefined,
            documentTitle: row.document_title,
            documentDescription: row.document_description || undefined,
            changedByName: row.changed_by_name,
            proVotes: Number(row.pro_votes || 0),
            contraVotes: Number(row.contra_votes || 0),
            neutralVotes: Number(row.neutral_votes || 0),
            totalEligibleVoters: voterCountByDoc[row.document_id] || 0,
          },
        });
      });
      });
    }

    // 8. Meeting protocol decisions (recorded in meeting minutes)
    if ((!kind || kind === 'meeting_decision') && orgIdsToQuery.length > 0) {
      await safeQuery('meeting decisions', async () => {
        let meetingDecisionQuery = `
          SELECT
            md.id, md.title, md.text, md.status, md.created_at as timestamp,
            md.meeting_id, md.minutes_document_id, md.agenda_item_id, md.meeting_vote_id,
            m.title as meeting_title, m.organization_id,
            o.name as organization_name,
            mai.title as agenda_item_title,
            d.title as minutes_document_title,
            u.name as created_by_name,
            mv.title as vote_title
          FROM meeting_decisions md
          JOIN meetings m ON md.meeting_id = m.id
          JOIN organizations o ON m.organization_id = o.id
          LEFT JOIN meeting_agenda_items mai ON md.agenda_item_id = mai.id
          LEFT JOIN documents d ON md.minutes_document_id = d.id
          LEFT JOIN users u ON md.created_by_user_id = u.id
          LEFT JOIN meeting_votes mv ON md.meeting_vote_id = mv.id
          WHERE m.organization_id IN (${orgPlaceholders})
        `;
        const meetingDecisionParams = [...orgIdsToQuery];
        if (documentId) {
          meetingDecisionQuery += ' AND md.minutes_document_id = ?';
          meetingDecisionParams.push(documentId);
        }
        meetingDecisionQuery += ' ORDER BY md.created_at DESC LIMIT 50';
        const rows = await TransactionManager.queryAll(db, meetingDecisionQuery, meetingDecisionParams);
        const voteIds = [...new Set(rows.map((r) => r.meeting_vote_id).filter(Boolean))];
        const voteOptionsByVoteId = {};
        if (voteIds.length > 0) {
          const placeholders = voteIds.map(() => '?').join(',');
          const optionRows = await TransactionManager.queryAll(db, `
            SELECT id, meeting_vote_id, label, sort_order
            FROM meeting_vote_options
            WHERE meeting_vote_id IN (${placeholders})
            ORDER BY sort_order ASC, id
          `, voteIds);
          const responseRows = await TransactionManager.queryAll(db, `
            SELECT meeting_vote_id, option_id, COUNT(*) as count
            FROM meeting_vote_responses
            WHERE meeting_vote_id IN (${placeholders})
            GROUP BY meeting_vote_id, option_id
          `, voteIds);
          const countMap = new Map();
          responseRows.forEach((r) => {
            const key = `${r.meeting_vote_id}:${r.option_id}`;
            countMap.set(key, Number(r.count || 0));
          });
          optionRows.forEach((opt) => {
            if (!voteOptionsByVoteId[opt.meeting_vote_id]) {
              voteOptionsByVoteId[opt.meeting_vote_id] = [];
            }
            voteOptionsByVoteId[opt.meeting_vote_id].push({
              id: opt.id,
              label: opt.label || 'Option',
              count: countMap.get(`${opt.meeting_vote_id}:${opt.id}`) || 0,
            });
          });
        }
        rows.forEach(row => {
          const ts = row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp || '');
          const status = String(row.status || 'recorded');
          const voteOptions = row.meeting_vote_id
            ? voteOptionsByVoteId[row.meeting_vote_id] || []
            : [];
          allEntries.push({
            id: `meeting_decision-${row.id}`,
            kind: 'meeting_decision',
            outcome: status === 'recorded' ? 'recorded' : status,
            timestamp: ts,
            organizationId: row.organization_id || undefined,
            organizationName: row.organization_name || undefined,
            documentId: row.minutes_document_id || undefined,
            documentTitle: row.meeting_title || row.minutes_document_title || undefined,
            payload: {
              id: row.id,
              meetingId: row.meeting_id,
              meetingTitle: row.meeting_title || undefined,
              minutesDocumentId: row.minutes_document_id || undefined,
              minutesDocumentTitle: row.minutes_document_title || undefined,
              agendaItemId: row.agenda_item_id || undefined,
              agendaItemTitle: row.agenda_item_title || undefined,
              meetingVoteId: row.meeting_vote_id || undefined,
              voteTitle: row.vote_title || undefined,
              voteOptions: voteOptions.length > 0 ? voteOptions : undefined,
              title: row.title || undefined,
              text: row.text || '',
              status,
              createdByName: row.created_by_name || undefined,
            },
          });
        });
      });
    }

    // 9. Document deletion outcomes (from decisions_audit)
    if ((!kind || kind === 'document_deletion') && orgIdsToQuery.length > 0) {
      await safeQuery('document deletion', async () => {
        let deletionQuery = `
          SELECT da.id, da.outcome, da.created_at as timestamp,
            da.organization_id, o.name as organization_name,
            da.document_id, da.document_title,
            da.pro_votes, da.contra_votes, da.neutral_votes, da.total_eligible_voters,
            da.approval_percentage, da.threshold,
            u.name as changed_by_name
          FROM decisions_audit da
          LEFT JOIN organizations o ON da.organization_id = o.id
          LEFT JOIN users u ON da.changed_by = u.id
          WHERE da.kind = 'document_deletion'
            AND da.organization_id IN (${orgPlaceholders})
        `;
        const deletionParams = [...orgIdsToQuery];
        if (documentId) {
          deletionQuery += ' AND da.document_id = ?';
          deletionParams.push(documentId);
        }
        deletionQuery += ' ORDER BY da.created_at DESC LIMIT 50';
        const rows = await TransactionManager.queryAll(db, deletionQuery, deletionParams);
        rows.forEach((row) => {
          const ts = row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp || '');
          allEntries.push({
            id: `document_deletion-${row.id}`,
            kind: 'document_deletion',
            outcome: row.outcome === 'accepted' ? 'accepted' : 'rejected',
            timestamp: ts,
            organizationId: row.organization_id,
            organizationName: row.organization_name || undefined,
            documentId: row.document_id || undefined,
            documentTitle: row.document_title || undefined,
            payload: {
              id: row.id,
              documentTitle: row.document_title || undefined,
              proVotes: Number(row.pro_votes || 0),
              contraVotes: Number(row.contra_votes || 0),
              neutralVotes: Number(row.neutral_votes || 0),
              totalEligibleVoters: Number(row.total_eligible_voters || 0),
              approvalPercentage: row.approval_percentage != null ? Number(row.approval_percentage) : undefined,
              threshold: row.threshold != null ? Number(row.threshold) : undefined,
              changedByName: row.changed_by_name || undefined,
            },
          });
        });
      });
    }

    // Sort by timestamp DESC and paginate
    allEntries.sort((a, b) => (b.timestamp < a.timestamp ? -1 : b.timestamp > a.timestamp ? 1 : 0));
    const total = allEntries.length;
    const paginated = allEntries.slice(offset, offset + limit);
    const hasMore = offset + paginated.length < total;

    logger.debug('Decisions fetched', { userId, total, returned: paginated.length });

    res.json({
      entries: paginated,
      pagination: {
        total,
        limit,
        offset,
        hasMore,
      },
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Failed to fetch decisions', { error: error.message, stack: error.stack, userId });
    throw ApiError.database('Failed to fetch decisions', { originalError: error.message }, 'FETCH_DECISIONS_FAILED');
  }
}));

module.exports = router;
