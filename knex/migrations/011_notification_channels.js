/**
 * Multi-channel notification foundation: endpoints, telegram link tokens,
 * and channel_preferences JSONB on notification_preferences.
 */

const DEFAULT_CHANNEL_PREFERENCES = JSON.stringify({
  email: { enabled: true, immediate: true, digestFrequency: 'monthly' },
  push: { enabled: false, immediate: true, digest: true },
  telegram: { enabled: false, immediate: true, digest: true },
});

exports.up = async function up(knex) {
  const client = knex.client.config.client;
  const isPg = client === 'pg' || client === 'postgresql';

  const hasEndpoints = await knex.schema.hasTable('notification_channel_endpoints');
  if (!hasEndpoints) {
    await knex.schema.createTable('notification_channel_endpoints', (table) => {
      if (isPg) {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.jsonb('endpoint_data').notNullable().defaultTo('{}');
      } else {
        table.text('id').primary();
        table.text('endpoint_data').notNullable().defaultTo('{}');
      }
      table.text('user_id').notNullable();
      table.text('channel').notNullable();
      table.timestamp('verified_at', { useTz: false }).nullable();
      table.timestamp('revoked_at', { useTz: false }).nullable();
      table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(knex.fn.now());

      table
        .foreign('user_id')
        .references('id')
        .inTable('users')
        .onDelete('CASCADE');

      table.index(['user_id'], 'idx_notification_channel_endpoints_user_id');
      table.index(['user_id', 'channel'], 'idx_notification_channel_endpoints_user_channel');
    });

    if (isPg) {
      await knex.raw(`
        ALTER TABLE notification_channel_endpoints
        ADD CONSTRAINT notification_channel_endpoints_channel_check
        CHECK (channel = ANY (ARRAY['push'::text, 'telegram'::text]))
      `);
      await knex.raw(`
        CREATE UNIQUE INDEX notification_channel_endpoints_one_active_telegram
        ON notification_channel_endpoints (user_id)
        WHERE channel = 'telegram' AND revoked_at IS NULL
      `);
    }
  }

  const hasLinkTokens = await knex.schema.hasTable('telegram_link_tokens');
  if (!hasLinkTokens) {
    await knex.schema.createTable('telegram_link_tokens', (table) => {
      table.text('token').primary();
      table.text('user_id').notNullable();
      table.timestamp('expires_at', { useTz: false }).notNullable();
      table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(knex.fn.now());

      table
        .foreign('user_id')
        .references('id')
        .inTable('users')
        .onDelete('CASCADE');

      table.index(['user_id'], 'idx_telegram_link_tokens_user_id');
      table.index(['expires_at'], 'idx_telegram_link_tokens_expires_at');
    });
  }

  const hasChannelPrefs = await knex.schema.hasColumn('notification_preferences', 'channel_preferences');
  if (!hasChannelPrefs) {
    if (isPg) {
      await knex.schema.alterTable('notification_preferences', (table) => {
        table.jsonb('channel_preferences').nullable();
      });
    } else {
      await knex.schema.alterTable('notification_preferences', (table) => {
        table.text('channel_preferences').nullable();
      });
    }

    if (isPg) {
      await knex.raw(`
        UPDATE notification_preferences
        SET channel_preferences = jsonb_build_object(
          'email', jsonb_build_object(
            'enabled', COALESCE(email_enabled, true),
            'immediate', COALESCE(immediate_notifications_enabled, true),
            'digestFrequency', COALESCE(digest_frequency, 'monthly')
          ),
          'push', jsonb_build_object(
            'enabled', false,
            'immediate', true,
            'digest', true
          ),
          'telegram', jsonb_build_object(
            'enabled', false,
            'immediate', true,
            'digest', true
          )
        )
        WHERE channel_preferences IS NULL
      `);
      await knex.raw(`
        ALTER TABLE notification_preferences
        ALTER COLUMN channel_preferences
        SET DEFAULT '${DEFAULT_CHANNEL_PREFERENCES}'::jsonb
      `);
      await knex.raw(`
        UPDATE notification_preferences
        SET channel_preferences = '${DEFAULT_CHANNEL_PREFERENCES}'::jsonb
        WHERE channel_preferences IS NULL
      `);
      await knex.raw(`
        ALTER TABLE notification_preferences
        ALTER COLUMN channel_preferences SET NOT NULL
      `);
    } else {
      await knex('notification_preferences')
        .whereNull('channel_preferences')
        .update({ channel_preferences: DEFAULT_CHANNEL_PREFERENCES });
    }
  }
};

exports.down = async function down(knex) {
  const hasChannelPrefs = await knex.schema.hasColumn('notification_preferences', 'channel_preferences');
  if (hasChannelPrefs) {
    await knex.schema.alterTable('notification_preferences', (table) => {
      table.dropColumn('channel_preferences');
    });
  }

  const hasLinkTokens = await knex.schema.hasTable('telegram_link_tokens');
  if (hasLinkTokens) {
    await knex.schema.dropTable('telegram_link_tokens');
  }

  const hasEndpoints = await knex.schema.hasTable('notification_channel_endpoints');
  if (hasEndpoints) {
    const client = knex.client.config.client;
    if (client === 'pg' || client === 'postgresql') {
      await knex.raw('DROP INDEX IF EXISTS notification_channel_endpoints_one_active_telegram');
    }
    await knex.schema.dropTable('notification_channel_endpoints');
  }
};
