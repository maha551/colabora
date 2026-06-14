/**
 * Document lifecycle actual timestamps + amendment adoption governance fields.
 */

exports.up = async function up(knex) {
  const docCols = [
    ['proposal_ended_at', (t) => t.timestamp('proposal_ended_at', { useTz: false })],
    ['voting_ended_at', (t) => t.timestamp('voting_ended_at', { useTz: false })],
    ['amendments_closed_at', (t) => t.timestamp('amendments_closed_at', { useTz: false })],
    ['amendment_adoption_vote_id', (t) => t.text('amendment_adoption_vote_id')],
    ['amendment_snapshot_json', (t) => t.text('amendment_snapshot_json')],
  ];

  for (const [name, add] of docCols) {
    const has = await knex.schema.hasColumn('documents', name);
    if (!has) {
      await knex.schema.alterTable('documents', add);
    }
  }

  const hasAmendmentCandidate = await knex.schema.hasColumn('proposals', 'amendment_candidate');
  if (!hasAmendmentCandidate) {
    await knex.schema.alterTable('proposals', (table) => {
      table.boolean('amendment_candidate').defaultTo(false);
    });
  }

  // Backfill lifecycle timestamps from existing columns
  await knex.raw(`
    UPDATE documents
    SET proposal_ended_at = voting_started_at
    WHERE voting_started_at IS NOT NULL AND proposal_ended_at IS NULL
  `);
  await knex.raw(`
    UPDATE documents
    SET voting_ended_at = adopted_at
    WHERE status = 'agreed' AND adopted_at IS NOT NULL AND voting_ended_at IS NULL
  `);
  await knex.raw(`
    UPDATE documents
    SET voting_ended_at = updated_at
    WHERE status IN ('rejected', 'expired')
      AND voting_started_at IS NOT NULL
      AND voting_ended_at IS NULL
  `);
  await knex.raw(`
    UPDATE documents
    SET amendments_closed_at = adopted_at
    WHERE status = 'agreed'
      AND (amendments_open = 0 OR amendments_open IS NULL)
      AND adopted_at IS NOT NULL
      AND amendments_closed_at IS NULL
  `);

  // Extend organization_votes vote_type CHECK (PostgreSQL)
  const client = knex.client.config.client;
  if (client === 'pg' || client === 'postgresql') {
    await knex.raw(`
      ALTER TABLE organization_votes
      DROP CONSTRAINT IF EXISTS organization_votes_vote_type_check
    `);
    await knex.raw(`
      ALTER TABLE organization_votes
      ADD CONSTRAINT organization_votes_vote_type_check
      CHECK (vote_type = ANY (ARRAY[
        'policy'::text,
        'document_change'::text,
        'document_amendment_adoption'::text,
        'membership'::text,
        'dissolution'::text,
        'other'::text,
        'representative_removal'::text
      ]))
    `);
  }
};

exports.down = async function down(knex) {
  const client = knex.client.config.client;
  if (client === 'pg' || client === 'postgresql') {
    await knex.raw(`
      ALTER TABLE organization_votes
      DROP CONSTRAINT IF EXISTS organization_votes_vote_type_check
    `);
    await knex.raw(`
      ALTER TABLE organization_votes
      ADD CONSTRAINT organization_votes_vote_type_check
      CHECK (vote_type = ANY (ARRAY[
        'policy'::text,
        'document_change'::text,
        'membership'::text,
        'dissolution'::text,
        'other'::text,
        'representative_removal'::text
      ]))
    `);
  }

  const dropDocCols = [
    'proposal_ended_at',
    'voting_ended_at',
    'amendments_closed_at',
    'amendment_adoption_vote_id',
    'amendment_snapshot_json',
  ];
  for (const name of dropDocCols) {
    const has = await knex.schema.hasColumn('documents', name);
    if (has) {
      await knex.schema.alterTable('documents', (table) => {
        table.dropColumn(name);
      });
    }
  }

  const hasAmendmentCandidate = await knex.schema.hasColumn('proposals', 'amendment_candidate');
  if (hasAmendmentCandidate) {
    await knex.schema.alterTable('proposals', (table) => {
      table.dropColumn('amendment_candidate');
    });
  }
};
