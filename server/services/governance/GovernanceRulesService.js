/**
 * GovernanceRulesService - organization governance rules CRUD and bootstrap.
 */

const { v4: uuidv4 } = require('uuid');
const TransactionManager = require('../../database/services/TransactionManager');
const { logger } = require('../../middleware/logger');
const { ApiError } = require('../../middleware/errorHandler');
const { getUserOrganizationStatus } = require('../../utils/permissionUtils');
const { logAudit } = require('../../utils/auditLog');

/**
 * Create default governance rules for an organization.
 * @param {Object} knex - Knex/db instance
 * @param {string} organizationId - Organization ID
 * @param {Object} customRules - Optional overrides for default values
 * @returns {Promise<Object>} Created rules row (snake_case)
 */
async function createDefaultGovernanceRules(knex, organizationId, customRules = {}) {
  const rulesId = uuidv4();
  const booleanValues = {
    anonymousVotingEnabled: !!(customRules.anonymousVotingEnabled ?? true),
    voteChangeAllowed: !!(customRules.voteChangeAllowed ?? false),
    representativeCanCreateVotes: !!(customRules.representativeCanCreateVotes ?? true),
    representativeCanInviteMembers: !!(customRules.representativeCanInviteMembers ?? true),
    representativeCanManageDocuments: !!(customRules.representativeCanManageDocuments ?? true),
    representativeApprovalRequired: !!(customRules.representativeApprovalRequired ?? true),
    tamperProofEnabled: !!(customRules.tamperProofEnabled ?? true),
    auditTrailEnabled: !!(customRules.auditTrailEnabled ?? true),
    defaultStructureProposalsEnabled: !!(customRules.defaultStructureProposalsEnabled ?? true),
    defaultVotingAnonymityLocked: !!(customRules.defaultVotingAnonymityLocked ?? false)
  };

  await TransactionManager.execute(knex, `INSERT INTO organization_governance_rules (
    id, organization_id, representative_term_months, election_voting_method,
    election_quorum_percentage, election_notice_days, default_voting_deadline_hours,
    default_quorum_percentage, document_proposal_period_days, paragraph_proposal_cutoff_days,
    anonymous_voting_enabled, vote_change_allowed, representative_can_create_votes, representative_can_invite_members,
    representative_can_manage_documents, representative_approval_required,
    tamper_proof_enabled, audit_trail_enabled, threshold_calculation_method, default_acceptance_threshold,
    default_structure_proposals_enabled, default_voting_anonymity_locked
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    rulesId, organizationId,
    customRules.representativeTermMonths ?? 12,
    customRules.electionVotingMethod ?? 'simple_majority',
    customRules.electionQuorumPercentage ?? 0.5,
    customRules.electionNoticeDays ?? 14,
    customRules.defaultVotingDeadlineHours ?? 168,
    customRules.defaultQuorumPercentage ?? 0.5,
    customRules.documentProposalPeriodDays ?? 365,
    customRules.paragraphProposalCutoffDays ?? 7,
    booleanValues.anonymousVotingEnabled,
    booleanValues.voteChangeAllowed,
    booleanValues.representativeCanCreateVotes,
    booleanValues.representativeCanInviteMembers,
    booleanValues.representativeCanManageDocuments,
    booleanValues.representativeApprovalRequired,
    booleanValues.tamperProofEnabled,
    booleanValues.auditTrailEnabled,
    customRules.thresholdCalculationMethod ?? 'all_members',
    customRules.defaultAcceptanceThreshold ?? 75.0,
    booleanValues.defaultStructureProposalsEnabled,
    booleanValues.defaultVotingAnonymityLocked
  ]);

  return await TransactionManager.query(knex, `SELECT id, organization_id, representative_term_months, representative_term_limits,
    election_voting_method, election_quorum_percentage, election_notice_days,
    default_voting_deadline_hours, default_quorum_percentage, document_proposal_period_days, paragraph_proposal_cutoff_days,
    threshold_calculation_method, default_acceptance_threshold, anonymous_voting_enabled,
    vote_change_allowed, default_structure_proposals_enabled, default_voting_anonymity_locked,
    representative_can_create_votes, representative_can_invite_members, representative_can_manage_documents,
    representative_approval_required, tamper_proof_enabled, audit_trail_enabled,
    created_at, updated_at
    FROM organization_governance_rules WHERE id = ?`, [rulesId]);
}

/**
 * Get governance rules for an organization. Creates default rules if none exist.
 * @param {Object} knex - Knex/db instance
 * @param {string} organizationId - Organization ID
 * @returns {Promise<Object|null>} Rules row (snake_case) or null
 */
async function getGovernanceRules(knex, organizationId) {
  try {
    const selectWithCutoff = `SELECT id, organization_id, representative_term_months, representative_term_limits,
      election_voting_method, election_quorum_percentage, election_notice_days,
      default_voting_deadline_hours, default_quorum_percentage, document_proposal_period_days, paragraph_proposal_cutoff_days,
      threshold_calculation_method, default_acceptance_threshold, anonymous_voting_enabled,
      vote_change_allowed, default_structure_proposals_enabled, default_voting_anonymity_locked,
      representative_can_create_votes, representative_can_invite_members, representative_can_manage_documents,
      representative_approval_required, tamper_proof_enabled, audit_trail_enabled,
      members_can_propose_rules, members_can_propose_rules_threshold,
      members_can_create_documents, members_can_create_documents_threshold,
      members_can_initialize_elections, members_can_initialize_elections_threshold,
      members_can_invite_members, members_can_invite_members_threshold,
      members_can_manage_rule_proposals, members_can_manage_rule_proposals_threshold,
      minimum_quorum_percentage, minimum_approval_threshold, minimum_voting_period_hours,
      bootstrap_mode, bootstrap_completed_at, recovery_mode, recovery_mode_entered_at, recovery_mode_reason,
      last_successful_vote_at, failed_proposals_count, last_failed_proposal_at,
      rule_changes_this_month, last_rule_change_at,
      members_can_initiate_mistrust_vote, mistrust_vote_threshold, mistrust_vote_quorum_percentage,
      created_at, updated_at
      FROM organization_governance_rules WHERE organization_id = ?`;
    const selectWithoutCutoff = `SELECT id, organization_id, representative_term_months, representative_term_limits,
      election_voting_method, election_quorum_percentage, election_notice_days,
      default_voting_deadline_hours, default_quorum_percentage, document_proposal_period_days,
      threshold_calculation_method, default_acceptance_threshold, anonymous_voting_enabled,
      vote_change_allowed, default_structure_proposals_enabled, default_voting_anonymity_locked,
      representative_can_create_votes, representative_can_invite_members, representative_can_manage_documents,
      representative_approval_required, tamper_proof_enabled, audit_trail_enabled,
      members_can_propose_rules, members_can_propose_rules_threshold,
      members_can_create_documents, members_can_create_documents_threshold,
      members_can_initialize_elections, members_can_initialize_elections_threshold,
      members_can_invite_members, members_can_invite_members_threshold,
      members_can_manage_rule_proposals, members_can_manage_rule_proposals_threshold,
      minimum_quorum_percentage, minimum_approval_threshold, minimum_voting_period_hours,
      bootstrap_mode, bootstrap_completed_at, recovery_mode, recovery_mode_entered_at, recovery_mode_reason,
      last_successful_vote_at, failed_proposals_count, last_failed_proposal_at,
      rule_changes_this_month, last_rule_change_at,
      members_can_initiate_mistrust_vote, mistrust_vote_threshold, mistrust_vote_quorum_percentage,
      created_at, updated_at
      FROM organization_governance_rules WHERE organization_id = ?`;

    let row;
    try {
      row = await TransactionManager.query(knex, selectWithCutoff, [organizationId]);
    } catch (colErr) {
      const errMsg = (colErr?.message || '').toLowerCase();
      if (errMsg.includes('paragraph_proposal_cutoff_days') && (errMsg.includes('does not exist') || errMsg.includes('no such column'))) {
        logger.debug('paragraph_proposal_cutoff_days column not found, using fallback SELECT', { organizationId });
        row = await TransactionManager.query(knex, selectWithoutCutoff, [organizationId]);
        if (row) row.paragraph_proposal_cutoff_days = 7;
      } else {
        throw colErr;
      }
    }

    if (!row) {
      logger.info('No governance rules found for organization, creating defaults', { organizationId });
      try {
        const newRules = await createDefaultGovernanceRules(knex, organizationId);
        return newRules;
      } catch (createErr) {
        logger.error('Error creating default governance rules', {
          error: createErr.message,
          organizationId
        });
        return null;
      }
    }
    return row;
  } catch (error) {
    throw error;
  }
}


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
    const rules = await getGovernanceRules(txDb, organizationId);
    const memberRow = await TransactionManager.query(txDb, 'SELECT COUNT(*) as count FROM organization_members WHERE organization_id = ? AND status = ?', [organizationId, 'active']);
    const memberCount = memberRow ? memberRow.count : 0;
    const quorumRequired = Math.ceil(memberCount * (rules?.election_quorum_percentage || 0.5));
    const electionId = uuidv4();
    const nominationStart = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
    const votingStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const votingEnd = new Date(votingStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    await TransactionManager.execute(txDb, `INSERT INTO representative_elections (id, organization_id, election_title, election_description, positions_available, status, created_by, trigger_type, triggered_by_term_id, nomination_starts_at, nomination_ends_at, voting_starts_at, voting_ends_at, quorum_required, auto_advance_phases, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [electionId, organizationId, 'Automatic Election - Replacement for Resigned Representative', 'Election triggered by resignation of representative.', 1, 'draft', 'system', 'resignation', termId || null, nominationStart.toISOString(), votingStart.toISOString(), votingStart.toISOString(), votingEnd.toISOString(), quorumRequired, 1, now, now]);
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
  const rules = await getGovernanceRules(db, organizationId);
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

async function getBootstrapStatus(db, organizationId, userId, userRole) {
  const rules = await getGovernanceRules(db, organizationId);
  const isBootstrap = rules?.bootstrapMode ?? true;
  const coreRules = ['membersCanProposeRules', 'membersCanCreateDocuments', 'defaultQuorumPercentage'];
  const rows = await TransactionManager.queryAll(db, `
    SELECT id, status, current_rule_field
    FROM governance_rule_proposals
    WHERE organization_id = ?
      AND current_rule_field IN (?, ?, ?)
      AND status IN ('approved', 'active')
    ORDER BY current_rule_field, created_at DESC
  `, [organizationId, ...coreRules]);
  const latestByRule = new Map();
  for (const row of rows || []) {
    const field = row.current_rule_field;
    if (!latestByRule.has(field)) latestByRule.set(field, row);
  }
  const checklist = coreRules.map((rule) => {
    const proposal = latestByRule.get(rule);
    return {
      rule,
      completed: !!proposal && proposal.status === 'approved',
      proposalId: proposal?.id
    };
  });
  const completed = checklist.filter(c => c.completed).length;
  const status = await getUserOrganizationStatus(db, userId, organizationId, userRole);
  const isRep = status.isRepresentative;
  const isAdmin = status.isAdmin;
  let daysRemaining = null;
  if (isBootstrap && !rules?.bootstrapCompletedAt) {
    const org = await TransactionManager.query(db, 'SELECT created_at FROM organizations WHERE id = ?', [organizationId]);
    if (org) {
      const created = new Date(org.created_at);
      const daysSince = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
      daysRemaining = Math.max(0, 90 - daysSince);
    }
  }
  return {
    bootstrap: {
      mode: isBootstrap,
      completedAt: rules?.bootstrapCompletedAt || null,
      progress: { completed, total: 3, checklist },
      canComplete: isRep || isAdmin,
      daysRemaining: daysRemaining != null ? Math.ceil(daysRemaining) : null
    }
  };
}

async function completeBootstrap(db, organizationId, userId, { confirm }, auditContext) {
  if (!confirm) {
    throw ApiError.validation('Confirmation required');
  }
  const status = await getUserOrganizationStatus(db, userId, organizationId, null);
  if (!status.isRepresentative && !status.isAdmin) {
    throw ApiError.forbidden('Only representatives can complete bootstrap');
  }
  const rules = await getGovernanceRules(db, organizationId);
  if (!rules?.bootstrapMode) {
    throw ApiError.validation('Organization is not in bootstrap mode');
  }
  const now = new Date().toISOString();
  await TransactionManager.query(db, `
    UPDATE organization_governance_rules
    SET bootstrap_mode = false, bootstrap_completed_at = ?, updated_at = ?
    WHERE organization_id = ?
  `, [now, now, organizationId]);
  await logAudit(db, organizationId, 'bootstrap_completed', userId, null, { completedAt: now }, auditContext);
  return { mode: false, completedAt: now };
}

async function updateGovernanceRules(db, organizationId, userId, updates, auditContext) {
  const existingRules = await getGovernanceRules(db, organizationId);
  if (!existingRules) {
    throw ApiError.notFound('Governance rules');
  }
  const { getDatabaseFieldName, isValidGovernanceField } = require('../../utils/governanceFieldMapping');
  const { SYSTEM_MANAGED_FIELDS, METADATA_FIELDS } = require('../../utils/governanceRuleFields');
  const nonUpdatableFields = [
    ...METADATA_FIELDS,
    ...SYSTEM_MANAGED_FIELDS,
    'membersCanProposeRulesThreshold', 'membersCanCreateDocumentsThreshold', 'membersCanInitializeElectionsThreshold',
    'membersCanInviteMembersThreshold', 'membersCanManageRuleProposalsThreshold',
  ];
  const updateFields = [];
  const updateValues = [];
  Object.keys(updates).forEach(key => {
    if (nonUpdatableFields.includes(key)) return;
    if (!isValidGovernanceField(key)) {
      logger.debug(`Skipping field not in mapping: ${key}`);
      return;
    }
    const dbFieldName = getDatabaseFieldName(key);
    updateFields.push(`${dbFieldName} = ?`);
    const value = updates[key];
    if (typeof value === 'boolean') {
      updateValues.push(value ? 1 : 0);
    } else if (value === null || value === undefined) {
      updateValues.push(null);
    } else {
      updateValues.push(value);
    }
  });
  if (updateFields.length === 0) {
    throw ApiError.validation('No valid fields to update');
  }
  const { validateFieldNames, getFieldWhitelist } = require('../../utils/fieldValidation');
  const allowedFields = getFieldWhitelist('organization_governance_rules');
  const fieldNames = updateFields.map(field => field.split(' = ')[0]);
  validateFieldNames(fieldNames, allowedFields);
  updateValues.push(organizationId);
  const updateQuery = `UPDATE organization_governance_rules SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE organization_id = ?`;
  await TransactionManager.query(db, updateQuery, updateValues);
  await logAudit(db, organizationId, 'governance_rules_updated', userId, null, updates, auditContext);
  let documentIds = [];
  try {
    const docs = await TransactionManager.queryAll(db, 'SELECT id FROM documents WHERE organization_id = ?', [organizationId]);
    if (docs && docs.length > 0) documentIds = docs.map(doc => doc.id);
  } catch (docErr) {
    logger.warn('Error fetching documents for broadcast', { error: docErr.message, organizationId });
  }
  return { updates, documentIds };
}

module.exports = {
  createDefaultGovernanceRules,
  getGovernanceRules,
  getBootstrapStatus,
  completeBootstrap,
  updateGovernanceRules
};
