/**
 * Participation Graph Phase 6: network governance flags.
 */

exports.up = async function up(knex) {
  const cols = [
    ['networks_enabled', (t, n) => t.boolean(n).notNullable().defaultTo(false)],
    ['network_membership_model', (t, n) => t.text(n).notNullable().defaultTo('open_affiliate')],
    ['affiliate_requires_vote', (t, n) => t.boolean(n).notNullable().defaultTo(false)],
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
  for (const name of ['networks_enabled', 'network_membership_model', 'affiliate_requires_vote']) {
    if (await knex.schema.hasColumn('organization_governance_rules', name)) {
      await knex.schema.alterTable('organization_governance_rules', (table) => {
        table.dropColumn(name);
      });
    }
  }
};
