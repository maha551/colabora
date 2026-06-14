/**
 * Wire participation deadlines on scheduling polls: backfill response_deadline,
 * add participation_closed_at and participation_reminder_sent_at, add scheduler index.
 */

exports.up = async function up(knex) {
  const hasClosedAt = await knex.schema.hasColumn('scheduling_polls', 'participation_closed_at');
  if (!hasClosedAt) {
    await knex.schema.alterTable('scheduling_polls', (table) => {
      table.timestamp('participation_closed_at', { useTz: true }).nullable();
      table.timestamp('participation_reminder_sent_at', { useTz: true }).nullable();
    });
  }

  // Backfill open polls without a deadline to created_at + 3 days
  await knex.raw(`
    UPDATE scheduling_polls
    SET response_deadline = created_at + INTERVAL '3 days'
    WHERE status = 'open'
      AND response_deadline IS NULL
  `);

  const hasIndex = await knex.schema.hasTable('scheduling_polls');
  if (hasIndex) {
    const indexCheck = await knex.raw(`
      SELECT 1 FROM pg_indexes
      WHERE indexname = 'idx_scheduling_polls_open_deadline'
      LIMIT 1
    `).catch(() => ({ rows: [] }));

    if (!indexCheck.rows || indexCheck.rows.length === 0) {
      await knex.raw(`
        CREATE INDEX IF NOT EXISTS idx_scheduling_polls_open_deadline
        ON scheduling_polls (status, response_deadline)
        WHERE status = 'open'
      `).catch(async () => {
        await knex.schema.alterTable('scheduling_polls', (table) => {
          table.index(['status', 'response_deadline'], 'idx_scheduling_polls_status_deadline');
        });
      });
    }
  }
};

exports.down = async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_scheduling_polls_open_deadline');
  await knex.raw('DROP INDEX IF EXISTS idx_scheduling_polls_status_deadline');

  const hasClosedAt = await knex.schema.hasColumn('scheduling_polls', 'participation_closed_at');
  if (hasClosedAt) {
    await knex.schema.alterTable('scheduling_polls', (table) => {
      table.dropColumn('participation_closed_at');
      table.dropColumn('participation_reminder_sent_at');
    });
  }
};
