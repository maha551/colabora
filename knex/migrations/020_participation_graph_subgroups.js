/**
 * Participation Graph Phase 2: subgroups, vote metadata, governance columns.
 */

const AUDIT_ACTION_TYPES = [
  'org_created', 'rep_added', 'rep_removed', 'rep_removal_failed', 'member_invited', 'member_joined',
  'member_left', 'member_bulk_added', 'member_bulk_invited', 'member_added', 'org_updated',
  'invitation_accepted', 'invitation_resent', 'vote_declined', 'rep_removed_via_mistrust_vote',
  'vote_proposed', 'vote_approved', 'vote_started', 'vote_completed', 'doc_created', 'dissolution_proposed',
  'org_dissolved', 'bootstrap_completed', 'rule_proposal_created', 'rule_proposal_voting_started',
  'rule_proposal_declined', 'rule_proposal_rejected_conflict', 'rule_proposal_approved', 'rule_proposal_rejected',
  'rule_proposal_expired', 'governance_rules_updated', 'election_created', 'election_started',
  'election_phase_updated', 'election_phase_forced', 'election_auto_scheduled', 'election_completed',
  'rep_resignation_pending', 'rep_resignation_finalized', 'mistrust_vote_initiated', 'structure_proposal_approved',
  'structure_proposal_rejected', 'tree_proposal_approved', 'tree_proposal_rejected', 'tree_proposal_applied',
  'document_status_agreed', 'document_status_rejected', 'document_status_draft', 'subgroup_created',
];

const VOTE_TYPES = [
  'policy', 'document_change', 'document_amendment_adoption', 'membership', 'dissolution', 'other',
  'representative_removal', 'subgroup_creation',
];

async function alterPgVoteTypeCheck(knex, types) {
  const client = knex.client.config.client;
  if (client !== 'pg' && client !== 'postgresql') return;
  const literals = types.map((t) => `'${t}'::text`).join(', ');
  await knex.raw('ALTER TABLE organization_votes DROP CONSTRAINT IF EXISTS organization_votes_vote_type_check');
  await knex.raw(`ALTER TABLE organization_votes ADD CONSTRAINT organization_votes_vote_type_check CHECK (vote_type = ANY (ARRAY[${literals}]))`);
}

async function alterPgAuditCheck(knex, types) {
  const client = knex.client.config.client;
  if (client !== 'pg' && client !== 'postgresql') return;
  const literals = types.map((t) => `'${t}'::text`).join(', ');
  await knex.raw('ALTER TABLE organization_audit DROP CONSTRAINT IF EXISTS organization_audit_action_type_check');
  await knex.raw(`ALTER TABLE organization_audit ADD CONSTRAINT organization_audit_action_type_check CHECK ((action_type = ANY (ARRAY[${literals}])))`);
}

exports.up = async function up(knex) {
  if (!(await knex.schema.hasColumn('organization_votes', 'metadata_json'))) {
    await knex.schema.alterTable('organization_votes', (table) => {
      table.text('metadata_json').nullable();
      table.text('source_meeting_decision_id').nullable();
    });
  }

  if (!(await knex.schema.hasColumn('organizations', 'subgroup_visibility'))) {
    await knex.schema.alterTable('organizations', (table) => {
      table.text('subgroup_visibility').notNullable().defaultTo('open');
    });
  }

  const govColDefs = [
    ['participation_graph_enabled', (table, name) => table.boolean(name).notNullable().defaultTo(false)],
    ['subgroups_enabled', (table, name) => table.boolean(name).notNullable().defaultTo(false)],
    ['subgroup_creation_requires_vote', (table, name) => table.boolean(name).notNullable().defaultTo(true)],
    ['members_can_propose_subgroup_creation', (table, name) => table.boolean(name).notNullable().defaultTo(false)],
    ['max_subgroup_depth', (table, name) => table.integer(name).nullable()],
    ['default_subgroup_visibility', (table, name) => table.text(name).notNullable().defaultTo('open')],
    ['child_dissolution_policy', (table, name) => table.text(name).notNullable().defaultTo('independent')],
  ];

  for (const [name, addCol] of govColDefs) {
    if (!(await knex.schema.hasColumn('organization_governance_rules', name))) {
      await knex.schema.alterTable('organization_governance_rules', (table) => {
        addCol(table, name);
      });
    }
  }

  await alterPgVoteTypeCheck(knex, VOTE_TYPES);
  await alterPgAuditCheck(knex, AUDIT_ACTION_TYPES);
};

exports.down = async function down(knex) {
  await alterPgVoteTypeCheck(knex, VOTE_TYPES.filter((t) => t !== 'subgroup_creation'));
  await alterPgAuditCheck(knex, AUDIT_ACTION_TYPES.filter((t) => t !== 'subgroup_created'));

  if (await knex.schema.hasColumn('organization_votes', 'metadata_json')) {
    await knex.schema.alterTable('organization_votes', (table) => {
      table.dropColumn('metadata_json');
      table.dropColumn('source_meeting_decision_id');
    });
  }

  if (await knex.schema.hasColumn('organizations', 'subgroup_visibility')) {
    await knex.schema.alterTable('organizations', (table) => {
      table.dropColumn('subgroup_visibility');
    });
  }

  for (const name of [
    'participation_graph_enabled', 'subgroups_enabled', 'subgroup_creation_requires_vote',
    'members_can_propose_subgroup_creation', 'max_subgroup_depth', 'default_subgroup_visibility',
    'child_dissolution_policy',
  ]) {
    if (await knex.schema.hasColumn('organization_governance_rules', name)) {
      await knex.schema.alterTable('organization_governance_rules', (table) => {
        table.dropColumn(name);
      });
    }
  }
};
