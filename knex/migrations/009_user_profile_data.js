/**
 * Add profile_data JSON column to users for public-facing profile fields.
 */

exports.up = async function up(knex) {
  const hasColumn = await knex.schema.hasColumn('users', 'profile_data');
  if (!hasColumn) {
    await knex.schema.alterTable('users', (table) => {
      table.text('profile_data').defaultTo('{}');
    });
  }
};

exports.down = async function down(knex) {
  const hasColumn = await knex.schema.hasColumn('users', 'profile_data');
  if (hasColumn) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('profile_data');
    });
  }
};
