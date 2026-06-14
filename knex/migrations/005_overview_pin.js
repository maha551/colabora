exports.up = async function up(knex) {
  const hasColumn = await knex.schema.hasColumn('organizations', 'overview_pinned_event_id');
  if (!hasColumn) {
    await knex.schema.alterTable('organizations', (table) => {
      table.text('overview_pinned_event_id').nullable();
      table.timestamp('overview_pinned_at').nullable();
      table.text('overview_pinned_by_user_id').nullable();
    });
  }
};

exports.down = async function down(knex) {
  const hasColumn = await knex.schema.hasColumn('organizations', 'overview_pinned_event_id');
  if (hasColumn) {
    await knex.schema.alterTable('organizations', (table) => {
      table.dropColumn('overview_pinned_event_id');
      table.dropColumn('overview_pinned_at');
      table.dropColumn('overview_pinned_by_user_id');
    });
  }
};
