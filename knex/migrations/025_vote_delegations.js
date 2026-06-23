/**
 * Participation Graph Phase 8: liquid/proxy vote delegations.
 */

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('vote_delegations'))) {
    await knex.schema.createTable('vote_delegations', (table) => {
      table.text('id').primary();
      table.text('organization_id').notNullable()
        .references('id').inTable('organizations').onDelete('CASCADE');
      table.text('delegator_user_id').notNullable()
        .references('id').inTable('users').onDelete('CASCADE');
      table.text('delegate_user_id').notNullable()
        .references('id').inTable('users').onDelete('CASCADE');
      table.text('delegation_mode').notNullable().defaultTo('global');
      table.text('domain_tag').nullable();
      table.text('target_contest_type').nullable();
      table.text('target_contest_id').nullable();
      table.timestamp('effective_from').nullable();
      table.timestamp('effective_until').nullable();
      table.timestamp('revoked_at').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.index(['organization_id', 'delegate_user_id'], 'idx_vote_delegations_org_delegate');
      table.index(['delegator_user_id', 'organization_id'], 'idx_vote_delegations_delegator_org');
    });
  }

  const cols = [
    ['liquid_delegation_enabled', (t, n) => t.boolean(n).notNullable().defaultTo(false)],
    ['proxy_voting_enabled', (t, n) => t.boolean(n).notNullable().defaultTo(false)],
    ['max_delegation_depth', (t, n) => t.integer(n).nullable()],
    ['allow_transitive_delegation', (t, n) => t.boolean(n).notNullable().defaultTo(false)],
    ['domain_tags_enabled', (t, n) => t.boolean(n).notNullable().defaultTo(false)],
  ];
  for (const [name, addCol] of cols) {
    if (!(await knex.schema.hasColumn('organization_governance_rules', name))) {
      await knex.schema.alterTable('organization_governance_rules', (table) => {
        addCol(table, name);
      });
    }
  }
};

exports.down = async function down(knex) {
  for (const name of ['liquid_delegation_enabled', 'proxy_voting_enabled', 'max_delegation_depth', 'allow_transitive_delegation', 'domain_tags_enabled']) {
    if (await knex.schema.hasColumn('organization_governance_rules', name)) {
      await knex.schema.alterTable('organization_governance_rules', (table) => {
        table.dropColumn(name);
      });
    }
  }
  if (await knex.schema.hasTable('vote_delegations')) {
    await knex.schema.dropTable('vote_delegations');
  }
};
