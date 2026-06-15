/**
 * Participation Graph Phase 1: tree columns on organizations + organization_relationships.
 */

exports.up = async function up(knex) {
  const hasPrimaryParent = await knex.schema.hasColumn('organizations', 'primary_parent_id');
  if (!hasPrimaryParent) {
    await knex.schema.alterTable('organizations', (table) => {
      table.text('primary_parent_id').nullable()
        .references('id').inTable('organizations').onDelete('RESTRICT');
      table.text('org_kind').notNullable().defaultTo('standard');
      table.text('participation_profile').notNullable().defaultTo('classical_committee');
      table.text('created_by_user_id').nullable()
        .references('id').inTable('users').onDelete('SET NULL');
      table.integer('tree_depth').notNullable().defaultTo(0);
      table.text('tree_path').nullable();
      table.text('participation_graph_root_id').nullable()
        .references('id').inTable('organizations').onDelete('SET NULL');
    });
  }

  const hasRelationships = await knex.schema.hasTable('organization_relationships');
  if (!hasRelationships) {
    await knex.schema.createTable('organization_relationships', (table) => {
      table.text('id').primary();
      table.text('source_org_id').notNullable()
        .references('id').inTable('organizations').onDelete('CASCADE');
      table.text('target_org_id').notNullable()
        .references('id').inTable('organizations').onDelete('CASCADE');
      table.text('relationship_type').notNullable();
      table.text('config_json').nullable();
      table.text('status').notNullable().defaultTo('active');
      table.text('created_by_vote_id').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.index(['source_org_id', 'relationship_type'], 'idx_org_rel_source_type');
      table.index(['target_org_id', 'relationship_type'], 'idx_org_rel_target_type');
      table.unique(['source_org_id', 'target_org_id', 'relationship_type'], {
        indexName: 'uq_org_rel_source_target_type',
      });
    });
  }

  const hasTreePath = await knex.schema.hasColumn('organizations', 'tree_path');
  if (hasTreePath) {
    await knex.raw(`
      UPDATE organizations
      SET tree_path = '/' || id,
          tree_depth = 0,
          participation_graph_root_id = id
      WHERE tree_path IS NULL
    `);
  }

  const indexCheck = await knex.raw(`
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_organizations_primary_parent_id' LIMIT 1
  `).catch(() => ({ rows: [] }));

  if (!indexCheck.rows || indexCheck.rows.length === 0) {
    await knex.schema.alterTable('organizations', (table) => {
      table.index(['primary_parent_id'], 'idx_organizations_primary_parent_id');
      table.index(['participation_graph_root_id'], 'idx_organizations_participation_graph_root');
    }).catch(() => {});
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable('organization_relationships')) {
    await knex.schema.dropTable('organization_relationships');
  }

  const hasPrimaryParent = await knex.schema.hasColumn('organizations', 'primary_parent_id');
  if (hasPrimaryParent) {
    await knex.schema.alterTable('organizations', (table) => {
      table.dropColumn('primary_parent_id');
      table.dropColumn('org_kind');
      table.dropColumn('participation_profile');
      table.dropColumn('created_by_user_id');
      table.dropColumn('tree_depth');
      table.dropColumn('tree_path');
      table.dropColumn('participation_graph_root_id');
    });
  }
};
