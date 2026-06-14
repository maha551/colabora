/**
 * Allow document_status_draft in organization_audit (minutes unfinalize).
 */

const ACTION_TYPES = [
  'org_created',
  'rep_added',
  'rep_removed',
  'rep_removal_failed',
  'member_invited',
  'member_joined',
  'member_left',
  'member_bulk_added',
  'member_bulk_invited',
  'member_added',
  'org_updated',
  'invitation_accepted',
  'invitation_resent',
  'vote_declined',
  'rep_removed_via_mistrust_vote',
  'vote_proposed',
  'vote_approved',
  'vote_started',
  'vote_completed',
  'doc_created',
  'dissolution_proposed',
  'org_dissolved',
  'bootstrap_completed',
  'rule_proposal_created',
  'rule_proposal_voting_started',
  'rule_proposal_declined',
  'rule_proposal_rejected_conflict',
  'rule_proposal_approved',
  'rule_proposal_rejected',
  'rule_proposal_expired',
  'governance_rules_updated',
  'election_created',
  'election_started',
  'election_phase_updated',
  'election_phase_forced',
  'election_auto_scheduled',
  'election_completed',
  'rep_resignation_pending',
  'rep_resignation_finalized',
  'mistrust_vote_initiated',
  'structure_proposal_approved',
  'structure_proposal_rejected',
  'tree_proposal_approved',
  'tree_proposal_rejected',
  'tree_proposal_applied',
  'document_status_agreed',
  'document_status_rejected',
  'document_status_draft',
];

function buildActionTypeCheckSql() {
  const literals = ACTION_TYPES.map((type) => `'${type}'::text`).join(', ');
  return `CHECK ((action_type = ANY (ARRAY[${literals}])))`;
}

exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE organization_audit
    DROP CONSTRAINT IF EXISTS organization_audit_action_type_check
  `);
  await knex.raw(`
    ALTER TABLE organization_audit
    ADD CONSTRAINT organization_audit_action_type_check
    ${buildActionTypeCheckSql()}
  `);
};

exports.down = async function down(knex) {
  const withoutDraft = ACTION_TYPES.filter((type) => type !== 'document_status_draft');
  const literals = withoutDraft.map((type) => `'${type}'::text`).join(', ');

  await knex.raw(`
    ALTER TABLE organization_audit
    DROP CONSTRAINT IF EXISTS organization_audit_action_type_check
  `);
  await knex.raw(`
    ALTER TABLE organization_audit
    ADD CONSTRAINT organization_audit_action_type_check
    CHECK ((action_type = ANY (ARRAY[${literals}])))
  `);
};
