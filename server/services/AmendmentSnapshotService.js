/**
 * Amendment snapshot: collect candidates, build frozen bundle at close, apply on org vote pass.
 */

const { v4: uuidv4 } = require('uuid');
const TransactionManager = require('../database/services/TransactionManager');
const { logger } = require('../middleware/logger');
const UnifiedVotingService = require('../modules/unified-voting');
const VoterManager = require('../modules/voting');

async function collectParagraphCandidates(db, documentId) {
  const doc = await TransactionManager.query(db, `
    SELECT acceptance_threshold, organization_id, status, amendments_open
    FROM documents WHERE id = ?
  `, [documentId]);
  if (!doc) return [];

  const acceptanceThreshold = doc.acceptance_threshold != null ? doc.acceptance_threshold : 75.0;
  const eligibleVoters = await VoterManager.getEligibleVoterCount(db, documentId);

  const rows = await TransactionManager.queryAll(db, `
    SELECT pr.id as proposal_id, pr.paragraph_id, pr.text, pr.type, pr.heading_level,
           pr.amendment_candidate, p.order_index,
           COUNT(CASE WHEN v.vote = 'PRO' THEN 1 END) as pro_votes,
           COUNT(v.id) as total_votes
    FROM proposals pr
    JOIN paragraphs p ON pr.paragraph_id = p.id
    LEFT JOIN votes v ON v.proposal_id = pr.id
    WHERE p.document_id = ?
    GROUP BY pr.id, pr.paragraph_id, pr.text, pr.type, pr.heading_level, pr.amendment_candidate, p.order_index
  `, [documentId]);

  const candidates = [];
  for (const row of rows) {
    const isFlagged = row.amendment_candidate === true || row.amendment_candidate === 1;
    const approvalPercentage = row.total_votes > 0
      ? (row.pro_votes / row.total_votes) * 100
      : 0;
    const meetsThreshold = approvalPercentage >= acceptanceThreshold;
    if (isFlagged || (doc.amendments_open === 1 && meetsThreshold && row.total_votes > 0)) {
      candidates.push({
        paragraphId: row.paragraph_id,
        proposalId: row.proposal_id,
        order: row.order_index,
        type: row.type || 'BODY',
        text: row.text,
        headingLevel: row.heading_level || undefined,
        approvalPercentage: Math.round(approvalPercentage * 10) / 10,
        proVotes: row.pro_votes,
        totalVotes: row.total_votes,
      });
    }
  }

  // One winning proposal per paragraph (highest approval)
  const byParagraph = new Map();
  for (const c of candidates) {
    const existing = byParagraph.get(c.paragraphId);
    if (!existing || c.approvalPercentage > existing.approvalPercentage) {
      byParagraph.set(c.paragraphId, c);
    }
  }
  return Array.from(byParagraph.values());
}

async function collectStructureCandidates(db, documentId) {
  const rows = await TransactionManager.queryAll(db, `
    SELECT id as proposal_id, title,
      (SELECT COUNT(*) FROM structure_operations WHERE structure_proposal_id = structure_proposals.id) as operation_count
    FROM structure_proposals
    WHERE document_id = ? AND applied = false AND status = 'approved'
  `, [documentId]);
  return rows.map((r) => ({
    proposalId: r.proposal_id,
    title: r.title || 'Structure change',
    operationCount: r.operation_count || 0,
  }));
}

async function collectTreeCandidates(db, documentId) {
  const rows = await TransactionManager.queryAll(db, `
    SELECT id as proposal_id, operation_type
    FROM document_tree_proposals
    WHERE document_id = ? AND status = 'approved'
  `, [documentId]);
  return rows.map((r) => ({
    proposalId: r.proposal_id,
    operationType: r.operation_type || 'unknown',
  }));
}

