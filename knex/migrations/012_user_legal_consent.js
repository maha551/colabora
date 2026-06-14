/**
 * Store terms/privacy acceptance at registration for audit.
 */

exports.up = async function up(knex) {
  const hasTermsAcceptedAt = await knex.schema.hasColumn('users', 'terms_accepted_at');
  if (!hasTermsAcceptedAt) {
    await knex.schema.alterTable('users', (table) => {
      table.timestamp('terms_accepted_at').nullable();
      table.text('terms_version').nullable();
      table.text('privacy_version').nullable();
    });
  }
};

exports.down = async function down(knex) {
  const hasTermsAcceptedAt = await knex.schema.hasColumn('users', 'terms_accepted_at');
  if (hasTermsAcceptedAt) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('terms_accepted_at');
      table.dropColumn('terms_version');
      table.dropColumn('privacy_version');
    });
  }
};
