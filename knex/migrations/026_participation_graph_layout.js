/**
 * Participation Graph Phase 9: persisted graph layout on root org.
 */

const VOTE_TYPES = [
  'policy', 'document_change', 'document_amendment_adoption', 'membership', 'dissolution', 'other',
  'representative_removal', 'subgroup_creation', 'document_submission', 'relationship_change',
];

async function alterPgVoteTypeCheck(knex, types) {
  const client = knex.client.config.client;
  if (client !== 'pg' && client !== 'postgresql') return;
  const literals = types.map((t) => `'${t}'::text`).join(', ');
  await knex.raw('ALTER TABLE organization_votes DROP CONSTRAINT IF EXISTS organization_votes_vote_type_check');
  await knex.raw(`ALTER TABLE organization_votes ADD CONSTRAINT organization_votes_vote_type_check CHECK (vote_type = ANY (ARRAY[${literals}]))`);
}

exports.up = async function up(knex) {
  if (!(await knex.schema.hasColumn('organizations', 'graph_layout_json'))) {
    await knex.schema.alterTable('organizations', (table) => {
      table.text('graph_layout_json').nullable();
    });
  }
  if (!(await knex.schema.hasColumn('organization_governance_rules', 'visual_graph_editor_enabled'))) {
    await knex.schema.alterTable('organization_governance_rules', (table) => {
      table.boolean('visual_graph_editor_enabled').notNullable().defaultTo(false);
    });
  }
  await alterPgVoteTypeCheck(knex, VOTE_TYPES);
};

exports.down = async function down(knex) {
  await alterPgVoteTypeCheck(knex, VOTE_TYPES.filter((t) => t !== 'relationship_change'));
  if (await knex.schema.hasColumn('organization_governance_rules', 'visual_graph_editor_enabled')) {
    await knex.schema.alterTable('organization_governance_rules', (table) => {
      table.dropColumn('visual_graph_editor_enabled');
    });
  }
  if (await knex.schema.hasColumn('organizations', 'graph_layout_json')) {
    await knex.schema.alterTable('organizations', (table) => {
      table.dropColumn('graph_layout_json');
    });
  }
};