async function buildSnapshot(db, documentId, closedByUserId) {
  const paragraphChanges = await collectParagraphCandidates(db, documentId);
  const structureProposals = await collectStructureCandidates(db, documentId);
  const treeProposals = await collectTreeCandidates(db, documentId);

  const snapshot = {
    documentId,
    closedAt: new Date().toISOString(),
    closedByUserId,
    paragraphChanges,
    structureProposals,
    treeProposals,
  };

  const isEmpty =
    paragraphChanges.length === 0 &&
    structureProposals.length === 0 &&
    treeProposals.length === 0;

  return { snapshot, isEmpty };
}

async function clearCandidates(db, documentId) {
  await TransactionManager.execute(db, `
    UPDATE proposals SET amendment_candidate = false
    WHERE paragraph_id IN (SELECT id FROM paragraphs WHERE document_id = ?)
  `, [documentId]);
}

async function applyParagraphChange(db, documentId, change) {
  const votesRouter = require('../routes/votes');
  if (typeof votesRouter.applyProposalToCanonical === 'function') {
    await votesRouter.applyProposalToCanonical(db, change.proposalId, documentId);
    return;
  }
  logger.warn('applyProposalToCanonical not available', { documentId, proposalId: change.proposalId });
}

async function applySnapshot(db, documentId, snapshot) {
  const data = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
  if (!data) return;

  for (const change of data.paragraphChanges || []) {
    try {
      await applyParagraphChange(db, documentId, change);
    } catch (err) {
      logger.error('Failed to apply paragraph amendment', { error: err.message, documentId, proposalId: change.proposalId });
    }
  }

  // Structure/tree apply hooks — best-effort if modules exist
  for (const sp of data.structureProposals || []) {
    try {
      const structureRouter = require('../routes/structure-proposals');
      if (typeof structureRouter.applyApprovedProposal === 'function') {
        await structureRouter.applyApprovedProposal(db, documentId, sp.proposalId);
      }
    } catch (err) {
      logger.warn('Structure proposal apply skipped', { error: err.message, proposalId: sp.proposalId });
    }
  }

  for (const tp of data.treeProposals || []) {
    try {
      const treeRouter = require('../routes/document-tree-proposals');
      if (typeof treeRouter.applyApprovedTreeProposal === 'function') {
        await treeRouter.applyApprovedTreeProposal(db, tp.proposalId);
      }
    } catch (err) {
      logger.warn('Tree proposal apply skipped', { error: err.message, proposalId: tp.proposalId });
    }
  }

  await clearCandidates(db, documentId);
}

async function createAmendmentAdoptionVote(db, organizationId, documentId, snapshot, closedByUserId, documentTitle) {
  const org = await TransactionManager.query(db,
    'SELECT voting_enabled, voting_threshold FROM organizations WHERE id = ?',
    [organizationId]
  );
  if (!org?.voting_enabled) {
    throw new Error('Voting is not enabled for this organization');
  }

  const voteId = uuidv4();
  const rawThreshold = org.voting_threshold ?? 0.5;
  const threshold = rawThreshold <= 1 ? rawThreshold * 100 : rawThreshold;
  const summary = {
    snapshot,
    summary: {
      paragraphCount: snapshot.paragraphChanges?.length || 0,
      structureCount: snapshot.structureProposals?.length || 0,
      treeCount: snapshot.treeProposals?.length || 0,
    },
  };
  const title = `Adopt amendments to "${documentTitle || 'Document'}"`;
  const now = new Date().toISOString();

  await TransactionManager.execute(db, `INSERT INTO organization_votes (
    id, organization_id, title, description, vote_type, proposed_by_user_id,
    approved_by_rep_id, threshold, status, voting_starts_at, target_document_id
  ) VALUES (?, ?, ?, ?, 'document_amendment_adoption', ?, ?, ?, 'approved', ?, ?)`, [
    voteId,
    organizationId,
    title,
    JSON.stringify(summary),
    closedByUserId,
    closedByUserId,
    threshold,
    now,
    documentId,
  ]);

  return voteId;
}

module.exports = {
  collectParagraphCandidates,
  buildSnapshot,
  clearCandidates,
  applySnapshot,
  createAmendmentAdoptionVote,
};
