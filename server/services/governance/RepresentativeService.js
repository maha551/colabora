/**
 * RepresentativeService - representative resignation, pending resignations, mistrust votes.
 */

const { v4: uuidv4 } = require('uuid');
const TransactionManager = require('../../database/services/TransactionManager');
const { ApiError } = require('../../middleware/errorHandler');
const { isActiveMember, isRepresentative } = require('../../modules/permissions');
const { broadcastOrganizationUpdate } = require('../../utils/websocketBroadcast');
const { logAudit } = require('../../utils/auditLog');
const GovernanceRulesService = require('./GovernanceRulesService');
const ElectionService = require('../ElectionService');

async function resignRepresentative(db, organizationId, repId, userId, auditContext = {}) {
  if (userId !== repId) throw ApiError.forbidden('You can only resign your own position', 'CANNOT_RESIGN_OTHERS');
  const isRep = await isRepresentative(db, userId, organizationId);
  if (!isRep) throw ApiError.forbidden('You are not a representative', 'NOT_REPRESENTATIVE');
  return await TransactionManager.executeInTransaction(db, async (txDb) => {
    const repCountRow = await TransactionManager.query(txDb, 'SELECT COUNT(*) as count FROM organization_representatives WHERE organization_id = ? AND status = ?', [organizationId, 'active']);
    if (!repCountRow) throw new Error('Failed to check representative count');
    const existingTerm = await TransactionManager.query(txDb, `SELECT id, resignation_pending, replacement_election_id, term_status FROM representative_terms WHERE organization_id = ? AND user_id = ? AND (term_status = 'active' OR resignation_pending = ?)`, [organizationId, repId, true]);
    if (existingTerm && existingTerm.resignation_pending) throw new Error('You already have a pending resignation. Please wait for the replacement election to complete.');
    const now = new Date().toISOString();
    const termId = existingTerm ? existingTerm.id : null;
    if (termId) {
      await TransactionManager.execute(txDb, `UPDATE representative_terms SET resignation_pending = ?, resignation_requested_at = ?, updated_at = ? WHERE id = ? AND term_status = 'active'`, [true, now, now, termId]);
    } else {
      const newTermId = uuidv4();
      const termEndDate = new Date(); termEndDate.setMonth(termEndDate.getMonth() + 12);
      await TransactionManager.execute(txDb, `INSERT INTO representative_terms (id, organization_id, user_id, term_number, term_start_date, term_end_date, term_status, resignation_pending, resignation_requested_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [newTermId, organizationId, repId, 1, now, termEndDate.toISOString(), 'active', true, now, now, now]);
    }
    const rules = await GovernanceRulesService.getGovernanceRules(txDb, organizationId);
    const memberRow = await TransactionManager.query(txDb, 'SELECT COUNT(*) as count FROM organization_members WHERE organization_id = ? AND status = ?', [organizationId, 'active']);
    const memberCount = memberRow ? memberRow.count : 0;
    const quorumRequired = Math.ceil(memberCount * (rules?.election_quorum_percentage || 0.5));
    const electionId = await ElectionService.createReplacementElection(txDb, {
      organizationId,
      termId: termId || null,
      quorumRequired,
      createdBy: repId,
    });
    const finalTermId = termId || (await TransactionManager.query(txDb, 'SELECT id FROM representative_terms WHERE organization_id = ? AND user_id = ? AND resignation_pending = ?', [organizationId, repId, true]))?.id;
    if (finalTermId) await TransactionManager.execute(txDb, 'UPDATE representative_terms SET replacement_election_id = ? WHERE id = ?', [electionId, finalTermId]);
    await logAudit(txDb, organizationId, 'rep_resignation_pending', userId, repId, { electionId, termId: finalTermId }, auditContext);
    broadcastOrganizationUpdate(organizationId, 'representative-resignation-pending', { organizationId, userId: repId, electionId });
    return { success: true, message: 'Resignation request submitted. An election has been scheduled to find your replacement.', electionCreated: true, electionId };
  });
}

async function getPendingResignations(db, organizationId) {
  const resignationsResult = await TransactionManager.queryAll(db, `
    SELECT rt.id, rt.user_id, rt.resignation_requested_at, rt.replacement_election_id, rt.failed_election_attempts, u.name as user_name, u.email as user_email, re.status as election_status, re.election_title
    FROM representative_terms rt
    LEFT JOIN users u ON rt.user_id = u.id
    LEFT JOIN representative_elections re ON rt.replacement_election_id = re.id
    WHERE rt.organization_id = ? AND rt.resignation_pending = ? AND rt.term_status = 'active'
    ORDER BY rt.resignation_requested_at DESC
  `, [organizationId, true]);
  return { pendingResignations: resignationsResult || [] };
}

async function initiateMistrustVote(db, organizationId, repId, userId, auditContext = {}) {
  if (userId === repId) throw ApiError.validation('You cannot initiate a mistrust vote against yourself', null, 'CANNOT_VOTE_AGAINST_SELF');
  const isTargetRep = await isRepresentative(db, repId, organizationId);
  if (!isTargetRep) throw ApiError.validation('User is not a representative', null, 'USER_NOT_REPRESENTATIVE');
  const pendingResignation = await TransactionManager.query(db, `SELECT id FROM representative_terms WHERE organization_id = ? AND user_id = ? AND resignation_pending = ? AND term_status = 'active'`, [organizationId, repId, true]);
  if (pendingResignation) throw ApiError.validation('Representative has a pending resignation. Mistrust vote not needed.', null, 'PENDING_RESIGNATION_EXISTS');
  const existingVote = await TransactionManager.query(db, `SELECT id, status FROM organization_votes WHERE organization_id = ? AND vote_type = 'representative_removal' AND description LIKE ? AND status IN ('proposed', 'approved', 'voting')`, [organizationId, `%${repId}%`]);
  if (existingVote) throw ApiError.validation('A mistrust vote is already active for this representative', { existingVoteId: existingVote.id }, 'MISTRUST_VOTE_EXISTS');
  const rules = await GovernanceRulesService.getGovernanceRules(db, organizationId);
  const membersCanInitiate = rules?.members_can_initiate_mistrust_vote === 1;
  const isRep = await isRepresentative(db, userId, organizationId);
  const isMember = await isActiveMember(db, userId, organizationId);
  if (!isRep && (!membersCanInitiate || !isMember)) throw ApiError.forbidden('You do not have permission to initiate mistrust votes', { message: membersCanInitiate ? 'You must be an active member' : 'Only representatives can initiate mistrust votes' }, 'PERMISSION_DENIED');
  const repInfo = await TransactionManager.query(db, `SELECT u.name, u.email FROM organization_representatives or_rep JOIN users u ON or_rep.user_id = u.id WHERE or_rep.organization_id = ? AND or_rep.user_id = ? AND or_rep.status = 'active'`, [organizationId, repId]);
  const repName = repInfo?.name || 'Representative';
  const threshold = rules?.mistrust_vote_threshold || 75.0;
  const quorumPercentage = rules?.mistrust_vote_quorum_percentage || 0.5;
  const voteId = uuidv4();
  const title = `Mistrust Vote: Remove ${repName} as Representative`;
  const description = JSON.stringify({ targetRepresentativeId: repId, targetRepresentativeName: repName, threshold, quorumPercentage });
  await TransactionManager.query(db, `INSERT INTO organization_votes (id, organization_id, title, description, vote_type, proposed_by_user_id, threshold, status, created_at) VALUES (?, ?, ?, ?, 'representative_removal', ?, ?, 'proposed', CURRENT_TIMESTAMP)`, [voteId, organizationId, title, description, userId, threshold]);
  await logAudit(db, organizationId, 'mistrust_vote_initiated', userId, repId, { voteId, targetRepresentativeId: repId }, auditContext);
  broadcastOrganizationUpdate(organizationId, 'organization-vote-created', { organizationId, voteId, voteType: 'representative_removal', title });
  return { success: true, message: 'Mistrust vote initiated successfully. A representative must approve it before voting begins.', vote: { id: voteId, organizationId, title, voteType: 'representative_removal', status: 'proposed', threshold, quorumPercentage } };
}

module.exports = {
  resignRepresentative,
  getPendingResignations,
  initiateMistrustVote
};
