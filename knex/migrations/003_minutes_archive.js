exports.up = async function up(knex) {
  await knex.schema.createTable('minutes_document_blocks', (table) => {
    table.text('id').primary();
    table.text('meeting_id').notNullable();
    table.text('minutes_document_id').notNullable();
    table.text('block_type').notNullable();
    table.text('status').notNullable().defaultTo('recorded');
    table.bigInteger('order_index').notNullable().defaultTo(0);
    table.timestamp('occurred_at').nullable();
    table.text('agenda_item_id').nullable();
    table.text('source_timeline_item_id').nullable();
    table.text('entity_key').notNullable();
    table.text('entity_version').nullable();
    table.text('payload_json').nullable();
    table.text('created_by_user_id').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('archived_at').nullable();

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
      .foreign('created_by_user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    table.index(['meeting_id', 'order_index', 'created_at'], 'idx_minutes_blocks_meeting_order');
    table.index(['minutes_document_id', 'created_at'], 'idx_minutes_blocks_document_created');
    table.index(['entity_key', 'entity_version'], 'idx_minutes_blocks_entity_version');
    table.index(['meeting_id', 'entity_key', 'created_at'], 'idx_minutes_blocks_meeting_entity');
  });

  await knex.schema.createTable('minutes_archive_versions', (table) => {
    table.text('id').primary();
    table.text('meeting_id').notNullable();
    table.text('minutes_document_id').notNullable();
    table.integer('version_number').notNullable();
    table.timestamp('frozen_at').notNullable().defaultTo(knex.fn.now());
    table.text('frozen_by_user_id').nullable();
    table.text('hash').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

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
      .foreign('frozen_by_user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    table.unique(['meeting_id', 'version_number'], 'uq_minutes_archive_meeting_version');
    table.index(['minutes_document_id', 'version_number'], 'idx_minutes_archive_document_version');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('minutes_archive_versions');
  await knex.schema.dropTableIfExists('minutes_document_blocks');
};
