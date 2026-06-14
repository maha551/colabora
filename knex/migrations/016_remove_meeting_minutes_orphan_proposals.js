/**
 * Remove orphan paragraph proposals on meeting_minutes documents.
 *
 * Minutes use direct-write editing, not the proposal/voting workflow. Legacy
 * createMinutesDocument incorrectly reused createInitialParagraph, leaving
 * unapproved TITLE proposals (e.g. "Agenda") that surfaced in the activity feed.
 */

exports.up = async function up(knex) {
  await knex.raw(`
    DELETE FROM comments c
    WHERE c.commentable_type = 'proposal'
      AND c.commentable_id IN (
        SELECT p.id
        FROM proposals p
        JOIN paragraphs par ON p.paragraph_id = par.id
        JOIN documents d ON par.document_id = d.id
        WHERE d.document_kind = 'meeting_minutes'
      )
  `);

  await knex.raw(`
    DELETE FROM votes v
    WHERE v.proposal_id IN (
      SELECT p.id
      FROM proposals p
      JOIN paragraphs par ON p.paragraph_id = par.id
      JOIN documents d ON par.document_id = d.id
      WHERE d.document_kind = 'meeting_minutes'
    )
  `);

  await knex.raw(`
    DELETE FROM proposals p
    USING paragraphs par, documents d
    WHERE p.paragraph_id = par.id
      AND par.document_id = d.id
      AND d.document_kind = 'meeting_minutes'
  `);
};

exports.down = async function down() {
  // Data cleanup is not reversible.
};
