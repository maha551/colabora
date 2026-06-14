/**
 * User vote receipts (server-side convenience store) and meeting vote verifiability columns.
 */

exports.up = async function up(knex) {
  const hasReceiptsTable = await knex.schema.hasTable('user_vote_receipts');
  if (!hasReceiptsTable) {
    await knex.schema.createTable('user_vote_receipts', (table) => {
      table.text('id').primary();
      table.text('user_id').notNullable().references('id').inTable('users');
      table.text('organization_id').notNullable().references('id').inTable('organizations');
      table.text('vote_type').notNullable();
      table.text('contest_id').notNullable();
      table.text('receipt_id').notNullable();
      table.text('contest_title').nullable();
      table.timestamp('vote_recorded_at').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['user_id', 'vote_type', 'contest_id']);
      table.index(['user_id', 'organization_id'], 'idx_user_vote_receipts_user_org');
    });
  }

  const hasMeetingReceipt = await knex.schema.hasColumn('meeting_vote_responses', 'receipt_id');
  if (!hasMeetingReceipt) {
    await knex.schema.alterTable('meeting_vote_responses', (table) => {
      table.text('receipt_id').nullable();
      table.text('vote_hash').nullable();
    });
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable('user_vote_receipts')) {
    await knex.schema.dropTable('user_vote_receipts');
  }
  if (await knex.schema.hasColumn('meeting_vote_responses', 'receipt_id')) {
    await knex.schema.alterTable('meeting_vote_responses', (table) => {
      table.dropColumn('receipt_id');
      table.dropColumn('vote_hash');
    });
  }
};
