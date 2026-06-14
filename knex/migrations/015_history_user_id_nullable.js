/**
 * Allow NULL history.user_id for system-initiated paragraph history entries.
 *
 * When a previously-approved proposal falls back below the acceptance
 * threshold, the resulting history entry is created by the system rather than
 * by a specific user. The NOT NULL constraint on history.user_id previously
 * caused those inserts to fail. The foreign key to users(id) is retained and a
 * NULL value is permitted (and ignored by the FK check).
 */

exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE history
    ALTER COLUMN user_id DROP NOT NULL
  `);
};

exports.down = async function down(knex) {
  await knex.raw(`
    ALTER TABLE history
    ALTER COLUMN user_id SET NOT NULL
  `);
};
