exports.up = async function up(knex) {
  await knex.schema.createTable('meeting_decisions', (table) => {
    table.text('id').primary();
    table.text('meeting_id').notNullable();
    table.text('minutes_document_id').nullable();
    table.text('agenda_item_id').nullable();
    table.text('meeting_vote_id').nullable();
    table.text('source_event_id').nullable();
    table.text('title').nullable();
    table.text('text').notNullable().defaultTo('');
    table.text('status').notNullable().defaultTo('recorded');
    table.bigInteger('order_index').notNullable().defaultTo(0);
    table.text('created_by_user_id').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table
      .foreign('meeting_id')
      .references('id')
      .inTable('meetings')
      .onDelete('CASCADE');
    table
      .foreign('minutes_document_id')
      .references('id')
      .inTable('documents')
      .onDelete('CASCADE');
    table
      .foreign('agenda_item_id')
      .references('id')
      .inTable('meeting_agenda_items')
      .onDelete('SET NULL');
    table
      .foreign('meeting_vote_id')
      .references('id')
      .inTable('meeting_votes')
      .onDelete('SET NULL');
    table
      .foreign('source_event_id')
      .references('id')
      .inTable('meeting_minutes_events')
      .onDelete('SET NULL');
    table
      .foreign('created_by_user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    table.index(['meeting_id', 'created_at'], 'idx_meeting_decisions_meeting_created');
    table.index(['meeting_vote_id'], 'idx_meeting_decisions_vote');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('meeting_decisions');
};
