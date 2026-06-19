/**
 * Participation Graph Phase 3: meeting decision ↔ organization vote traceability.
 */

exports.up = async function up(knex) {
  if (!(await knex.schema.hasColumn('meeting_decisions', 'organization_vote_id'))) {
    await knex.schema.alterTable('meeting_decisions', (table) => {
      table.text('organization_vote_id').nullable();
      table
        .foreign('organization_vote_id')
        .references('id')
        .inTable('organization_votes')
        .onDelete('SET NULL');
      table.index(['organization_vote_id'], 'idx_meeting_decisions_org_vote');
    });
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasColumn('meeting_decisions', 'organization_vote_id')) {
    await knex.schema.alterTable('meeting_decisions', (table) => {
      table.dropIndex(['organization_vote_id'], 'idx_meeting_decisions_org_vote');
      table.dropColumn('organization_vote_id');
    });
  }
};
