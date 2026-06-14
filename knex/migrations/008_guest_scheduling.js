exports.up = async function up(knex) {
  const hasGuestLinkId = await knex.schema.hasColumn('scheduling_polls', 'guest_link_id');
  if (!hasGuestLinkId) {
    await knex.schema.alterTable('scheduling_polls', (table) => {
      table.text('guest_link_id').nullable();
      table.timestamp('response_deadline').nullable();
    });
  }

  const hasGuestLinks = await knex.schema.hasTable('scheduling_poll_guest_links');
  if (!hasGuestLinks) {
    await knex.schema.createTable('scheduling_poll_guest_links', (table) => {
      table.text('id').primary();
      table.text('scheduling_poll_id').notNullable();
      table.text('token').notNullable().unique();
      table.text('status').notNullable().defaultTo('active');
      table.timestamp('expires_at').notNullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('revoked_at').nullable();

      table
        .foreign('scheduling_poll_id')
        .references('id')
        .inTable('scheduling_polls')
        .onDelete('CASCADE');

      table.index(['scheduling_poll_id', 'status'], 'idx_scheduling_poll_guest_links_poll_status');
    });
  }

  const hasGuestRespondents = await knex.schema.hasTable('scheduling_poll_guest_respondents');
  if (!hasGuestRespondents) {
    await knex.schema.createTable('scheduling_poll_guest_respondents', (table) => {
      table.text('id').primary();
      table.text('scheduling_poll_id').notNullable();
      table.text('display_name').notNullable().defaultTo('Guest');
      table.text('session_token').notNullable().unique();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('last_seen_at').notNullable().defaultTo(knex.fn.now());

      table
        .foreign('scheduling_poll_id')
        .references('id')
        .inTable('scheduling_polls')
        .onDelete('CASCADE');

      table.index(['scheduling_poll_id'], 'idx_scheduling_poll_guest_respondents_poll');
    });
  }

  const hasGuestResponses = await knex.schema.hasTable('scheduling_poll_guest_responses');
  if (!hasGuestResponses) {
    await knex.schema.createTable('scheduling_poll_guest_responses', (table) => {
      table.text('id').primary();
      table.text('slot_id').notNullable();
      table.text('guest_respondent_id').notNullable();
      table.text('response').notNullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

      table
        .foreign('slot_id')
        .references('id')
        .inTable('scheduling_poll_slots')
        .onDelete('CASCADE');
      table
        .foreign('guest_respondent_id')
        .references('id')
        .inTable('scheduling_poll_guest_respondents')
        .onDelete('CASCADE');

      table.unique(['slot_id', 'guest_respondent_id'], 'scheduling_poll_guest_responses_slot_respondent_key');
      table.index(['slot_id'], 'idx_scheduling_poll_guest_responses_slot');
    });

    await knex.raw(`
      ALTER TABLE scheduling_poll_guest_responses
      ADD CONSTRAINT scheduling_poll_guest_responses_response_check
      CHECK (response = ANY (ARRAY['yes'::text, 'no'::text, 'maybe'::text]))
    `);
  }

  const hasGuestLinkIdFk = await knex.schema.hasColumn('scheduling_polls', 'guest_link_id');
  if (hasGuestLinkIdFk) {
    const fkExists = await knex.raw(`
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'scheduling_polls_guest_link_id_fkey'
      AND table_name = 'scheduling_polls'
    `);
    if (!fkExists.rows || fkExists.rows.length === 0) {
      await knex.schema.alterTable('scheduling_polls', (table) => {
        table
          .foreign('guest_link_id')
          .references('id')
          .inTable('scheduling_poll_guest_links')
          .onDelete('SET NULL');
      });
    }
  }
};

exports.down = async function down(knex) {
  const hasGuestLinkId = await knex.schema.hasColumn('scheduling_polls', 'guest_link_id');
  if (hasGuestLinkId) {
    await knex.schema.alterTable('scheduling_polls', (table) => {
      table.dropForeign(['guest_link_id']);
      table.dropColumn('guest_link_id');
      table.dropColumn('response_deadline');
    });
  }

  await knex.schema.dropTableIfExists('scheduling_poll_guest_responses');
  await knex.schema.dropTableIfExists('scheduling_poll_guest_respondents');
  await knex.schema.dropTableIfExists('scheduling_poll_guest_links');
};
