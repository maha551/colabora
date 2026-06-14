/**
 * Platform admin: user suspension, org hard-delete FK support, platform audit log.
 */

async function dropFkIfExists(knex, table, constraintName) {
  await knex.raw(`
    ALTER TABLE ${table}
    DROP CONSTRAINT IF EXISTS ${constraintName}
  `);
}

exports.up = async function up(knex) {
  const hasUserIsActive = await knex.schema.hasColumn('users', 'is_active');
  if (!hasUserIsActive) {
    await knex.schema.alterTable('users', (table) => {
      table.boolean('is_active').notNullable().defaultTo(true);
      table.timestamp('suspended_at').nullable();
      table.text('suspended_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.text('suspension_reason').nullable();
    });
  }

  const hasDeletedAt = await knex.schema.hasColumn('organizations', 'deleted_at');
  if (!hasDeletedAt) {
    await knex.schema.alterTable('organizations', (table) => {
      table.timestamp('deleted_at').nullable();
    });
  }

  const hasPlatformAudit = await knex.schema.hasTable('platform_audit');
  if (!hasPlatformAudit) {
    await knex.schema.createTable('platform_audit', (table) => {
      table.text('id').primary();
      table.text('admin_user_id').notNullable().references('id').inTable('users').onDelete('SET NULL');
      table.text('action').notNullable();
      table.text('target_type').nullable();
      table.text('target_id').nullable();
      table.text('details').nullable();
      table.text('ip_address').nullable();
      table.text('user_agent').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.index(['created_at'], 'idx_platform_audit_created_at');
      table.index(['admin_user_id'], 'idx_platform_audit_admin_user_id');
      table.index(['target_type', 'target_id'], 'idx_platform_audit_target');
    });
  }

  const client = knex.client.config.client;
  if (client === 'pg' || client === 'postgresql') {
    await dropFkIfExists(knex, 'organization_members', 'organization_members_organization_id_fkey');
    await knex.raw(`
      ALTER TABLE organization_members
      ADD CONSTRAINT organization_members_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
    `);

    const hasReceipts = await knex.schema.hasTable('user_vote_receipts');
    if (hasReceipts) {
      await dropFkIfExists(knex, 'user_vote_receipts', 'user_vote_receipts_organization_id_foreign');
      await dropFkIfExists(knex, 'user_vote_receipts', 'user_vote_receipts_organization_id_fkey');
      await knex.raw(`
        ALTER TABLE user_vote_receipts
        ADD CONSTRAINT user_vote_receipts_organization_id_fkey
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
      `);
    }
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable('platform_audit')) {
    await knex.schema.dropTable('platform_audit');
  }

  if (await knex.schema.hasColumn('organizations', 'deleted_at')) {
    await knex.schema.alterTable('organizations', (table) => {
      table.dropColumn('deleted_at');
    });
  }

  if (await knex.schema.hasColumn('users', 'is_active')) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('is_active');
      table.dropColumn('suspended_at');
      table.dropColumn('suspended_by');
      table.dropColumn('suspension_reason');
    });
  }

  const client = knex.client.config.client;
  if (client === 'pg' || client === 'postgresql') {
    await dropFkIfExists(knex, 'organization_members', 'organization_members_organization_id_fkey');
    await knex.raw(`
      ALTER TABLE organization_members
      ADD CONSTRAINT organization_members_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
    `);

    const hasReceipts = await knex.schema.hasTable('user_vote_receipts');
    if (hasReceipts) {
      await dropFkIfExists(knex, 'user_vote_receipts', 'user_vote_receipts_organization_id_fkey');
      await knex.raw(`
        ALTER TABLE user_vote_receipts
        ADD CONSTRAINT user_vote_receipts_organization_id_fkey
        FOREIGN KEY (organization_id) REFERENCES organizations(id)
      `);
    }
  }
};
