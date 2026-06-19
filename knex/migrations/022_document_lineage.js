/**
 * Participation Graph Phase 5: cross-org document ratification lineage.
 */

const VOTE_TYPES = [
  'policy', 'document_change', 'document_amendment_adoption', 'membership', 'dissolution', 'other',
  'representative_removal', 'subgroup_creation', 'document_submission',
];

async function alterPgVoteTypeCheck(knex, types) {
  const client = knex.client.config.client;
  if (client !== 'pg' && client !== 'postgresql') return;
  const literals = types.map((t) => `'${t}'::text`).join(', ');
  await knex.raw('ALTER TABLE organization_votes DROP CONSTRAINT IF EXISTS organization_votes_vote_type_check');
  await knex.raw(`ALTER TABLE organization_votes ADD CONSTRAINT organization_votes_vote_type_check CHECK (vote_type = ANY (ARRAY[${literals}]))`);
}

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('document_lineage'))) {
    await knex.schema.createTable('document_lineage', (table) => {
      table.text('id').primary();
      table.text('source_document_id').notNullable()
        .references('id').inTable('documents').onDelete('CASCADE');
      table.text('source_organization_id').notNullable()
        .references('id').inTable('organizations').onDelete('CASCADE');
      table.text('derived_document_id').nullable()
        .references('id').inTable('documents').onDelete('SET NULL');
      table.text('derived_organization_id').nullable()
        .references('id').inTable('organizations').onDelete('SET NULL');
      table.text('relationship_flow_id').nullable()
        .references('id').inTable('organization_relationships').onDelete('SET NULL');
      table.text('status').notNullable().defaultTo('pending_ratification');
      table.timestamp('submitted_at').nullable();
      table.text('submitted_by_user_id').nullable()
        .references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('ratified_at').nullable();
      table.text('notes').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.index(['source_document_id'], 'idx_document_lineage_source_doc');
      table.index(['derived_organization_id', 'status'], 'idx_document_lineage_derived_status');
    });
  }

  if (!(await knex.schema.hasColumn('documents', 'source_lineage_id'))) {
    await knex.schema.alterTable('documents', (table) => {
      table.text('source_lineage_id').nullable();
      table.text('ratification_scope').notNullable().defaultTo('local');
    });
  }

  await alterPgVoteTypeCheck(knex, VOTE_TYPES);
};

exports.down = async function down(knex) {
  await alterPgVoteTypeCheck(knex, VOTE_TYPES.filter((t) => t !== 'document_submission'));
  if (await knex.schema.hasColumn('documents', 'source_lineage_id')) {
    await knex.schema.alterTable('documents', (table) => {
      table.dropColumn('source_lineage_id');
      table.dropColumn('ratification_scope');
    });
  }
  if (await knex.schema.hasTable('document_lineage')) {
    await knex.schema.dropTable('document_lineage');
  }
};
