/**
 * Persist resolved document deletion outcomes for the unified decisions timeline.
 */

exports.up = async function up(knex) {
  await knex.schema.createTable('decisions_audit', (table) => {
    table.text('id').primary();
    table.text('kind').notNullable();
    table.text('outcome').notNullable();
    table.text('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.text('document_id').nullable().references('id').inTable('documents').onDelete('SET NULL');
    table.text('document_title');
    table.integer('pro_votes').notNullable().defaultTo(0);
    table.integer('contra_votes').notNullable().defaultTo(0);
    table.integer('neutral_votes').notNullable().defaultTo(0);
    table.integer('total_eligible_voters').notNullable().defaultTo(0);
    table.decimal('approval_percentage', 8, 2);
    table.decimal('threshold', 8, 2);
    table.text('changed_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(['organization_id', 'created_at'], 'idx_decisions_audit_org_created');
    table.index(['kind', 'created_at'], 'idx_decisions_audit_kind_created');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('decisions_audit');
};
