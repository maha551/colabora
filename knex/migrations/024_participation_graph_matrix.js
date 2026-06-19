/**
 * Participation Graph Phase 7: matrix link governance.
 */

exports.up = async function up(knex) {
  const cols = [
    ['matrix_links_enabled', (t, n) => t.boolean(n).notNullable().defaultTo(false)],
    ['matrix_electorate_mode', (t, n) => t.text(n).notNullable().defaultTo('project_only')],
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
  for (const name of ['matrix_links_enabled', 'matrix_electorate_mode']) {
    if (await knex.schema.hasColumn('organization_governance_rules', name)) {
      await knex.schema.alterTable('organization_governance_rules', (table) => {
        table.dropColumn(name);
      });
    }
  }
};
