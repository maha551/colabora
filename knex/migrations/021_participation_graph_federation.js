/**
 * Participation Graph Phase 4: federation participations and org-as-member edges.
 */

exports.up = async function up(knex) {
  if (!(await knex.schema.hasColumn('organization_relationships', 'membership_subject'))) {
    await knex.schema.alterTable('organization_relationships', (table) => {
      table.text('membership_subject').notNullable().defaultTo('user');
    });
  }

  if (!(await knex.schema.hasTable('organization_participations'))) {
    await knex.schema.createTable('organization_participations', (table) => {
      table.text('id').primary();
      table.text('organization_id').notNullable()
        .references('id').inTable('organizations').onDelete('CASCADE');
      table.text('user_id').nullable()
        .references('id').inTable('users').onDelete('CASCADE');
      table.text('subject_org_id').nullable()
        .references('id').inTable('organizations').onDelete('CASCADE');
      table.text('participation_kind').notNullable();
      table.text('granted_via_edge_id').nullable()
        .references('id').inTable('organization_relationships').onDelete('SET NULL');
      table.text('granted_via_org_id').nullable()
        .references('id').inTable('organizations').onDelete('SET NULL');
      table.text('status').notNullable().defaultTo('active');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.index(['organization_id', 'participation_kind'], 'idx_org_participations_org_kind');
      table.index(['user_id', 'organization_id'], 'idx_org_participations_user_org');
    });
  }

  if (!(await knex.schema.hasColumn('organization_governance_rules', 'federation_electorate_mode'))) {
    await knex.schema.alterTable('organization_governance_rules', (table) => {
      table.text('federation_electorate_mode').notNullable().defaultTo('all_members');
    });
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasColumn('organization_governance_rules', 'federation_electorate_mode')) {
    await knex.schema.alterTable('organization_governance_rules', (table) => {
      table.dropColumn('federation_electorate_mode');
    });
  }
  if (await knex.schema.hasTable('organization_participations')) {
    await knex.schema.dropTable('organization_participations');
  }
  if (await knex.schema.hasColumn('organization_relationships', 'membership_subject')) {
    await knex.schema.alterTable('organization_relationships', (table) => {
      table.dropColumn('membership_subject');
    });
  }
};
